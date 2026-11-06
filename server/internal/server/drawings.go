package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

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
}

func newSummary(id, name string, createdAt, updatedAt int64, folderID sql.NullString, deletedAt sql.NullInt64) summary {
	s := summary{ID: id, Name: name, CreatedAt: createdAt, UpdatedAt: updatedAt}
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
	mux.HandleFunc("PUT /api/drawings/{id}", a.put)
	mux.HandleFunc("DELETE /api/drawings", a.emptyTrash)
	mux.HandleFunc("DELETE /api/drawings/{id}", a.delete)
	mux.HandleFunc("PUT /api/drawings/{id}/folder", a.move)
	mux.HandleFunc("PUT /api/drawings/{id}/trash", a.trash)
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
			out = append(out, newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt))
		}
	} else {
		rows, err := a.queries.ListDrawings(r.Context())
		if err != nil {
			serverError(w, r, err)
			return
		}
		for _, row := range rows {
			out = append(out, newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt))
		}
	}
	writeJSON(w, r, http.StatusOK, out)
}

func (a drawingsAPI) get(w http.ResponseWriter, r *http.Request) {
	doc, err := a.queries.GetDrawingDocument(r.Context(), r.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "drawing not found", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, doc)
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

	row, err := a.queries.UpsertDrawing(r.Context(), db.UpsertDrawingParams{
		ID:            id,
		Name:          *meta.Name,
		SchemaVersion: *meta.SchemaVersion,
		Document:      string(body),
		Now:           a.now().UnixMilli(),
	})
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt))
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
	if raw := query.Get("deletedBefore"); raw != "" {
		cutoff, parseErr := strconv.ParseInt(raw, 10, 64)
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
		row, err = newSummary(res.ID, res.Name, res.CreatedAt, res.UpdatedAt, res.FolderID, res.DeletedAt), e
	} else {
		res, e := a.queries.RestoreDrawing(r.Context(), id)
		row, err = newSummary(res.ID, res.Name, res.CreatedAt, res.UpdatedAt, res.FolderID, res.DeletedAt), e
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
		writeJSON(w, r, http.StatusOK, newSummary(row.ID, row.Name, row.CreatedAt, row.UpdatedAt, row.FolderID, row.DeletedAt))
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
