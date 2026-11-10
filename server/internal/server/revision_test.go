package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// doWith is do with extra request headers.
func (a *testAPI) doWith(method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Origin", "http://example.com")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	a.handler.ServeHTTP(rec, req)
	return rec
}

func ifMatch(tag string) map[string]string { return map[string]string{"If-Match": tag} }

func TestParseIfMatch(t *testing.T) {
	tests := []struct {
		name    string
		values  []string
		want    int64
		present bool
		wantErr bool
	}{
		{name: "absent", values: nil, present: false},
		{name: "one", values: []string{`"1"`}, want: 1, present: true},
		{name: "many digits", values: []string{`"42"`}, want: 42, present: true},
		{name: "spaces", values: []string{` "7" `}, want: 7, present: true},
		// Present but empty is malformed, never "no precondition" (review round 1, finding 3).
		{name: "empty", values: []string{""}, present: true, wantErr: true},
		{name: "blank", values: []string{"   "}, present: true, wantErr: true},
		{name: "two headers", values: []string{`"1"`, `"2"`}, present: true, wantErr: true},
		{name: "star", values: []string{`*`}, present: true, wantErr: true},
		{name: "weak", values: []string{`W/"1"`}, present: true, wantErr: true},
		{name: "list", values: []string{`"1", "2"`}, present: true, wantErr: true},
		{name: "unquoted", values: []string{`1`}, present: true, wantErr: true},
		{name: "not a number", values: []string{`"abc"`}, present: true, wantErr: true},
		{name: "zero", values: []string{`"0"`}, present: true, wantErr: true},
		{name: "negative", values: []string{`"-1"`}, present: true, wantErr: true},
		{name: "plus", values: []string{`"+1"`}, present: true, wantErr: true},
		{name: "empty tag", values: []string{`""`}, present: true, wantErr: true},
		{name: "overflow", values: []string{`"99999999999999999999"`}, present: true, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, present, err := parseIfMatch(tt.values)
			if present != tt.present || (err != nil) != tt.wantErr || (err == nil && got != tt.want) {
				t.Errorf("parseIfMatch(%q) = %d, %v, %v; want %d, %v, err=%v",
					tt.values, got, present, err, tt.want, tt.present, tt.wantErr)
			}
		})
	}
}

func TestPutWithAnEmptyIfMatchIsABadRequestNotAnOverwrite(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	stale := strings.Replace(doc, `"Plan"`, `"Stale"`, 1)
	rec := api.doWith(http.MethodPut, "/api/drawings/"+docID, stale, ifMatch(""))
	wantStatus(t, rec, http.StatusBadRequest)
	if got := api.do(http.MethodGet, "/api/drawings/"+docID, "").Body.String(); got != doc {
		t.Errorf("document = %q, want the unchanged %q", got, doc)
	}
}

func TestRevisionStartsAtOneAndCountsSaves(t *testing.T) {
	api := newTestAPI(t)
	for want := int64(1); want <= 3; want++ {
		rec := api.do(http.MethodPut, "/api/drawings/"+docID, doc)
		wantStatus(t, rec, http.StatusOK)
		if got := decodeSummary(t, rec).Revision; got != want {
			t.Errorf("revision = %d, want %d", got, want)
		}
		if got, wantTag := rec.Header().Get("ETag"), etag(want); got != wantTag {
			t.Errorf("ETag = %q, want %q", got, wantTag)
		}
	}
}

func TestGetAndHeadCarryTheETag(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)

	rec := api.do(http.MethodGet, "/api/drawings/"+docID, "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Header().Get("ETag"); got != `"2"` {
		t.Errorf("GET ETag = %q, want %q", got, `"2"`)
	}

	rec = api.do(http.MethodHead, "/api/drawings/"+docID, "")
	wantStatus(t, rec, http.StatusOK)
	if got := rec.Header().Get("ETag"); got != `"2"` {
		t.Errorf("HEAD ETag = %q, want %q", got, `"2"`)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("HEAD body = %q, want empty", rec.Body.String())
	}

	rec = api.do(http.MethodHead, "/api/drawings/missing", "")
	wantStatus(t, rec, http.StatusNotFound)
	if got := rec.Header().Get("ETag"); got != "" {
		t.Errorf("HEAD missing ETag = %q, want none", got)
	}
}

