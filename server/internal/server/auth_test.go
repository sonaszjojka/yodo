package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sonaszjojka/yodo/server/internal/store"
)

type authAPI struct {
	t       *testing.T
	handler http.Handler
	now     time.Time
}

func newAuthAPI(t *testing.T, password string) *authAPI {
	t.Helper()
	sqlDB, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "yodo.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	api := &authAPI{t: t, now: time.UnixMilli(1_000_000)}
	clock := func() time.Time { return api.now }
	api.handler = newHandler(builtFS, mustParse(t, "http://example.com,https://secure.example"),
		sqlDB, t.TempDir(), NewAuth(password, clock), APIToken{}, clock)
	return api
}

func (a *authAPI) do(method, path, body, origin string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	a.handler.ServeHTTP(rec, req)
	return rec
}

// login returns the session cookie of a successful login.
func (a *authAPI) login(password string, remember bool) *http.Cookie {
	a.t.Helper()
	body := `{"password":"` + password + `","remember":` + map[bool]string{true: "true", false: "false"}[remember] + `}`
	rec := a.do(http.MethodPost, "/api/session", body, "http://example.com")
	wantStatus(a.t, rec, http.StatusNoContent)
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookie {
			return c
		}
	}
	a.t.Fatal("login set no session cookie")
	return nil
}

func TestAuthDisabledLeavesEverythingOpen(t *testing.T) {
	a := newAuthAPI(t, "")
	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", ""), http.StatusOK)
	rec := a.do(http.MethodGet, "/api/session", "", "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Body.String(); !strings.Contains(got, `"passwordRequired":false`) || !strings.Contains(got, `"unlocked":true`) {
		t.Errorf("session state = %s", got)
	}
}

func TestLockedServerRequiresALogin(t *testing.T) {
	a := newAuthAPI(t, "secret")
	hash := strings.Repeat("a", 64)

	// The API is closed...
	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", ""), http.StatusUnauthorized)
	wantStatus(t, a.do(http.MethodGet, "/api/images/"+hash, "", ""), http.StatusUnauthorized)
	wantStatus(t, a.do(http.MethodPost, "/api/drawings", `{}`, "http://example.com"), http.StatusUnauthorized)
	// ...but the app shell, the health probe and the session routes are not.
	wantStatus(t, a.do(http.MethodGet, "/", "", ""), http.StatusOK)
	wantStatus(t, a.do(http.MethodGet, "/assets/app-1.js", "", ""), http.StatusOK)
	wantStatus(t, a.do(http.MethodGet, "/api/health", "", ""), http.StatusOK)
	rec := a.do(http.MethodGet, "/api/session", "", "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Body.String(); !strings.Contains(got, `"passwordRequired":true`) || !strings.Contains(got, `"unlocked":false`) {
		t.Errorf("session state = %s", got)
	}
}

func TestWrongPasswordIsRefused(t *testing.T) {
	a := newAuthAPI(t, "secret")
	rec := a.do(http.MethodPost, "/api/session", `{"password":"nope"}`, "http://example.com")
	wantStatus(t, rec, http.StatusUnauthorized)
	if len(rec.Result().Cookies()) != 0 {
		t.Errorf("a wrong password set cookies: %v", rec.Result().Cookies())
	}
	wantStatus(t, a.do(http.MethodPost, "/api/session", `not json`, "http://example.com"), http.StatusBadRequest)
}

func TestRightPasswordUnlocksTheAPI(t *testing.T) {
	a := newAuthAPI(t, "secret")
	c := a.login("secret", false)
	if !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || c.Path != "/" {
		t.Errorf("cookie = %+v, want HttpOnly, SameSite=Strict, Path=/", c)
	}
	if c.MaxAge != 0 || c.Secure {
		t.Errorf("cookie = %+v, want a browser-session cookie, not Secure over http", c)
	}

	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", "", c), http.StatusOK)
	rec := a.do(http.MethodGet, "/api/session", "", "", c)
	if !strings.Contains(rec.Body.String(), `"unlocked":true`) {
		t.Errorf("session state = %s", rec.Body.String())
	}
}

