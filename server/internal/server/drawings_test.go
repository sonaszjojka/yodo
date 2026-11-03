package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sonaszjojka/yodo/server/internal/db"
	"github.com/sonaszjojka/yodo/server/internal/store"
)

// testAPI serves the handler on a fresh SQLite file in a temp dir (ADR 0011),
// with a clock the test moves by hand.
type testAPI struct {
	t       *testing.T
	handler http.Handler
	now     time.Time
}

func newTestAPI(t *testing.T) *testAPI {
	t.Helper()
	sqlDB, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "yodo.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	api := &testAPI{t: t, now: time.UnixMilli(1_000)}
	api.handler = newHandler(builtFS, mustParse(t, "http://example.com"), db.New(sqlDB),
		func() time.Time { return api.now })
	return api
}

func (a *testAPI) do(method, path, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Origin", "http://example.com")
	rec := httptest.NewRecorder()
	a.handler.ServeHTTP(rec, req)
	return rec
}

func wantStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d (body %q)", rec.Code, want, rec.Body.String())
	}
}

func decodeSummary(t *testing.T, rec *httptest.ResponseRecorder) summary {
	t.Helper()
	var s summary
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		t.Fatalf("decode summary %q: %v", rec.Body.String(), err)
	}
	return s
}

const docID = "6f1c2c8e-8d1e-4f5a-9c3b-2a7e5d4b1f00"

// Key order and spacing are unusual on purpose: GET must return the bytes
// that were saved, not a re-encoding.
const doc = `{"type":"yodo","schemaVersion":1,"name":"Plan","id":"` + docID + `",
  "elements":[{"id":"e1","type":"rectangle","x":1.5}],"appState":{},"fileIds":[]}`

func TestListStartsEmpty(t *testing.T) {
	rec := newTestAPI(t).do(http.MethodGet, "/api/drawings", "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	// An empty JSON array, not null, so the client can iterate it.
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Errorf("body = %q, want []", got)
	}
}

func TestPutThenGetReturnsSameBytes(t *testing.T) {
	api := newTestAPI(t)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID, doc)
	wantStatus(t, rec, http.StatusOK)
	want := summary{ID: docID, Name: "Plan", CreatedAt: 1_000, UpdatedAt: 1_000}
	if got := decodeSummary(t, rec); got != want {
		t.Errorf("summary = %+v, want %+v", got, want)
	}

	rec = api.do(http.MethodGet, "/api/drawings/"+docID, "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q", got)
	}
	if rec.Body.String() != doc {
		t.Errorf("document = %q, want %q", rec.Body.String(), doc)
	}

	rec = api.do(http.MethodGet, "/api/drawings", "")
	wantStatus(t, rec, http.StatusOK)
	var list []summary
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0] != want {
		t.Errorf("list = %+v, want [%+v]", list, want)
	}
}

func TestPutAgainReplacesAndKeepsCreatedAt(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)

	api.now = time.UnixMilli(5_000)
	changed := strings.Replace(doc, `"Plan"`, `"Final"`, 1)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID, changed)
	wantStatus(t, rec, http.StatusOK)
	want := summary{ID: docID, Name: "Final", CreatedAt: 1_000, UpdatedAt: 5_000}
	if got := decodeSummary(t, rec); got != want {
		t.Errorf("summary = %+v, want %+v", got, want)
	}
	if got := api.do(http.MethodGet, "/api/drawings/"+docID, "").Body.String(); got != changed {
		t.Errorf("document = %q, want %q", got, changed)
	}
}

func TestDelete(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)

	wantStatus(t, api.do(http.MethodDelete, "/api/drawings/"+docID, ""), http.StatusNoContent)
	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
	if got := strings.TrimSpace(api.do(http.MethodGet, "/api/drawings", "").Body.String()); got != "[]" {
		t.Errorf("list after delete = %q, want []", got)
	}
	// Deleting a missing drawing is not an error (ADR 0030).
	wantStatus(t, api.do(http.MethodDelete, "/api/drawings/"+docID, ""), http.StatusNoContent)
}

func TestGetMissing(t *testing.T) {
	wantStatus(t, newTestAPI(t).do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
}

func TestPutRejectsBadBodies(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"invalid JSON", `{"id":`},
		{"not an object", `[1,2]`},
		{"trailing garbage", doc + `x`},
		{"id differs from path", strings.Replace(doc, docID, "other-id", 1)},
		{"missing id", `{"name":"Plan","schemaVersion":1}`},
		{"missing name", `{"id":"` + docID + `","schemaVersion":1}`},
		{"name not a string", `{"id":"` + docID + `","name":7,"schemaVersion":1}`},
		{"missing schemaVersion", `{"id":"` + docID + `","name":"Plan"}`},
		{"schemaVersion zero", `{"id":"` + docID + `","name":"Plan","schemaVersion":0}`},
		{"schemaVersion not an integer", `{"id":"` + docID + `","name":"Plan","schemaVersion":1.5}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			api := newTestAPI(t)
			wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, tt.body), http.StatusBadRequest)
			// Nothing was stored.
			wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
		})
	}
}

func TestPutRejectsTooLargeBody(t *testing.T) {
	api := newTestAPI(t)
	padding := strings.Repeat("x", maxDocumentBytes)
	body := `{"id":"` + docID + `","name":"Plan","schemaVersion":1,"pad":"` + padding + `"}`
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, body), http.StatusRequestEntityTooLarge)
}

func TestDrawingsWrongMethod(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPost, "/api/drawings", doc), http.StatusMethodNotAllowed)
	wantStatus(t, api.do(http.MethodPatch, "/api/drawings/"+docID, doc), http.StatusMethodNotAllowed)
}
