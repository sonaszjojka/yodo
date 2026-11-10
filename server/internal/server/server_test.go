package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

var builtFS = fstest.MapFS{
	"index.html":      {Data: []byte("<!doctype html><title>Yodo</title>")},
	"assets/app-1.js": {Data: []byte("console.log('yodo')")},
}

func TestHandler(t *testing.T) {
	tests := []struct {
		name        string
		static      fstest.MapFS
		method      string
		path        string
		wantStatus  int
		wantType    string
		wantBodyHas string
	}{
		{"health", builtFS, http.MethodGet, "/api/health", http.StatusOK, "application/json", `"status":"ok"`},
		{"health wrong method", builtFS, http.MethodPost, "/api/health", http.StatusMethodNotAllowed, "", ""},
		{"index", builtFS, http.MethodGet, "/", http.StatusOK, "text/html", "<title>Yodo</title>"},
		{"asset", builtFS, http.MethodGet, "/assets/app-1.js", http.StatusOK, "text/javascript", "console.log"},
		{"unknown path", builtFS, http.MethodGet, "/nope", http.StatusNotFound, "", ""},
		{"frontend not built", fstest.MapFS{}, http.MethodGet, "/", http.StatusServiceUnavailable, "text/plain", "frontend not built"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			// httptest requests use Host example.com.
			req := httptest.NewRequest(tt.method, tt.path, nil)
			req.Header.Set("Origin", "http://example.com")
			New(tt.static, mustParse(t, "http://example.com"), nil, t.TempDir(), nil, APIToken{}).ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, tt.wantType) {
				t.Errorf("Content-Type = %q, want prefix %q", got, tt.wantType)
			}
			if !strings.Contains(rec.Body.String(), tt.wantBodyHas) {
				t.Errorf("body = %q, want it to contain %q", rec.Body.String(), tt.wantBodyHas)
			}
		})
	}
}

// The origin rules themselves are tested in origin_test.go; this only checks
// that New puts them in front of every route.
func TestHandlerChecksOrigin(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Host = "evil.example"
	New(builtFS, mustParse(t, "http://example.com"), nil, t.TempDir(), nil, APIToken{}).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}
