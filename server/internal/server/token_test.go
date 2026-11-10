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

const testToken = "0123456789abcdef0123456789abcdef" // 32 characters

func TestParseAPIToken(t *testing.T) {
	tests := []struct {
		name        string
		value       string
		wantErr     bool
		wantEnabled bool
	}{
		{"unset disables", "", false, false},
		{"31 characters", testToken[:31], true, false},
		{"32 hex", testToken, false, true},
		{"64 hex", testToken + testToken, false, true},
		{"token68 symbols and padding", "AZaz09-._~+/AZaz09-._~+/AZaz09-._~+/==", false, true},
		{"space", testToken + " x", true, false},
		{"comma", testToken + ",x", true, false},
		{"padding in the middle", "abc=" + testToken, true, false},
		{"only padding", strings.Repeat("=", 40), true, false},
		{"non-ASCII", testToken + "é", true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tok, err := ParseAPIToken(tt.value)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && tt.value != "" && strings.Contains(err.Error(), tt.value) {
				t.Errorf("error %q leaks the token value", err)
			}
			if tok.Enabled() != tt.wantEnabled {
				t.Errorf("Enabled() = %v, want %v", tok.Enabled(), tt.wantEnabled)
			}
		})
	}
}

// newTokenHandler is the full handler chain with an optional token and
// password, so the origin, token and session checks run together.
func newTokenHandler(t *testing.T, token, password string) (http.Handler, *Auth) {
	t.Helper()
	sqlDB, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "yodo.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	tok, err := ParseAPIToken(token)
	if err != nil {
		t.Fatalf("ParseAPIToken: %v", err)
	}
	auth := NewAuth(password, nil)
	return newHandler(builtFS, mustParse(t, "http://example.com"), sqlDB, t.TempDir(), auth, tok, time.Now), auth
}

