package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

const maxThemeArchive = 10 << 20

var themeFiles = []string{"catalogue.json", "media.json", "pages.json", "partials.json", "reviews.json", "shell.json", "tables.json", "templates.json", "theme.json"}

type Theme struct {
	ID, Name, Summary, Description, AuthorAccountID, Version, Categories, DemoURL, Status, SHA256, ArchiveKey string
	PreviewURLs                                                                                               []string
	ArchiveSize                                                                                               int64
	DefaultRank                                                                                               *int
	CreatedAt, UpdatedAt                                                                                      time.Time
}

func (t Theme) publicView(base string) map[string]any {
	return map[string]any{"id": t.ID, "name": t.Name, "summary": t.Summary, "description": t.Description,
		"version": t.Version, "categories": strings.Split(strings.Trim(t.Categories, ","), ","),
		"previewUrls": t.PreviewURLs, "demoUrl": t.DemoURL, "updatedAt": t.UpdatedAt.Format(time.RFC3339),
		"distribution": map[string]any{"downloadUrl": strings.TrimRight(base, "/") + "/v1/themes/" + t.ID + "/download",
			"url": strings.TrimRight(base, "/") + "/v1/themes/" + t.ID + "/download", "sha256": t.SHA256, "size": t.ArchiveSize}}
}