func TestRememberAndSecureCookie(t *testing.T) {
	a := newAuthAPI(t, "secret")
	rec := a.do(http.MethodPost, "/api/session", `{"password":"secret","remember":true}`, "https://secure.example")
	wantStatus(t, rec, http.StatusNoContent)
	c := rec.Result().Cookies()[0]
	if c.MaxAge != int(rememberFor/time.Second) || !c.Secure {
		t.Errorf("cookie = %+v, want a 30-day Secure cookie", c)
	}
}

func TestSessionsExpire(t *testing.T) {
	a := newAuthAPI(t, "secret")
	short, long := a.login("secret", false), a.login("secret", true)

	a.now = a.now.Add(sessionFor + time.Minute)
	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", "", short), http.StatusUnauthorized)
	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", "", long), http.StatusOK)

	a.now = a.now.Add(rememberFor)
	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", "", long), http.StatusUnauthorized)
}

func TestForgedSessionIsRefused(t *testing.T) {
	a := newAuthAPI(t, "secret")
	forged := &http.Cookie{Name: sessionCookie, Value: "AAAA"}
	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", "", forged), http.StatusUnauthorized)
}

func TestLogoutEndsTheSession(t *testing.T) {
	a := newAuthAPI(t, "secret")
	c := a.login("secret", true)
	rec := a.do(http.MethodDelete, "/api/session", "", "http://example.com", c)
	wantStatus(t, rec, http.StatusNoContent)
	if got := rec.Result().Cookies(); len(got) != 1 || got[0].MaxAge >= 0 {
		t.Errorf("logout cookies = %v, want the cookie cleared", got)
	}
	wantStatus(t, a.do(http.MethodGet, "/api/drawings", "", "", c), http.StatusUnauthorized)
}

func TestLogoutOverHTTPSClearsASecureCookie(t *testing.T) {
	a := newAuthAPI(t, "secret")
	c := a.login("secret", false)
	rec := a.do(http.MethodDelete, "/api/session", "", "https://secure.example", c)
	wantStatus(t, rec, http.StatusNoContent)
	if got := rec.Result().Cookies(); len(got) != 1 || !got[0].Secure {
		t.Errorf("logout cookies = %v, want a Secure clearing cookie over https", got)
	}
}

func TestTooManyWrongPasswordsLockLogins(t *testing.T) {
	a := newAuthAPI(t, "secret")
	for range maxFailures {
		wantStatus(t, a.do(http.MethodPost, "/api/session", `{"password":"x"}`, "http://example.com"), http.StatusUnauthorized)
	}
	// Even the right password waits: guessing must not pay off while locked.
	rec := a.do(http.MethodPost, "/api/session", `{"password":"secret"}`, "http://example.com")
	wantStatus(t, rec, http.StatusTooManyRequests)
	if rec.Header().Get("Retry-After") == "" {
		t.Error("429 without Retry-After")
	}

	a.now = a.now.Add(failureWindow + time.Second)
	a.login("secret", false)
}

func TestLoginStillNeedsAnAllowedOrigin(t *testing.T) {
	a := newAuthAPI(t, "secret")
	body := `{"password":"secret"}`
	wantStatus(t, a.do(http.MethodPost, "/api/session", body, ""), http.StatusForbidden)
	wantStatus(t, a.do(http.MethodPost, "/api/session", body, "http://evil.example"), http.StatusForbidden)
}

func TestImagesAreNotSharedCacheableBehindAPassword(t *testing.T) {
	data, hash := pngBytes(t)
	for _, tt := range []struct {
		name, password, wantCache, wantVary string
	}{
		{"open", "", "public, max-age=31536000, immutable", ""},
		{"locked", "secret", "private, max-age=31536000, immutable", "Cookie, Authorization"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			a := newAuthAPI(t, tt.password)
			var cookies []*http.Cookie
			if tt.password != "" {
				cookies = append(cookies, a.login(tt.password, false))
			}
			wantStatus(t, a.do(http.MethodPut, "/api/images/"+hash, string(data), "http://example.com", cookies...), http.StatusNoContent)
			rec := a.do(http.MethodGet, "/api/images/"+hash, "", "", cookies...)
			wantStatus(t, rec, http.StatusOK)
			if got := rec.Header().Get("Cache-Control"); got != tt.wantCache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.wantCache)
			}
			if got := rec.Header().Get("Vary"); got != tt.wantVary {
				t.Errorf("Vary = %q, want %q", got, tt.wantVary)
			}
		})
	}
}
