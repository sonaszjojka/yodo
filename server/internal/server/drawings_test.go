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
	api.handler = newHandler(builtFS, mustParse(t, "http://example.com"), sqlDB, t.TempDir(), nil,
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
	want := summary{ID: docID, Name: "Plan", CreatedAt: 1_000, UpdatedAt: 1_000, Revision: 1}
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
	want := summary{ID: docID, Name: "Final", CreatedAt: 1_000, UpdatedAt: 5_000, Revision: 2}
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
		{"name null", `{"id":"` + docID + `","name":null,"schemaVersion":1}`},
		// Keys match exactly, as in the browser's JSON.parse: "ID" is not "id".
		{"keys in another case", `{"ID":"` + docID + `","Name":"Plan","SchemaVersion":1}`},
		{"real id hidden by a case variant", `{"id":"other-id","name":"Plan","schemaVersion":1,"ID":"` + docID + `"}`},
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

// With a duplicate key the last one wins, as in JSON.parse, so the metadata
// the server stores agrees with what the client reads back.
func TestPutDuplicateKeysLastWins(t *testing.T) {
	api := newTestAPI(t)
	body := `{"id":"other-id","name":"First","schemaVersion":1,"id":"` + docID + `","name":"Last"}`
	rec := api.do(http.MethodPut, "/api/drawings/"+docID, body)
	wantStatus(t, rec, http.StatusOK)
	if got := decodeSummary(t, rec).Name; got != "Last" {
		t.Errorf("name = %q, want %q", got, "Last")
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

func trashBody(trashed bool) string {
	if trashed {
		return `{"trashed":true}`
	}
	return `{"trashed":false}`
}

func putDrawing(t *testing.T, api *testAPI, id, name string) {
	t.Helper()
	body := strings.NewReplacer(docID, id, `"Plan"`, `"`+name+`"`).Replace(doc)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+id, body), http.StatusOK)
}

func TestTrashAndRestoreRoundTrip(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody(folderID)), http.StatusOK)

	api.now = time.UnixMilli(4_000)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true))
	wantStatus(t, rec, http.StatusOK)
	got := decodeSummary(t, rec)
	if got.DeletedAt == nil || *got.DeletedAt != 4_000 || got.UpdatedAt != 1_000 || got.FolderID == nil {
		t.Errorf("trashed summary = %+v, want deletedAt 4000, updatedAt 1000, folder kept", got)
	}
	if list := listSummaries(t, api); len(list) != 0 {
		t.Errorf("list = %+v, want the drawing hidden", list)
	}
	if trashed := listTrashed(t, api); len(trashed) != 1 || trashed[0].ID != docID {
		t.Errorf("trash = %+v", trashed)
	}
	// The document is untouched, so a restore brings the drawing back whole.
	if got := api.do(http.MethodGet, "/api/drawings/"+docID, "").Body.String(); got != doc {
		t.Errorf("document = %q, want %q", got, doc)
	}

	rec = api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(false))
	wantStatus(t, rec, http.StatusOK)
	got = decodeSummary(t, rec)
	if got.DeletedAt != nil || got.UpdatedAt != 1_000 || got.FolderID == nil || *got.FolderID != folderID {
		t.Errorf("restored summary = %+v, want live, updatedAt 1000, still in the folder", got)
	}
	if len(listTrashed(t, api)) != 0 || len(listSummaries(t, api)) != 1 {
		t.Error("restore did not move the drawing back to the list")
	}
}

func TestTrashingTwiceKeepsTheFirstDeletedAt(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	api.now = time.UnixMilli(2_000)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)
	api.now = time.UnixMilli(8_000)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true))
	wantStatus(t, rec, http.StatusOK)
	if got := decodeSummary(t, rec); got.DeletedAt == nil || *got.DeletedAt != 2_000 {
		t.Errorf("deletedAt = %v, want 2000", got.DeletedAt)
	}
}