func (s *Store) themes(status string) ([]Theme, error) {
	rows, err := s.db.Query(`SELECT id,name,summary,description,author_account_id,version,categories,preview_urls,COALESCE(demo_url,''),status,sha256,archive_key,archive_size,default_rank,created_at,updated_at FROM themes WHERE status=? ORDER BY COALESCE(default_rank,2147483647), name`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Theme
	for rows.Next() {
		var t Theme
		var previews, created, updated string
		var rank *int
		if err := rows.Scan(&t.ID, &t.Name, &t.Summary, &t.Description, &t.AuthorAccountID, &t.Version, &t.Categories, &previews, &t.DemoURL, &t.Status, &t.SHA256, &t.ArchiveKey, &t.ArchiveSize, &rank, &created, &updated); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(previews), &t.PreviewURLs)
		t.DefaultRank = rank
		t.CreatedAt, _ = time.Parse(time.RFC3339, created)
		t.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) theme(id string) (Theme, error) {
	list, err := s.themes(StatusApproved)
	if err != nil {
		return Theme{}, err
	}
	for _, t := range list {
		if t.ID == id {
			return t, nil
		}
	}
	return Theme{}, ErrNotFound
}

func (a *API) listThemes(w http.ResponseWriter, r *http.Request) {
	rows, err := a.Store.themes(StatusApproved)
	if err != nil {
		writeError(w, 500, "internal", "could not read themes")
		return
	}
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	views := []map[string]any{}
	for _, t := range rows {
		if q != "" && !strings.Contains(strings.ToLower(t.Name+" "+t.Description), q) {
			continue
		}
		if category != "" && !strings.Contains(","+t.Categories+",", ","+category+",") {
			continue
		}
		views = append(views, t.publicView(a.PublicURL))
	}
	writeJSON(w, 200, map[string]any{"themes": views, "total": len(views)})
}
func (a *API) getTheme(w http.ResponseWriter, r *http.Request) {
	t, err := a.Store.theme(r.PathValue("id"))
	if err != nil {
		writeError(w, 404, "not_found", "no such theme")
		return
	}
	writeJSON(w, 200, map[string]any{"theme": t.publicView(a.PublicURL)})
}
func (a *API) defaultTheme(w http.ResponseWriter, r *http.Request) {
	rows, err := a.Store.themes(StatusApproved)
	if err != nil || len(rows) == 0 || rows[0].DefaultRank == nil {
		writeError(w, 404, "not_found", "no default theme")
		return
	}
	writeJSON(w, 200, map[string]any{"theme": rows[0].publicView(a.PublicURL)})
}
func (a *API) downloadTheme(w http.ResponseWriter, r *http.Request) {
	t, err := a.Store.theme(r.PathValue("id"))
	if err != nil || a.Blobs == nil {
		writeError(w, 404, "not_found", "no such theme")
		return
	}
	body, err := a.Blobs.Get("theme-"+t.ID, t.SHA256)
	if err != nil {
		writeError(w, 404, "not_found", "no such theme")
		return
	}
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("X-Checksum-Sha256", t.SHA256)
	_, _ = w.Write(body)
}

func validateTheme(body []byte, id string) error {
	gz, err := gzip.NewReader(strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	found := []string{}
	for {
		h, e := tr.Next()
		if e == io.EOF {
			break
		}
		if e != nil {
			return e
		}
		if h.Typeflag != tar.TypeReg {
			continue
		}
		name := h.Name[strings.LastIndex(h.Name, "/")+1:]
		found = append(found, name)
		if name == "theme.json" {
			data, _ := io.ReadAll(io.LimitReader(tr, 1<<20))
			var meta map[string]any
			if json.Unmarshal(data, &meta) != nil || meta["id"] != id {
				return ErrBadBlobKey
			}
		}
		if name == "media.json" {
			data, _ := io.ReadAll(io.LimitReader(tr, 1<<20))
			var media []map[string]any
			if json.Unmarshal(data, &media) != nil {
				return ErrNotGzip
			}
			for _, item := range media {
				url, _ := item["url"].(string)
				if url != "" && !strings.HasPrefix(url, "https://") {
					return ErrNotGzip
				}
			}
		}
	}
	sort.Strings(found)
	if strings.Join(found, ",") != strings.Join(themeFiles, ",") {
		return ErrNotGzip
	}
	return nil
}

func (a *API) submitTheme(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAccount(w, r)
	if !ok {
		return
	}
	if a.rateLimited(w, r, "theme-publish:"+account.ID) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxThemeArchive+(1<<20))
	if err := r.ParseMultipartForm(maxThemeArchive); err != nil {
		writeError(w, 413, "too_large", "theme archive is too large")
		return
	}
	id := strings.TrimSpace(r.FormValue("id"))
	name := strings.TrimSpace(r.FormValue("name"))
	version := strings.TrimSpace(r.FormValue("version"))
	if !idPattern.MatchString(id) || name == "" || version == "" {
		writeError(w, 422, "invalid_theme", "id, name and version are required")
		return
	}
	f, h, err := r.FormFile("archive")
	if err != nil {
		writeError(w, 422, "invalid_theme", "archive is required")
		return
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, maxThemeArchive+1))
	if err != nil || len(body) > maxThemeArchive || h.Size > maxThemeArchive {
		writeError(w, 413, "too_large", "theme archive is too large")
		return
	}
	if err := validateTheme(body, id); err != nil {
		writeError(w, 422, "invalid_theme", "archive does not match the theme format")
		return
	}
	sum := sha256.Sum256(body)
	sha := hex.EncodeToString(sum[:])
	if a.Blobs == nil || a.Blobs.Put("theme-"+id, sha, body) != nil {
		writeError(w, 500, "internal", "could not store theme")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	previews, _ := json.Marshal([]string{})
	result, err := a.Store.db.Exec(`INSERT INTO themes(id,name,summary,description,author_account_id,version,categories,preview_urls,status,sha256,archive_key,archive_size,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,summary=excluded.summary,description=excluded.description,version=excluded.version,categories=excluded.categories,status='pending',sha256=excluded.sha256,archive_key=excluded.archive_key,archive_size=excluded.archive_size,updated_at=excluded.updated_at WHERE themes.author_account_id=excluded.author_account_id`, id, name, r.FormValue("summary"), r.FormValue("description"), account.ID, version, r.FormValue("categories"), string(previews), StatusPending, sha, "theme-"+id, int64(len(body)), now, now)
	if err != nil {
		writeError(w, 500, "internal", "could not record theme")
		return
	}
	if n, _ := result.RowsAffected(); n == 0 {
		writeError(w, 409, "conflict", "that theme id is owned by another account")
		return
	}
	writeJSON(w, 202, map[string]any{"id": id, "status": StatusPending, "sha256": sha})
}
func (a *API) approveTheme(w http.ResponseWriter, r *http.Request) {
	account, signedIn := a.currentAccount(r)
	tokenAdmin := a.AdminToken != "" && r.Header.Get("Authorization") == "Bearer "+a.AdminToken
	if !tokenAdmin && (!signedIn || !a.isAdmin(account)) {
		writeError(w, 401, "unauthorized", "admin authorization required")
		return
	}
	rank := 1
	if value := r.URL.Query().Get("defaultRank"); value != "" {
		rank, _ = strconv.Atoi(value)
	}
	result, err := a.Store.db.Exec(`UPDATE themes SET status='approved',default_rank=?,updated_at=? WHERE id=?`, rank, time.Now().UTC().Format(time.RFC3339), r.PathValue("id"))
	if err != nil {
		writeError(w, 500, "internal", "could not approve theme")
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		writeError(w, 404, "not_found", "no such theme")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