func TestPutWithMatchingIfMatchSaves(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)

	api.now = time.UnixMilli(5_000)
	changed := strings.Replace(doc, `"Plan"`, `"Final"`, 1)
	rec := api.doWith(http.MethodPut, "/api/drawings/"+docID, changed, ifMatch(`"1"`))
	wantStatus(t, rec, http.StatusOK)
	want := summary{ID: docID, Name: "Final", CreatedAt: 1_000, UpdatedAt: 5_000, Revision: 2}
	if got := decodeSummary(t, rec); got != want {
		t.Errorf("summary = %+v, want %+v", got, want)
	}
	if got := rec.Header().Get("ETag"); got != `"2"` {
		t.Errorf("ETag = %q, want %q", got, `"2"`)
	}
	if got := api.do(http.MethodGet, "/api/drawings/"+docID, "").Body.String(); got != changed {
		t.Errorf("document = %q, want %q", got, changed)
	}
}

func TestPutWithStaleIfMatchIsRejectedAndStoresNothing(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)

	changed := strings.Replace(doc, `"Plan"`, `"Stale"`, 1)
	rec := api.doWith(http.MethodPut, "/api/drawings/"+docID, changed, ifMatch(`"1"`))
	wantStatus(t, rec, http.StatusPreconditionFailed)
	if got := rec.Header().Get("ETag"); got != `"2"` {
		t.Errorf("ETag = %q, want the current %q", got, `"2"`)
	}
	get := api.do(http.MethodGet, "/api/drawings/"+docID, "")
	if get.Body.String() != doc {
		t.Errorf("document = %q, want the unchanged %q", get.Body.String(), doc)
	}
	if got := get.Header().Get("ETag"); got != `"2"` {
		t.Errorf("revision moved: ETag = %q", got)
	}
}

func TestPutWithIfMatchOnAMissingDrawingCreatesNothing(t *testing.T) {
	api := newTestAPI(t)
	rec := api.doWith(http.MethodPut, "/api/drawings/"+docID, doc, ifMatch(`"1"`))
	wantStatus(t, rec, http.StatusPreconditionFailed)
	if got := rec.Header().Get("ETag"); got != "" {
		t.Errorf("ETag = %q, want none", got)
	}
	wantStatus(t, api.do(http.MethodGet, "/api/drawings/"+docID, ""), http.StatusNotFound)
}

func TestPutWithMalformedIfMatchIsABadRequest(t *testing.T) {
	api := newTestAPI(t)
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID, doc), http.StatusOK)
	for _, tag := range []string{`*`, `W/"1"`, `"1", "2"`, `1`, `"x"`} {
		rec := api.doWith(http.MethodPut, "/api/drawings/"+docID, doc, ifMatch(tag))
		wantStatus(t, rec, http.StatusBadRequest)
	}
	if got := api.do(http.MethodGet, "/api/drawings/"+docID, "").Header().Get("ETag"); got != `"1"` {
		t.Errorf("a rejected save moved the revision: ETag = %q", got)
	}
}

func TestConditionalSaveKeepsFolderAndTrash(t *testing.T) {
	api := newTestAPI(t)
	putDrawing(t, api, docID, "Plan")
	wantStatus(t, api.do(http.MethodPut, "/api/drawings/"+docID+"/trash", trashBody(true)), http.StatusOK)
	rec := api.doWith(http.MethodPut, "/api/drawings/"+docID, doc, ifMatch(`"1"`))
	wantStatus(t, rec, http.StatusOK)
	if s := decodeSummary(t, rec); s.DeletedAt == nil || s.Revision != 2 {
		t.Errorf("summary = %+v, want still trashed at revision 2", s)
	}
}

func TestMoveTrashAndRestoreKeepTheRevision(t *testing.T) {
	api := newTestAPI(t)
	putDrawing(t, api, docID, "Plan")
	putDrawing(t, api, docID, "Plan")
	for _, step := range []struct{ path, body string }{
		{"/trash", trashBody(true)},
		{"/trash", trashBody(false)},
		{"/folder", `{"folderId":null}`},
	} {
		rec := api.do(http.MethodPut, "/api/drawings/"+docID+step.path, step.body)
		wantStatus(t, rec, http.StatusOK)
		if got := decodeSummary(t, rec).Revision; got != 2 {
			t.Errorf("%s %s: revision = %d, want 2", step.path, step.body, got)
		}
	}
}
