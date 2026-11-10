package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/sonaszjojka/yodo/server/internal/db"
)

// maxDocumentBytes bounds a PUT body (ADR 0030). Images are stored apart from
// the document (ADR 0013), so real drawings stay far below it.
const maxDocumentBytes = 16 << 20

// summary is a drawing's metadata, matching DrawingSummary in
// web/src/storage/repository.ts. Times are epoch milliseconds.
type summary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	// FolderID is left out of the JSON for a drawing in no folder (ADR 0045).
	FolderID *string `json:"folderId,omitempty"`
	// DeletedAt is left out of the JSON for a drawing that is not in Trash (ADR 0046).
	DeletedAt *int64 `json:"deletedAt,omitempty"`
	// Revision counts saves, starting at 1; it is also the ETag (ADR 0062).
	Revision int64 `json:"revision"`
}

func newSummary(id, name string, createdAt, updatedAt int64, folderID sql.NullString, deletedAt sql.NullInt64, revision int64) summary {
	s := summary{ID: id, Name: name, CreatedAt: createdAt, UpdatedAt: updatedAt, Revision: revision}
	if folderID.Valid {
		s.FolderID = &folderID.String
	}
	if deletedAt.Valid {
		s.DeletedAt = &deletedAt.Int64
	}
	return s
}

// drawingsAPI serves /api/drawings, one route per DrawingRepository method
// (ADR 0030). The document stays opaque: only its top-level id, name and
// schemaVersion are read (ADR 0013).
type drawingsAPI struct {
	queries *db.Queries
	now     func() time.Time
}

func (a drawingsAPI) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/drawings", a.list)
	mux.HandleFunc("GET /api/drawings/{id}", a.get)
	mux.HandleFunc("HEAD /api/drawings/{id}", a.head)
	mux.HandleFunc("PUT /api/drawings/{id}", a.put)
	mux.HandleFunc("DELETE /api/drawings", a.emptyTrash)
	mux.HandleFunc("DELETE /api/drawings/{id}", a.delete)
	mux.HandleFunc("PUT /api/drawings/{id}/folder", a.move)
	mux.HandleFunc("PUT /api/drawings/{id}/trash", a.trash)
	mux.HandleFunc("PUT /api/drawings/{id}/search-text", a.putSearchText)
	mux.HandleFunc("GET /api/search-index", a.searchIndex)
}

const (
	// searchTextHeader carries a drawing's canvas text, percent-encoded, on a
	// save (ADR 0047). The body stays the raw document.
	searchTextHeader = "X-Yodo-Search-Text"
	// maxHeaderSearchText bounds the decoded header text. The client sends at
	// most about 6 KB encoded; longer text goes to PUT …/search-text.
	maxHeaderSearchText = 16 << 10
	// maxSearchTextBytes bounds the body of PUT …/search-text. The text comes
	// from a document, which is bounded by maxDocumentBytes, so it is never
	// cut: a cut would make the end of a long drawing unsearchable (ADR 0047).
	maxSearchTextBytes = maxDocumentBytes
)

// searchTextFromHeader reads the optional header. an absent header gives
// an invalid NullString (the column becomes NULL); err is set for a malformed value.
func searchTextFromHeader(r *http.Request) (sql.NullString, error) {
	values := r.Header.Values(searchTextHeader)
	switch len(values) {
	case 0:
		return sql.NullString{}, nil
	case 1:
	default:
		return sql.NullString{}, errors.New(searchTextHeader + " must be sent once")
	}
	decoded, err := url.PathUnescape(values[0])
	if err != nil {
		return sql.NullString{}, fmt.Errorf("%s is not percent-encoded: %w", searchTextHeader, err)
	}
	if len(decoded) > maxHeaderSearchText {
		return sql.NullString{}, errors.New(searchTextHeader + " is too long")
	}
	if !utf8.ValidString(decoded) {
		return sql.NullString{}, errors.New(searchTextHeader + " is not UTF-8")
	}
	return sql.NullString{String: decoded, Valid: true}, nil
}

// searchIndexEntry is one drawing's canvas text; SearchText is null for a
// drawing that is not indexed yet (ADR 0047).
type searchIndexEntry struct {
	ID         string  `json:"id"`
	SearchText *string `json:"searchText"`
}

