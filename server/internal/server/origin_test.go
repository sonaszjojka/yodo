package server

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func TestParseAllowedOrigins(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    []string
		wantErr bool
	}{
		{"empty uses defaults", "", []string{"http://localhost:8080", "http://127.0.0.1:8080"}, false},
		{"blank uses defaults", " , ", []string{"http://localhost:8080", "http://127.0.0.1:8080"}, false},
		{"one", "http://yodo.home:8080", []string{"http://yodo.home:8080"}, false},
		{"several with spaces", " http://a.test:1 ,https://b.test, ", []string{"http://a.test:1", "https://b.test"}, false},
		{"normalized", "HTTP://Yodo.Home:8080/", []string{"http://yodo.home:8080"}, false},
		{"default https port stripped", "https://yodo.home:443", []string{"https://yodo.home"}, false},
		{"default http port stripped", "http://yodo.home:80", []string{"http://yodo.home"}, false},
		{"ipv6", "http://[::1]:8080", []string{"http://[::1]:8080"}, false},
		{"https port kept on http", "http://yodo.home:443", []string{"http://yodo.home:443"}, false},
		{"http port kept on https", "https://yodo.home:80", []string{"https://yodo.home:80"}, false},
		{"no scheme", "yodo.home:8080", nil, true},
		{"bad scheme", "ftp://yodo.home", nil, true},
		{"no host", "http://", nil, true},
		{"port only", "http://:8080", nil, true},
		{"path", "http://yodo.home/app", nil, true},
		{"query", "http://yodo.home?x=1", nil, true},
		{"fragment", "http://yodo.home#x", nil, true},
		{"credentials", "http://user@yodo.home", nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseAllowedOrigins(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if !slices.Equal(got.List(), tt.want) {
				t.Errorf("got %q, want %q", got.List(), tt.want)
			}
		})
	}
}

func TestRequireAllowedOrigin(t *testing.T) {
	defaults := DefaultAllowedOrigins
	custom := "http://yodo.home:8080"
	const local = "localhost:8080"

	tests := []struct {
		name    string
		allowed string
		method  string
		host    string
		origin  string // "" means no Origin header
		want    int
	}{
		// Host check: every request (DNS rebinding).
		{"GET allowed host, no Origin", defaults, http.MethodGet, local, "", http.StatusOK},
		{"GET 127.0.0.1", defaults, http.MethodGet, "127.0.0.1:8080", "", http.StatusOK},
		{"GET host is case-insensitive", defaults, http.MethodGet, "LOCALHOST:8080", "", http.StatusOK},
		{"HEAD no Origin", defaults, http.MethodHead, local, "", http.StatusOK},
		{"GET foreign host", defaults, http.MethodGet, "evil.example", "", http.StatusForbidden},
		{"GET foreign host, allowed Origin", defaults, http.MethodGet, "evil.example", "http://localhost:8080", http.StatusForbidden},
		{"GET wrong port", defaults, http.MethodGet, "localhost:9000", "", http.StatusForbidden},
		{"GET empty host", defaults, http.MethodGet, "", "", http.StatusForbidden},

		// Origin check: state-changing requests (CSRF).
		{"POST allowed Origin", defaults, http.MethodPost, local, "http://localhost:8080", http.StatusOK},
		{"PUT allowed Origin", defaults, http.MethodPut, local, "http://localhost:8080", http.StatusOK},
		{"PATCH allowed Origin", defaults, http.MethodPatch, local, "http://localhost:8080", http.StatusOK},
		{"DELETE allowed Origin", defaults, http.MethodDelete, local, "http://localhost:8080", http.StatusOK},
		{"POST other allowed Origin", defaults, http.MethodPost, local, "http://127.0.0.1:8080", http.StatusOK},
		{"POST no Origin", defaults, http.MethodPost, local, "", http.StatusForbidden},
		{"DELETE no Origin", defaults, http.MethodDelete, local, "", http.StatusForbidden},
		{"OPTIONS no Origin", defaults, http.MethodOptions, local, "", http.StatusForbidden},
		{"POST foreign Origin", defaults, http.MethodPost, local, "http://evil.example", http.StatusForbidden},
		{"POST null Origin", defaults, http.MethodPost, local, "null", http.StatusForbidden},
		{"POST wrong scheme", defaults, http.MethodPost, local, "https://localhost:8080", http.StatusForbidden},
		{"POST wrong port", defaults, http.MethodPost, local, "http://localhost:9000", http.StatusForbidden},

		// YODO_ALLOWED_ORIGINS replaces the defaults.
		{"custom host allowed", custom, http.MethodPost, "yodo.home:8080", "http://yodo.home:8080", http.StatusOK},
		{"custom blocks localhost", custom, http.MethodGet, local, "", http.StatusForbidden},
		{"default port in Host", "http://yodo.home", http.MethodGet, "yodo.home:80", "", http.StatusOK},
		{"https port is not http default", "http://yodo.home", http.MethodGet, "yodo.home:443", "", http.StatusForbidden},
		{"Origin with https port on http", "http://yodo.home", http.MethodPost, "yodo.home", "http://yodo.home:443", http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
			req := httptest.NewRequest(tt.method, "/api/health", nil)
			req.Host = tt.host
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			rec := httptest.NewRecorder()
			requireAllowedOrigin(mustParse(t, tt.allowed), next).ServeHTTP(rec, req)

			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d", rec.Code, tt.want)
			}
			if tt.want == http.StatusForbidden && !strings.Contains(rec.Body.String(), "YODO_ALLOWED_ORIGINS") {
				t.Errorf("body = %q, want it to mention YODO_ALLOWED_ORIGINS", rec.Body.String())
			}
		})
	}
}

func TestParseAllowedOriginsDefaultsAreFresh(t *testing.T) {
	a := mustParse(t, "")
	a.List()[0] = "http://evil.example"
	if got := mustParse(t, "").List()[0]; got != "http://localhost:8080" {
		t.Errorf("defaults changed to %q", got)
	}
}

func TestZeroAllowedOriginsBlocksEverything(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	rec := httptest.NewRecorder()
	requireAllowedOrigin(AllowedOrigins{}, next).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestTruncate(t *testing.T) {
	long := strings.Repeat("a", 5000)
	if got := truncate(long); len(got) > maxLoggedLen+len("…") {
		t.Errorf("len = %d, want at most %d", len(got), maxLoggedLen+len("…"))
	}
	if got := truncate("short"); got != "short" {
		t.Errorf("got %q", got)
	}
}

func mustParse(t *testing.T, s string) AllowedOrigins {
	t.Helper()
	a, err := ParseAllowedOrigins(s)
	if err != nil {
		t.Fatal(err)
	}
	return a
}