func TestTrashErrors(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/missing/trash", trashBody(true)), http.StatusNotFound)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/missing/trash", trashBody(false)), http.StatusNotFound)
	for name, body := range map[string]string{
		"not json":       `x`,
		"missing key":    `{}`,
		"string":         `{"trashed":"true"}`,
		"null":           `{"trashed":null}`,
		"wrong key case": `{"Trashed":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", body), http.StatusBadRequest)
		})
	}
	if len(listTrashed(t, api)) != 0 {
		t.Error("a rejected request trashed the drawing")
	}
}

func TestTrashedListStartsAsAnEmptyArray(t *testing.T) {
	rec := newTestAPI(t).do(http.MethodGet, "/api/drawings?trashed=true", "")
	wantStatus(t, rec, http.StatusOK)
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Errorf("body = %q, want []", got)
	}
}

func TestSaveKeepsADrawingInTrash(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	api.now = time.UnixMilli(2_000)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)

	api.now = time.UnixMilli(6_000)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID, strings.Replace(doc, `"Plan"`, `"Final"`, 1))
	wantStatus(t, rec, http.StatusOK)
	got := decodeSummary(t, rec)
	if got.DeletedAt == nil || *got.DeletedAt != 2_000 || got.Name != "Final" || got.UpdatedAt != 6_000 {
		t.Errorf("summary = %+v, want still trashed at 2000, saved at 6000", got)
	}
}

func TestMoveWorksOnATrashedDrawing(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody(folderID))
	wantStatus(t, rec, http.StatusOK)
	if got := decodeSummary(t, rec); got.DeletedAt == nil || got.FolderID == nil {
		t.Errorf("summary = %+v, want trashed and in the folder", got)
	}
}

func TestPermanentDeleteWorksOnATrashedDrawing(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)
	wantStatus(t, api.do(http.MethodDelete, "/api/drawings/"+docID, ""), http.StatusNoContent)
	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
	if len(listTrashed(t, api)) != 0 {
		t.Error("the drawing is still in Trash")
	}
}

func TestEmptyTrashRemovesOnlyTrashedDrawings(t *testing.T) {
	api := newTestAPI(t)
	const liveID, oldID = "aaaaaaaa-2222-4333-8444-555555555555", "bbbbbbbb-2222-4333-8444-555555555555"
	putDrawing(t, api, liveID, "Live")
	putDrawing(t, api, oldID, "Old")
	putDrawing(t, api, docID, "Plan")
	api.now = time.UnixMilli(2_000)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+oldID+"/trash", trashBody(true)), http.StatusOK)
	api.now = time.UnixMilli(5_000)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)

	// With a cutoff only older items go; the cutoff itself is not older.
	wantStatus(t, api.do(http.MethodDelete, "/api/drawings?trashed=true&deletedBefore=5000", ""), http.StatusNoContent)
	if trashed := listTrashed(t, api); len(trashed) != 1 || trashed[0].ID != docID {
		t.Errorf("trash after the sweep = %+v, want only %s", trashed, docID)
	}

	wantStatus(t, api.do(http.MethodDelete, "/api/drawings?trashed=true", ""), http.StatusNoContent)
	if len(listTrashed(t, api)) != 0 {
		t.Error("Trash is not empty")
	}
	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
	if list := listSummaries(t, api); len(list) != 1 || list[0].ID != liveID {
		t.Errorf("list = %+v, want only the live drawing", list)
	}
}

// A sweep with a stale cutoff must not remove a drawing that was restored and
// trashed again since (ADR 0046).
func TestSweepSkipsADrawingTrashedAgain(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	api.now = time.UnixMilli(2_000)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(false)), http.StatusOK)
	api.now = time.UnixMilli(9_000)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)

	wantStatus(t, api.do(http.MethodDelete, "/api/drawings?trashed=true&deletedBefore=3000", ""), http.StatusNoContent)
	if len(listTrashed(t, api)) != 1 {
		t.Error("the sweep removed a drawing that was trashed after the cutoff")
	}
	// And a restored drawing is live, so no sweep or empty touches it.
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(false)), http.StatusOK)
	wantStatus(t, api.do(http.MethodDelete, "/api/drawings?trashed=true", ""), http.StatusNoContent)
	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusOK)
}

func TestBareDeleteOnTheCollectionRemovesNothing(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	for _, path := range []string{"/api/drawings", "/api/drawings?trashed=false", "/api/drawings?deletedBefore=1"} {
		rec := api.do(http.MethodDelete, path, "")
		wantStatus(t, rec, http.StatusMethodNotAllowed)
		if got := rec.Header().Get("Allow"); got != "GET" {
			t.Errorf("%s: Allow = %q, want GET", path, got)
		}
	}
	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusOK)
	wantStatus(t, api.do(http.MethodDelete, "/api/drawings?trashed=true&deletedBefore=soon", ""), http.StatusBadRequest)
}

// An empty cutoff is malformed, not "no cutoff": it must not empty Trash
// (Codex review round 1, finding 2).
func TestEmptyCutoffIsRejectedAndRemovesNothing(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)
	wantStatus(t, api.do(http.MethodDelete, "/api/drawings?trashed=true&deletedBefore=", ""), http.StatusBadRequest)
	if len(listTrashed(t, api)) != 1 {
		t.Error("a malformed cutoff emptied Trash")
	}
}

func TestTrashRoutesNeedAnAllowedOrigin(t *testing.T) {
	api := newTestAPI(t)
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodPut, "/api/drawings/" + docID + "/trash", trashBody(true)},
		{http.MethodDelete, "/api/drawings?trashed=true", ""},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Origin", "http://evil.example")
		rec := httptest.NewRecorder()
		api.handler.ServeHTTP(rec, req)
		wantStatus(t, rec, http.StatusForbidden)
	}
}
