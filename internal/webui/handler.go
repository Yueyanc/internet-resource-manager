package webui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:assets
var assets embed.FS

func Handler() http.Handler {
	files, err := fs.Sub(assets, "assets")
	if err != nil {
		panic(err)
	}
	server := http.FileServerFS(files)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if _, err := fs.Stat(files, "index.html"); err != nil {
			http.Error(w, "Frontend is not built. Run pnpm build, or use the Vite dev server.", http.StatusServiceUnavailable)
			return
		}
		clean := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if info, err := fs.Stat(files, clean); err == nil && !info.IsDir() && !strings.HasPrefix(clean, ".") {
			server.ServeHTTP(w, r)
			return
		}
		if path.Ext(clean) != "" {
			http.NotFound(w, r)
			return
		}
		index, err := fs.ReadFile(files, "index.html")
		if err != nil {
			http.Error(w, "Frontend unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method == http.MethodGet {
			_, _ = w.Write(index)
		}
	})
}
