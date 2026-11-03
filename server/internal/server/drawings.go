package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
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
	mux.HandleFunc("DELETE /api/drawings/{id}", a.delete)
}

func (a drawingsAPI) list(w http.ResponseWriter, r *http.Request) {
	rows, err := a.queries.ListDrawings(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	// make, not nil: an empty list must encode as [] rather than null.
	out := make([]summary, 0, len(rows))
	for _, row := range rows {
		out = append(out, summary(row))
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
	writeJSON(w, r, http.StatusOK, summary(row))
}

func (a drawingsAPI) delete(w http.ResponseWriter, r *http.Request) {
	if err := a.queries.DeleteDrawing(r.Context(), r.PathValue("id")); err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
