package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// pngBytes is a real 1x1 PNG, and its hash.
func pngBytes(t *testing.T) ([]byte, string) {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(buf.Bytes())
	return buf.Bytes(), hex.EncodeToString(sum[:])
}

func newImagesHandler(t *testing.T) (http.Handler, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "images")
	return newHandler(builtFS, mustParse(t, "http://example.com"), nil, dir, nil, nil), dir
}

func doImage(h http.Handler, method, path string, body []byte) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Origin", "http://example.com")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestImageRoundTrip(t *testing.T) {
	h, dir := newImagesHandler(t)
	data, hash := pngBytes(t)

	wantStatus(t, doImage(h, http.MethodPut, "/api/images/"+hash, data), http.StatusNoContent)
	// The same image again is not an error (idempotent, safe to retry).
	wantStatus(t, doImage(h, http.MethodPut, "/api/images/"+hash, data), http.StatusNoContent)

	rec := doImage(h, http.MethodGet, "/api/images/"+hash, nil)
	wantStatus(t, rec, http.StatusOK)
	if !bytes.Equal(rec.Body.Bytes(), data) {
		t.Error("GET returned different bytes")
	}
	if got := rec.Header().Get("Content-Type"); got != "image/png" {
		t.Errorf("Content-Type = %q", got)
	}
	if got := rec.Header().Get("Cache-Control"); !strings.Contains(got, "immutable") {
		t.Errorf("Cache-Control = %q", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q", got)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 || entries[0].Name() != hash {
		t.Errorf("dir = %v, %v; want only %s (no temp files left)", entries, err, hash)
	}
}

func TestImageRejects(t *testing.T) {
	h, _ := newImagesHandler(t)
	data, hash := pngBytes(t)
	other := strings.Repeat("0", 64)
	big := append(append([]byte{}, data...), make([]byte, maxImageBytes)...)

	tests := []struct {
		name   string
		method string
		path   string
		body   []byte
		want   int
	}{
		{"hash does not match body", http.MethodPut, "/api/images/" + other, data, http.StatusBadRequest},
		{"malformed hash on put", http.MethodPut, "/api/images/not-a-hash", data, http.StatusBadRequest},
		{"upper-case hash", http.MethodPut, "/api/images/" + strings.ToUpper(hash), data, http.StatusBadRequest},
		{"malformed hash on get", http.MethodGet, "/api/images/not-a-hash", nil, http.StatusBadRequest},
		{"traversal-like hash", http.MethodGet, "/api/images/..%2f..%2fyodo.db", nil, http.StatusBadRequest},
		{"not an image", http.MethodPut, "/api/images/" + other, []byte("<svg></svg>"), http.StatusUnsupportedMediaType},
		{"too large", http.MethodPut, "/api/images/" + hash, big, http.StatusRequestEntityTooLarge},
		{"missing", http.MethodGet, "/api/images/" + other, nil, http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantStatus(t, doImage(h, tt.method, tt.path, tt.body), tt.want)
		})
	}
}

func TestImagesCheckOrigin(t *testing.T) {
	h, _ := newImagesHandler(t)
	data, hash := pngBytes(t)
	req := httptest.NewRequest(http.MethodPut, "/api/images/"+hash, bytes.NewReader(data))
	req.Header.Set("Origin", "http://evil.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	wantStatus(t, rec, http.StatusForbidden)
}
