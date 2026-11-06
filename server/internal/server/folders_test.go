package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const folderID = "0c4d6e1a-7f0b-4c53-8a52-5b1d9f2e7a10"

const folderBody = `{"id":"` + folderID + `","name":"Work","icon":"briefcase","color":"teal"}`

func decodeFolder(t *testing.T, rec *httptest.ResponseRecorder) folder {
	t.Helper()
	var f folder
	if err := json.Unmarshal(rec.Body.Bytes(), &f); err != nil {
		t.Fatalf("decode folder %q: %v", rec.Body.String(), err)
	}
	return f
}

func listSummaries(t *testing.T, api *testAPI) []summary {
	t.Helper()
	rec := api.do(http.MethodGet, "/api/drawings", "")
	wantStatus(t, rec, http.StatusOK)
	var list []summary
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	return list
}

func moveBody(id string) string {
	if id == "" {
		return `{"folderId":null}`
	}
	return `{"folderId":"` + id + `"}`
}

func TestFoldersStartEmptyAsAnArray(t *testing.T) {
	rec := newTestAPI(t).do(http.MethodGet, "/api/folders", "")
	wantStatus(t, rec, http.StatusOK)
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Errorf("body = %q, want []", got)
	}
}

func TestPutFolderThenList(t *testing.T) {
	api := newTestAPI(t)
	rec := api.do(http.MethodPut, "/api/folders/"+folderID, folderBody)
	wantStatus(t, rec, http.StatusOK)
	want := folder{ID: folderID, Name: "Work", Icon: "briefcase", Color: "teal", CreatedAt: 1_000}
	if got := decodeFolder(t, rec); got != want {
		t.Errorf("folder = %+v, want %+v", got, want)
	}
	var list []folder
	rec = api.do(http.MethodGet, "/api/folders", "")
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0] != want {
		t.Errorf("list = %+v, want [%+v]", list, want)
	}
}

func TestPutFolderAgainReplacesAndKeepsCreatedAt(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	api.now = time.UnixMilli(9_000)
	changed := `{"id":"` + folderID + `","name":"Play","icon":"star","color":"brick"}`
	rec := api.do(http.MethodPut, "/api/folders/"+folderID, changed)
	wantStatus(t, rec, http.StatusOK)
	want := folder{ID: folderID, Name: "Play", Icon: "star", Color: "brick", CreatedAt: 1_000}
	if got := decodeFolder(t, rec); got != want {
		t.Errorf("folder = %+v, want %+v", got, want)
	}
}