func TestAPITokenRequests(t *testing.T) {
	const (
		host    = "example.com"
		allowed = "http://example.com"
		foreign = "http://evil.example"
		bearer  = "Bearer " + testToken
		wrong   = "Bearer " + "ffffffffffffffffffffffffffffffff"
	)
	tests := []struct {
		name          string
		token         string
		password      string
		method, path  string
		host, origin  string // origin "" means no Origin header
		authorization string // "" means no Authorization header
		withCookie    bool
		want          int
		wantBody      string
	}{
		// A valid token lifts the Origin-required rule and the session.
		{"DELETE without Origin", testToken, "", http.MethodDelete, "/api/folders/f1", host, "", bearer, false, http.StatusNoContent, ""},
		{"DELETE trash without Origin", testToken, "", http.MethodDelete, "/api/drawings?trashed=true", host, "", bearer, false, http.StatusNoContent, ""},
		{"PUT without Origin reaches the handler", testToken, "", http.MethodPut, "/api/folders/f1", host, "", bearer, false, http.StatusBadRequest, "JSON folder"},
		{"POST without Origin reaches the mux", testToken, "", http.MethodPost, "/api/drawings", host, "", bearer, false, http.StatusMethodNotAllowed, ""},
		{"password, no cookie", testToken, "secret", http.MethodGet, "/api/drawings", host, "", bearer, false, http.StatusOK, ""},
		{"password, DELETE without Origin", testToken, "secret", http.MethodDelete, "/api/folders/f1", host, "", bearer, false, http.StatusNoContent, ""},
		{"scheme is case-insensitive", testToken, "secret", http.MethodGet, "/api/drawings", host, "", "bearer " + testToken, false, http.StatusOK, ""},
		{"valid token, allowed Origin", testToken, "", http.MethodDelete, "/api/folders/f1", host, allowed, bearer, false, http.StatusNoContent, ""},

		// Host and a present Origin are still checked (ADR 0020).
		{"valid token, foreign Origin", testToken, "", http.MethodDelete, "/api/folders/f1", host, foreign, bearer, false, http.StatusForbidden, "YODO_ALLOWED_ORIGINS"},
		{"valid token, foreign Host", testToken, "", http.MethodGet, "/api/drawings", "evil.example", "", bearer, false, http.StatusForbidden, "YODO_ALLOWED_ORIGINS"},

		// A wrong token fails loudly, with no fallback to the session.
		{"wrong token", testToken, "", http.MethodGet, "/api/drawings", host, "", wrong, false, http.StatusUnauthorized, "YODO_API_TOKEN"},
		{"empty bearer", testToken, "", http.MethodGet, "/api/drawings", host, "", "Bearer ", false, http.StatusUnauthorized, "YODO_API_TOKEN"},
		{"bare scheme", testToken, "", http.MethodGet, "/api/drawings", host, "", "Bearer", false, http.StatusUnauthorized, "YODO_API_TOKEN"},
		{"wrong token with a valid cookie", testToken, "secret", http.MethodGet, "/api/drawings", host, allowed, wrong, true, http.StatusUnauthorized, "YODO_API_TOKEN"},

		// Host and Origin are checked before the token.
		{"wrong token, foreign Host", testToken, "", http.MethodGet, "/api/drawings", "evil.example", "", wrong, false, http.StatusForbidden, "YODO_ALLOWED_ORIGINS"},
		{"wrong token, foreign Origin", testToken, "", http.MethodDelete, "/api/folders/f1", host, foreign, wrong, false, http.StatusForbidden, "YODO_ALLOWED_ORIGINS"},
		{"empty bearer, foreign Origin", testToken, "", http.MethodDelete, "/api/folders/f1", host, foreign, "Bearer ", false, http.StatusForbidden, "YODO_ALLOWED_ORIGINS"},

		// Other schemes are left to the ADR 0020 rules.
		{"Basic without Origin", testToken, "", http.MethodDelete, "/api/folders/f1", host, "", "Basic dXNlcjpwYXNz", false, http.StatusForbidden, "YODO_ALLOWED_ORIGINS"},
		{"Basic with password, no cookie", testToken, "secret", http.MethodGet, "/api/drawings", host, "", "Basic dXNlcjpwYXNz", false, http.StatusUnauthorized, "password required"},
		{"Basic with a valid cookie", testToken, "secret", http.MethodGet, "/api/drawings", host, "", "Basic dXNlcjpwYXNz", true, http.StatusOK, ""},

		// Without YODO_API_TOKEN nothing changes.
		{"unset: bearer without Origin", "", "", http.MethodDelete, "/api/folders/f1", host, "", bearer, false, http.StatusForbidden, "YODO_ALLOWED_ORIGINS"},
		{"unset: bearer with password", "", "secret", http.MethodGet, "/api/drawings", host, "", bearer, false, http.StatusUnauthorized, "password required"},
		{"unset: bearer with Origin", "", "", http.MethodDelete, "/api/folders/f1", host, allowed, bearer, false, http.StatusNoContent, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, auth := newTokenHandler(t, tt.token, tt.password)
			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(""))
			req.Host = tt.host
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.authorization != "" {
				req.Header.Set("Authorization", tt.authorization)
			}
			if tt.withCookie {
				req.AddCookie(&http.Cookie{Name: sessionCookie, Value: auth.startSession(time.Hour)})
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d (body %q)", rec.Code, tt.want, rec.Body.String())
			}
			if tt.wantBody != "" && !strings.Contains(rec.Body.String(), tt.wantBody) {
				t.Errorf("body = %q, want it to contain %q", rec.Body.String(), tt.wantBody)
			}
			gotChallenge := rec.Header().Get("WWW-Authenticate")
			if wantChallenge := tt.wantBody == "YODO_API_TOKEN"; wantChallenge != (gotChallenge == "Bearer") {
				t.Errorf("WWW-Authenticate = %q, want Bearer only on token errors", gotChallenge)
			}
		})
	}
}
