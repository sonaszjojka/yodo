package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/sonaszjojka/yodo/server/internal/db"
)

// Field limits for a folder (ADR 0045). The client enforces its own sets of
// icons and colours; the server only keeps the strings small and non-empty.
const (
	maxFolderBytes = 4 << 10
	maxNameRunes   = 200
	maxKeyRunes    = 64
)

// folder matches Folder in web/src/storage/folders.ts.
type folder struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	Color     string `json:"color"`
	CreatedAt int64  `json:"createdAt"`
}

func newFolder(row db.Folder) folder {
	return folder(row)
}

// foldersAPI serves /api/folders, one route per FolderRepository method (ADR 0045).
type foldersAPI struct {
	queries *db.Queries
	now     func() time.Time
}

func (a foldersAPI) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/folders", a.list)
	mux.HandleFunc("PUT /api/folders/{id}", a.put)
	mux.HandleFunc("DELETE /api/folders/{id}", a.delete)
}

func (a foldersAPI) list(w http.ResponseWriter, r *http.Request) {
	rows, err := a.queries.ListFolders(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	out := make([]folder, 0, len(rows))
	for _, row := range rows {
		out = append(out, newFolder(row))
	}
	writeJSON(w, r, http.StatusOK, out)
}

func (a foldersAPI) put(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxFolderBytes))
	if err != nil {
		if maxErr := (*http.MaxBytesError)(nil); errors.As(err, &maxErr) {
			http.Error(w, "folder too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "could not read body", http.StatusBadRequest)
		return
	}
	// A map, not a struct: encoding/json would match "ID" to id, but the
	// browser's JSON.parse sees a different key (see parseDocumentMeta).
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		http.Error(w, "body must be a JSON folder: "+err.Error(), http.StatusBadRequest)
		return
	}
	var id, name, icon, color string
	for key, dst := range map[string]*string{"id": &id, "name": &name, "icon": &icon, "color": &color} {
		raw, ok := fields[key]
		if !ok || json.Unmarshal(raw, dst) != nil {
			http.Error(w, "folder "+key+" must be a string", http.StatusBadRequest)
			return
		}
	}
	switch {
	case id != r.PathValue("id"):
		http.Error(w, "folder id must match the URL", http.StatusBadRequest)
		return
	case !validText(name, maxNameRunes) || !validText(icon, maxKeyRunes) || !validText(color, maxKeyRunes):
		http.Error(w, "folder name, icon and color must be non-empty and short", http.StatusBadRequest)
		return
	}
	row, err := a.queries.UpsertFolder(r.Context(), db.UpsertFolderParams{
		ID: id, Name: name, Icon: icon, Color: color, Now: a.now().UnixMilli(),
	})
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, newFolder(row))
}

func validText(s string, maxRunes int) bool {
	return s != "" && utf8.RuneCountInString(s) <= maxRunes
}

func (a foldersAPI) delete(w http.ResponseWriter, r *http.Request) {
	if err := a.queries.DeleteFolder(r.Context(), r.PathValue("id")); err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
