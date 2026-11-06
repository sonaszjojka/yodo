package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// putWithText saves the shared test document with the search-text header; a
// nil text sends no header.
func putWithText(api *testAPI, id string, text *string) *httptest.ResponseRecorder {
	api.t.Helper()
	body := strings.ReplaceAll(doc, docID, id)
	req := httptest.NewRequest(http.MethodPut, "/api/drawings/"+id, strings.NewReader(body))
	req.Header.Set("Origin", "http://example.com")
	if text != nil {
		req.Header.Set(searchTextHeader, url.PathEscape(*text))
	}
	rec := httptest.NewRecorder()
	api.handler.ServeHTTP(rec, req)
	return rec
}

func str(s string) *string { return &s }

func searchIndex(t *testing.T, api *testAPI) map[string]*string {
	t.Helper()
	rec := api.do(http.MethodGet, "/api/search-index", "")
	wantStatus(t, rec, http.StatusOK)
	var rows []searchIndexEntry
	if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	out := map[string]*string{}
	for _, r := range rows {
		out[r.ID] = r.SearchText
	}
	return out
}

func wantText(t *testing.T, got map[string]*string, id, want string) {
	t.Helper()
	text, ok := got[id]
	if !ok || text == nil || *text != want {
		t.Errorf("index[%s] = %v (present %v), want %q", id, text, ok, want)
	}
}

func TestSearchIndexStartsAsAnEmptyArray(t *testing.T) {
	rec := newTestAPI(t).do(http.MethodGet, "/api/search-index", "")
	wantStatus(t, rec, http.StatusOK)
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Errorf("body = %q, want []", got)
	}
}

func TestSaveStoresTheHeaderText(t *testing.T) {
	api := newTestAPI(t)
	text := "zażółć 😀\nbudget, 100%"
	wantStatus(t, putWithText(api, docID, &text), http.StatusOK)
	wantText(t, searchIndex(t, api), docID, text)
}

func TestSaveWithAnEmptyHeaderStoresEmptyText(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, str("")), http.StatusOK)
	wantText(t, searchIndex(t, api), docID, "")
}

func TestSaveWithoutTheHeaderLeavesTheDrawingUnindexed(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, nil), http.StatusOK)
	got := searchIndex(t, api)
	if text, ok := got[docID]; !ok || text != nil {
		t.Errorf("index = %v, want %s present with null text", got, docID)
	}
}

func TestSaveWithoutTheHeaderClearsOlderText(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, str("old")), http.StatusOK)
	wantStatus(t, putWithText(api, docID, nil), http.StatusOK)
	if text := searchIndex(t, api)[docID]; text != nil {
		t.Errorf("text = %q, want null so it can't describe an older document", *text)
	}
}

func TestSaveRejectsABadHeaderAndStoresNothing(t *testing.T) {
	cases := map[string]string{
		"bad escape":     "100%",
		"invalid utf-8":  "%ff%fe",
		"too long":       strings.Repeat("a", maxHeaderSearchText+1),
		"bad escape mid": "a%zzb",
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			api := newTestAPI(t)
			body := strings.ReplaceAll(doc, docID, docID)
			req := httptest.NewRequest(http.MethodPut, "/api/drawings/"+docID, strings.NewReader(body))
			req.Header.Set("Origin", "http://example.com")
			req.Header.Set(searchTextHeader, raw)
			rec := httptest.NewRecorder()
			api.handler.ServeHTTP(rec, req)
			wantStatus(t, rec, http.StatusBadRequest)
			wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
		})
	}
}

func TestSaveRejectsTheHeaderSentTwice(t *testing.T) {
	api := newTestAPI(t)
	req := httptest.NewRequest(http.MethodPut, "/api/drawings/"+docID, strings.NewReader(doc))
	req.Header.Set("Origin", "http://example.com")
	req.Header.Add(searchTextHeader, "a")
	req.Header.Add(searchTextHeader, "b")
	rec := httptest.NewRecorder()
	api.handler.ServeHTTP(rec, req)
	wantStatus(t, rec, http.StatusBadRequest)
}

func TestSearchIndexLeavesTrashOutAndTakesARestoredDrawingBack(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, str("budget")), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)
	if got := searchIndex(t, api); len(got) != 0 {
		t.Errorf("index = %v, want the trashed drawing left out", got)
	}
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(false)), http.StatusOK)
	wantText(t, searchIndex(t, api), docID, "budget")
}

func TestSearchIndexForgetsADeletedDrawing(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, str("budget")), http.StatusOK)
	wantStatus(t, api.do(http.MethodDelete, "/api/drawings/"+docID, ""), http.StatusNoContent)
	if got := searchIndex(t, api); len(got) != 0 {
		t.Errorf("index = %v, want empty", got)
	}
}

func putSearchText(api *testAPI, id, query, body string) *httptest.ResponseRecorder {
	return api.do(http.MethodPut, "/api/drawings/"+id+"/search-text"+query, body)
}

func TestPutSearchTextSetsTheTextWithoutTouchingUpdatedAt(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, nil), http.StatusOK)
	api.now = time.UnixMilli(9_000)
	long := strings.Repeat("lorem ipsum ", 5000)
	wantStatus(t, putSearchText(api, docID, "", long), http.StatusNoContent)
	wantText(t, searchIndex(t, api), docID, long)

	list := listSummaries(t, api)
	if len(list) != 1 || list[0].UpdatedAt != 1_000 {
		t.Errorf("list = %+v, want updatedAt 1000", list)
	}
}

func TestPutSearchTextOverwritesExistingText(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, str("old")), http.StatusOK)
	wantStatus(t, putSearchText(api, docID, "", "new"), http.StatusNoContent)
	wantText(t, searchIndex(t, api), docID, "new")
}

func TestPutSearchTextIfUnsetNeverOverwrites(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, nil), http.StatusOK)
	wantStatus(t, putSearchText(api, docID, "?ifUnset=true", "first"), http.StatusNoContent)
	wantStatus(t, putSearchText(api, docID, "?ifUnset=true", "second"), http.StatusNoContent)
	wantText(t, searchIndex(t, api), docID, "first")
}

func TestPutSearchTextErrors(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, putWithText(api, docID, nil), http.StatusOK)
	wantStatus(t, putSearchText(api, "missing", "", "x"), http.StatusNotFound)
	wantStatus(t, putSearchText(api, "missing", "?ifUnset=true", "x"), http.StatusNoContent)
	wantStatus(t, putSearchText(api, docID, "", "\xff\xfe"), http.StatusBadRequest)
	wantStatus(t, putSearchText(api, docID, "", strings.Repeat("a", maxSearchTextBytes+1)), http.StatusRequestEntityTooLarge)
	if text := searchIndex(t, api)[docID]; text != nil {
		t.Errorf("text = %q, want it unchanged (null) after the rejected requests", *text)
	}
}

func TestSearchRoutesNeedAnAllowedOrigin(t *testing.T) {
	api := newTestAPI(t)
	for _, c := range []struct{ method, path string }{
		{http.MethodGet, "/api/search-index"},
		{http.MethodPut, "/api/drawings/" + docID + "/search-text"},
	} {
		req := httptest.NewRequest(c.method, c.path, strings.NewReader("x"))
		req.Header.Set("Origin", "http://evil.example")
		rec := httptest.NewRecorder()
		api.handler.ServeHTTP(rec, req)
		wantStatus(t, rec, http.StatusForbidden)
	}
}