// searchIndex serves the canvas text of every live drawing, without documents.
func (a drawingsAPI) searchIndex(w http.ResponseWriter, r *http.Request) {
	rows, err := a.queries.ListSearchIndex(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	out := make([]searchIndexEntry, 0, len(rows))
	for _, row := range rows {
		entry := searchIndexEntry{ID: row.ID}
		if row.SearchText.Valid {
			entry.SearchText = &row.SearchText.String
		}
		out = append(out, entry)
	}
	writeJSON(w, r, http.StatusOK, out)
}

// putSearchText sets only a drawing's canvas text (body: the text, UTF-8). It
// covers what the header can't: text too long for it, and the backfill of
// drawings saved before search existed, which passes ?ifUnset=true so it never
// overwrites text a save stored meanwhile. updated_at is untouched (ADR 0047).
func (a drawingsAPI) putSearchText(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxSearchTextBytes))
	if err != nil {
		if maxErr := (*http.MaxBytesError)(nil); errors.As(err, &maxErr) {
			http.Error(w, "search text too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "could not read body", http.StatusBadRequest)
		return
	}
	if !utf8.Valid(body) {
		http.Error(w, "search text must be UTF-8", http.StatusBadRequest)
		return
	}
	id := r.PathValue("id")
	text := sql.NullString{String: string(body), Valid: true}
	if r.URL.Query().Get("ifUnset") == "true" {
		// Nothing to report when it was already set, or the drawing is gone.
		err = a.queries.SetSearchTextIfUnset(r.Context(), db.SetSearchTextIfUnsetParams{ID: id, SearchText: text})
	} else {
		var n int64
		n, err = a.queries.SetSearchText(r.Context(), db.SetSearchTextParams{ID: id, SearchText: text})
		if err == nil && n == 0 {
			http.Error(w, "drawing not found", http.StatusNotFound)
			return
		}
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// list serves the live drawings, or the drawings in Trash with ?trashed=true
// (ADR 0046).
func (a drawingsAPI) list(w http.ResponseWriter, r *http.Request) {
	out := make([]summary, 0) // not nil: an empty list must encode as [] rather than null
	if r.URL.Query().Get("trashed") == "true" {
		rows, err := a.queries.ListTrashedDrawings(r.Context())
		if err != nil {
			serverError(w, r, err)
			return
		}
		for _, row := range rows {
			out = append(out, newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt, row.Revision))
		}
	} else {
		rows, err := a.queries.ListDrawings(r.Context())
		if err != nil {
			serverError(w, r, err)
			return
		}
		for _, row := range rows {
			out = append(out, newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt, row.Revision))
		}
	}
	writeJSON(w, r, http.StatusOK, out)
}

func (a drawingsAPI) get(w http.ResponseWriter, r *http.Request) {
	row, err := a.queries.GetDrawingDocument(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "drawing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", etag(row.Revision))
	_, _ = io.WriteString(w, row.Document)
}

// head returns a drawing's ETag without reading its document, so the editor
// can check for a newer version cheaply (ADR 0062). The explicit HEAD route is
// more specific than GET's implicit one, so the mux picks it.
func (a drawingsAPI) head(w http.ResponseWriter, r *http.Request) {
	revision, err := a.queries.GetDrawingRevision(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.Header().Set("ETag", etag(revision))
	w.WriteHeader(http.StatusOK)
}

// etag is a revision as a strong entity tag: "<n>" (ADR 0062).
func etag(revision int64) string {
	return `"` + strconv.FormatInt(revision, 10) + `"`
}

// parseIfMatch reads the If-Match header values (ADR 0062). Only a header
// that is absent means an unconditional save; an empty one is malformed, so a
// client bug can never turn into an overwrite. Yodo's only client sends
// exactly one strong tag of a positive revision, so anything else (*, a weak
// tag, a list, several headers) is reported as malformed instead of being
// matched loosely; a deliberate narrowing of RFC 9110 §13.1.1.
func parseIfMatch(values []string) (revision int64, present bool, err error) {
	if len(values) == 0 {
		return 0, false, nil
	}
	if len(values) > 1 {
		return 0, true, errors.New(`If-Match must be one revision tag like "3"`)
	}
	header := strings.TrimSpace(values[0])
	inner, ok := strings.CutPrefix(header, `"`)
	if ok {
		inner, ok = strings.CutSuffix(inner, `"`)
	}
	if !ok || inner == "" || strings.ContainsFunc(inner, func(c rune) bool { return c < '0' || c > '9' }) {
		return 0, true, errors.New(`If-Match must be one revision tag like "3"`)
	}
	revision, err = strconv.ParseInt(inner, 10, 64)
	if err != nil || revision < 1 {
		return 0, true, errors.New(`If-Match must be one revision tag like "3"`)
	}
	return revision, true, nil
}

// documentMeta is the part of a document the server reads. Pointers tell a
// missing or null field apart from a zero value.
type documentMeta struct {
	ID            *string
	Name          *string
	SchemaVersion *int64
}

// parseDocumentMeta reads the top-level id, name and schemaVersion the way
// the browser's JSON.parse does: keys match exactly and a duplicate key's last
// value wins. Unmarshalling into a struct would also accept "ID" or "Name"
// (encoding/json matches field names case-insensitively), so the stored
// metadata could disagree with the document the client reads back.
func parseDocumentMeta(body []byte) (documentMeta, error) {
	// Unmarshal checks that the whole body is valid JSON before decoding, so
	// what gets stored is always one valid JSON object.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return documentMeta{}, err
	}
	var meta documentMeta
	for key, dst := range map[string]any{"id": &meta.ID, "name": &meta.Name, "schemaVersion": &meta.SchemaVersion} {
		if raw, ok := fields[key]; ok {
			if err := json.Unmarshal(raw, dst); err != nil {
				return documentMeta{}, fmt.Errorf("%s: %w", key, err)
			}
		}
	}
	return meta, nil
}

func (a drawingsAPI) put(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxDocumentBytes))
	if err != nil {
		if maxErr := (*http.MaxBytesError)(nil); errors.As(err, &maxErr) {
			http.Error(w, "document too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "could not read body", http.StatusBadRequest)
		return
	}
	meta, err := parseDocumentMeta(body)
	if err != nil {
		http.Error(w, "body must be a JSON drawing document: "+err.Error(), http.StatusBadRequest)
		return
	}
	id := r.PathValue("id")
	switch {
	case meta.ID == nil || *meta.ID != id:
		http.Error(w, "document id must match the URL", http.StatusBadRequest)
		return
	case meta.Name == nil:
		http.Error(w, "document name is missing", http.StatusBadRequest)
		return
	case meta.SchemaVersion == nil || *meta.SchemaVersion < 1:
		http.Error(w, "document schemaVersion must be a positive integer", http.StatusBadRequest)
		return
	}

	searchText, err := searchTextFromHeader(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	expected, conditional, err := parseIfMatch(r.Header.Values("If-Match"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var saved summary
	if conditional {
		row, err := a.queries.UpdateDrawingIfRevision(r.Context(), db.UpdateDrawingIfRevisionParams{
			ID:               id,
			Name:             *meta.Name,
			SchemaVersion:    *meta.SchemaVersion,
			Document:         string(body),
			Now:              a.now().UnixMilli(),
			SearchText:       searchText,
			ExpectedRevision: expected,
		})
		if errors.Is(err, sql.ErrNoRows) {
			a.preconditionFailed(w, r, id)
			return
		}
		if err != nil {
			serverError(w, r, err)
			return
		}
		saved = newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt, row.Revision)
	} else {
		row, err := a.queries.UpsertDrawing(r.Context(), db.UpsertDrawingParams{
			ID:            id,
			Name:          *meta.Name,
			SchemaVersion: *meta.SchemaVersion,
			Document:      string(body),
			Now:           a.now().UnixMilli(),
			SearchText:    searchText,
		})
		if err != nil {
			serverError(w, r, err)
			return
		}
		saved = newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt, row.Revision)
	}
	w.Header().Set("ETag", etag(saved.Revision))
	writeJSON(w, r, http.StatusOK, saved)
}

// preconditionFailed answers a conditional save that lost (ADR 0062): 412,
// with the current ETag so the client knows which revision won, or without
// one when the drawing no longer exists.
func (a drawingsAPI) preconditionFailed(w http.ResponseWriter, r *http.Request, id string) {
	revision, err := a.queries.GetDrawingRevision(r.Context(), id)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		serverError(w, r, err)
		return
	}
	if err == nil {
		w.Header().Set("ETag", etag(revision))
	}
	http.Error(w, "the drawing has a newer revision", http.StatusPreconditionFailed)
}

func (a drawingsAPI) delete(w http.ResponseWriter, r *http.Request) {
	if err := a.queries.DeleteDrawing(r.Context(), r.PathValue("id")); err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// emptyTrash permanently removes the drawings in Trash: all of them, or only
// those trashed before ?deletedBefore=<ms> (the retention sweep, ADR 0046).
// ?trashed=true is required, so a bare DELETE can never wipe everything.
func (a drawingsAPI) emptyTrash(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if query.Get("trashed") != "true" {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "DELETE /api/drawings needs ?trashed=true", http.StatusMethodNotAllowed)
		return
	}
	var err error
	// Has, not Get != "": an empty value is malformed, not an absent cutoff.
	if query.Has("deletedBefore") {
		cutoff, parseErr := strconv.ParseInt(query.Get("deletedBefore"), 10, 64)
		if parseErr != nil {
			http.Error(w, "deletedBefore must be an integer", http.StatusBadRequest)
			return
		}
		err = a.queries.DeleteTrashedDrawingsBefore(r.Context(), sql.NullInt64{Int64: cutoff, Valid: true})
	} else {
		err = a.queries.DeleteTrashedDrawings(r.Context())
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// trash moves a drawing to Trash or back with {"trashed": bool} (ADR 0046).
// It never touches the document, the folder or updatedAt.
func (a drawingsAPI) trash(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxMoveBytes))
	if err != nil {
		http.Error(w, "could not read body", http.StatusBadRequest)
		return
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		http.Error(w, "body must be a JSON object", http.StatusBadRequest)
		return
	}
	// A pointer, because null would otherwise decode into false: a restore.
	var flag *bool
	if raw, ok := fields["trashed"]; !ok || json.Unmarshal(raw, &flag) != nil || flag == nil {
		http.Error(w, "trashed must be true or false", http.StatusBadRequest)
		return
	}
	trashed := *flag
	id := r.PathValue("id")
	var row summary
	if trashed {
		res, e := a.queries.TrashDrawing(r.Context(), db.TrashDrawingParams{ID: id, Now: sql.NullInt64{Int64: a.now().UnixMilli(), Valid: true}})
		row, err = newSummary(res.ID, res.Name, res.CreatedAt, res.UpdatedAt, res.FolderID, res.DeletedAt, res.Revision), e
	} else {
		res, e := a.queries.RestoreDrawing(r.Context(), id)
		row, err = newSummary(res.ID, res.Name, res.CreatedAt, res.UpdatedAt, res.FolderID, res.DeletedAt, res.Revision), e
	}
	switch {
	case errors.Is(err, sql.ErrNoRows):
		http.Error(w, "drawing not found", http.StatusNotFound)
	case err != nil:
		serverError(w, r, err)
	default:
		writeJSON(w, r, http.StatusOK, row)
	}
}

// maxMoveBytes bounds the body of a move: one id or null.
const maxMoveBytes = 1 << 10

// move puts a drawing into a folder, or out of any folder with null (ADR 0045).
// It never touches the document or updatedAt.
func (a drawingsAPI) move(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxMoveBytes))
	if err != nil {
		http.Error(w, "could not read body", http.StatusBadRequest)
		return
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		http.Error(w, "body must be a JSON object", http.StatusBadRequest)
		return
	}
	raw, ok := fields["folderId"]
	if !ok {
		http.Error(w, "folderId is missing", http.StatusBadRequest)
		return
	}
	var folderID *string
	if err := json.Unmarshal(raw, &folderID); err != nil {
		http.Error(w, "folderId must be a string or null", http.StatusBadRequest)
		return
	}
	param := sql.NullString{}
	if folderID != nil {
		param = sql.NullString{String: *folderID, Valid: true}
	}
	row, err := a.queries.SetDrawingFolder(r.Context(), db.SetDrawingFolderParams{
		ID:       r.PathValue("id"),
		FolderID: param,
	})
	switch {
	case errors.Is(err, sql.ErrNoRows):
		http.Error(w, "drawing not found", http.StatusNotFound)
	case isForeignKeyError(err):
		http.Error(w, "folder not found", http.StatusBadRequest)
	case err != nil:
		serverError(w, r, err)
	default:
		writeJSON(w, r, http.StatusOK, newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt, row.Revision))
	}
}

// isForeignKeyError reports a violated FOREIGN KEY constraint, here a folder
// id that does not exist. The modernc driver puts SQLite's message in the error.
func isForeignKeyError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "FOREIGN KEY constraint failed")
}

func writeJSON(w http.ResponseWriter, r *http.Request, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(append(body, '\n'))
}

// serverError logs the cause and sends the client a generic 500, so database
// details don't leak into responses.
func serverError(w http.ResponseWriter, r *http.Request, err error) {
	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	http.Error(w, "internal server error", http.StatusInternalServerError)
}
