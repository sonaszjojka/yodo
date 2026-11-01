// Package webui embeds the built web app. The build copies web/dist into
// dist/ here, since go:embed cannot reach outside the package (ADR 0019).
package webui

import (
	"embed"
	"io/fs"
)

// all: keeps the committed .gitkeep, so the package compiles without a build.
//
//go:embed all:dist
var dist embed.FS

// FS returns the web app with index.html at its root.
func FS() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // unreachable: "dist" is a valid path
	}
	return sub
}
