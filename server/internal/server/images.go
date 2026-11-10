package server

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

// maxImageBytes bounds an image upload (ADR 0040).
const maxImageBytes = 10 << 20

// hashPattern is the only file name the image store accepts: a lowercase hex
// SHA-256. Checking it first also rules out path traversal.
var hashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// imageTypes are the content types the store accepts, as sniffed from the
// bytes (ADR 0040). SVG is left out: served back from this origin it could
// run scripts.
var imageTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/gif":  true,
	"image/webp": true,
}

// imagesAPI serves /api/images: a content-addressed blob store, one file per
// image named by its hash under dir (ADR 0040).
type imagesAPI struct {
	dir string
	// private keeps shared caches from serving the bytes to someone who has
	// not logged in (ADR 0020).
	private bool
}

func (a imagesAPI) register(mux *http.ServeMux) {
	mux.HandleFunc("PUT /api/images/{hash}", a.put)
	mux.HandleFunc("GET /api/images/{hash}", a.get)
}

func (a imagesAPI) put(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if !hashPattern.MatchString(hash) {
		http.Error(w, "image hash must be 64 lowercase hex characters", http.StatusBadRequest)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxImageBytes))
	if err != nil {
		if maxErr := (*http.MaxBytesError)(nil); errors.As(err, &maxErr) {
			http.Error(w, "image too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "could not read body", http.StatusBadRequest)
		return
	}
	if !imageTypes[http.DetectContentType(body)] {
		http.Error(w, "image must be PNG, JPEG, GIF or WebP", http.StatusUnsupportedMediaType)
		return
	}
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != hash {
		http.Error(w, "body does not match the hash in the URL", http.StatusBadRequest)
		return
	}
	if err := a.write(hash, body); err != nil {
		serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// write stores the bytes unless the hash is already there. It writes a temp
// file in the same directory and renames it, so a reader never sees half an
// image and a crash leaves no partial file under the final name.
func (a imagesAPI) write(hash string, body []byte) error {
	final := filepath.Join(a.dir, hash)
	if _, err := os.Stat(final); err == nil {
		return nil
	}
	if err := os.MkdirAll(a.dir, 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(a.dir, ".upload-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }() // no-op after a successful rename
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), final)
}

func (a imagesAPI) get(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if !hashPattern.MatchString(hash) {
		http.Error(w, "image hash must be 64 lowercase hex characters", http.StatusBadRequest)
		return
	}
	body, err := os.ReadFile(filepath.Join(a.dir, hash))
	if errors.Is(err, os.ErrNotExist) {
		http.Error(w, "image not found", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", http.DetectContentType(body))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// The URL is the content's hash, so the bytes behind it never change.
	if a.private {
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		// Authorization too: an API-token response must not be reused for a
		// request without the token (ADR 0063).
		w.Header().Set("Vary", "Cookie, Authorization")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	_, _ = w.Write(body)
}