func TestPutFolderRejectsBadBodies(t *testing.T) {
	cases := map[string]string{
		"not json":     `nope`,
		"id mismatch":  `{"id":"other","name":"A","icon":"i","color":"c"}`,
		"missing name": `{"id":"` + folderID + `","icon":"i","color":"c"}`,
		"empty name":   `{"id":"` + folderID + `","name":"","icon":"i","color":"c"}`,
		"empty icon":   `{"id":"` + folderID + `","name":"A","icon":"","color":"c"}`,
		"empty color":  `{"id":"` + folderID + `","name":"A","icon":"i","color":""}`,
		"number name":  `{"id":"` + folderID + `","name":5,"icon":"i","color":"c"}`,
		"long name":    `{"id":"` + folderID + `","name":"` + strings.Repeat("x", 201) + `","icon":"i","color":"c"}`,
		// encoding/json would accept "ID"; JSON.parse would not.
		"wrong key case": `{"ID":"` + folderID + `","name":"A","icon":"i","color":"c"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			api := newTestAPI(t)
			wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, body), http.StatusBadRequest)
			if got := strings.TrimSpace(api.do(http.MethodGet, "/api/folders", "").Body.String()); got != "[]" {
				t.Errorf("a rejected folder was stored: %s", got)
			}
		})
	}
}

func TestPutFolderRejectsOversizedBody(t *testing.T) {
	big := `{"id":"` + folderID + `","name":"` + strings.Repeat("x", maxFolderBytes) + `","icon":"i","color":"c"}`
	wantStatus(t, newTestAPI(t).do(http.MethodPut, "/api/folders/"+folderID, big), http.StatusRequestEntityTooLarge)
}

func TestDeleteFolderIsIdempotent(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	wantStatus(t, api.do(http.MethodDelete, "/api/folders/"+folderID, ""), http.StatusNoContent)
	wantStatus(t, api.do(http.MethodDelete, "/api/folders/"+folderID, ""), http.StatusNoContent)
	if got := strings.TrimSpace(api.do(http.MethodGet, "/api/folders", "").Body.String()); got != "[]" {
		t.Errorf("list after delete = %s, want []", got)
	}
}

func TestMoveDrawingIntoAndOutOfAFolder(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)

	// A move is not an edit: updatedAt stays, the document is untouched.
	api.now = time.UnixMilli(7_000)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody(folderID))
	wantStatus(t, rec, http.StatusOK)
	got := decodeSummary(t, rec)
	if got.FolderID == nil || *got.FolderID != folderID || got.UpdatedAt != 1_000 {
		t.Errorf("summary = %+v, want folder %s and updatedAt 1000", got, folderID)
	}
	if list := listSummaries(t, api); len(list) != 1 || list[0].FolderID == nil || *list[0].FolderID != folderID {
		t.Errorf("list = %+v, want the drawing in the folder", list)
	}
	if got := api.do(http.MethodGet, "/api/drawings/"+docID, "").Body.String(); got != doc {
		t.Errorf("document changed by a move: %q", got)
	}

	rec = api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody(""))
	wantStatus(t, rec, http.StatusOK)
	if got := decodeSummary(t, rec); got.FolderID != nil {
		t.Errorf("FolderID = %v after moving out, want none", *got.FolderID)
	}
	// "folderId" is left out, not null, for a drawing in no folder.
	if strings.Contains(rec.Body.String(), "folderId") {
		t.Errorf("body = %q, want no folderId key", rec.Body.String())
	}
}

func TestPutDrawingKeepsItsFolder(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody(folderID)), http.StatusOK)

	// Auto-save replaces the document and must not undo the move.
	api.now = time.UnixMilli(5_000)
	rec := api.do(http.MethodPut, "/api/drawings/"+docID, strings.Replace(doc, `"Plan"`, `"Final"`, 1))
	wantStatus(t, rec, http.StatusOK)
	got := decodeSummary(t, rec)
	if got.FolderID == nil || *got.FolderID != folderID || got.Name != "Final" || got.UpdatedAt != 5_000 {
		t.Errorf("summary = %+v, want Final in the folder, updated at 5000", got)
	}
}

func TestMoveErrors(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)

	wantStatus(t, api.do(http.MethodPut, "/api/drawings/missing/folder", moveBody(folderID)), http.StatusNotFound)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody("no-such-folder")), http.StatusBadRequest)
	for name, body := range map[string]string{
		"not json":       `x`,
		"missing key":    `{}`,
		"number":         `{"folderId":4}`,
		"wrong key case": `{"FolderID":null}`,
	} {
		t.Run(name, func(t *testing.T) {
			wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", body), http.StatusBadRequest)
		})
	}
	if list := listSummaries(t, api); len(list) != 1 || list[0].FolderID != nil {
		t.Errorf("a rejected move changed the drawing: %+v", list)
	}
}

func TestDeletingAFolderDeletesItsDrawingsOnly(t *testing.T) {
	api := newTestAPI(t)
	const otherID = "11111111-2222-4333-8444-555555555555"
	other := strings.NewReplacer(docID, otherID, `"Plan"`, `"Other"`).Replace(doc)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+otherID, other), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody(folderID)), http.StatusOK)

	wantStatus(t, api.do(http.MethodDelete, "/api/folders/"+folderID, ""), http.StatusNoContent)

	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+otherID, ""), http.StatusOK)
	if list := listSummaries(t, api); len(list) != 1 || list[0].ID != otherID {
		t.Errorf("list = %+v, want only %s", list, otherID)
	}
}

// ADR 0045: a tab that still has the drawing open saves it again (ADR 0032,
// last write wins), which re-creates it outside any folder.
func TestSaveAfterTheFolderWasDeletedRecreatesTheDrawing(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/folders/"+folderID, folderBody), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/folder", moveBody(folderID)), http.StatusOK)
	wantStatus(t, api.do(http.MethodDelete, "/api/folders/"+folderID, ""), http.StatusNoContent)

	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	if list := listSummaries(t, api); len(list) != 1 || list[0].FolderID != nil {
		t.Errorf("list = %+v, want the drawing back with no folder", list)
	}
}

func TestFolderRoutesNeedAnAllowedOrigin(t *testing.T) {
	api := newTestAPI(t)
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodPut, "/api/folders/" + folderID, folderBody},
		{http.MethodDelete, "/api/folders/" + folderID, ""},
		{http.MethodPut, "/api/drawings/" + docID + "/folder", moveBody("")},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Origin", "http://evil.example")
		rec := httptest.NewRecorder()
		api.handler.ServeHTTP(rec, req)
		wantStatus(t, rec, http.StatusForbidden)
	}
}
