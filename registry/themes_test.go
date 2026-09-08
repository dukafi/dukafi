package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"
)

func themeArchive(t *testing.T, id string, files map[string]string) []byte {
	t.Helper()
	if files == nil {
		files = map[string]string{}
	}
	for _, name := range themeFiles {
		if _, ok := files[name]; ok {
			continue
		}
		switch name {
		case "theme.json":
			files[name] = fmt.Sprintf(`{"id":%q,"name":"Theme","version":"1.0.0"}`, id)
		case "media.json":
			files[name] = `[]`
		default:
			files[name] = `[]`
		}
	}
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		body := []byte(files[name])
		hdr := &tar.Header{Name: name, Mode: 0o644, Size: int64(len(body))}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func doThemeUpload(t *testing.T, api *API, fields map[string]string, archive []byte, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		if err := writer.WriteField(name, value); err != nil {
			t.Fatal(err)
		}
	}
	if archive != nil {
		part, err := writer.CreateFormFile("archive", fields["id"]+".theme.tar.gz")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(archive); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/themes", &body)
	req.RemoteAddr = "203.0.113.9:1234"
	req.Header.Set("Content-Type", writer.FormDataContentType())
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	api.Handler().ServeHTTP(recorder, req)
	return recorder
}

func themeFields(id string) map[string]string {
	return map[string]string{
		"id": id, "name": "Acme Theme", "version": "1.0.0",
		"summary": "A theme", "description": "Warm shopfront", "categories": "general,fashion",
	}
}

func insertApprovedTheme(t *testing.T, api *API, id, name, categories string, rank *int, sha string, size int64) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339)
	previews := `[]`
	_, err := api.Store.db.Exec(
		`INSERT INTO themes(id,name,summary,description,author_account_id,version,categories,preview_urls,status,sha256,archive_key,archive_size,default_rank,created_at,updated_at)
		 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, name, "sum", "desc about "+name, "acct", "1.0.0", categories, previews, StatusApproved,
		sha, "theme-"+id, size, rank, now, now,
	)
	if err != nil {
		t.Fatal(err)
	}
}

func TestThemesListFiltersByQAndCategory(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	rank := 2
	insertApprovedTheme(t, api, "warm-shop", "Warm Shop", "general,fashion", &rank, "aaa", 10)
	insertApprovedTheme(t, api, "cool-tech", "Cool Tech", "tech", nil, "bbb", 10)

	byQ := decode(t, do(t, api, "GET", "/v1/themes?q=warm", nil, nil))
	themes := byQ["themes"].([]any)
	if len(themes) != 1 || themes[0].(map[string]any)["id"] != "warm-shop" {
		t.Fatalf("q filter: %#v", byQ)
	}

	byCat := decode(t, do(t, api, "GET", "/v1/themes?category=tech", nil, nil))
	themes = byCat["themes"].([]any)
	if len(themes) != 1 || themes[0].(map[string]any)["id"] != "cool-tech" {
		t.Fatalf("category filter: %#v", byCat)
	}
}

func TestThemesDefaultByDefaultRank(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	first, second := 1, 5
	insertApprovedTheme(t, api, "starter-a", "Starter A", "general", &second, "aaa", 10)
	insertApprovedTheme(t, api, "starter-b", "Starter B", "general", &first, "bbb", 10)

	payload := decode(t, do(t, api, "GET", "/v1/themes/default", nil, nil))
	theme := payload["theme"].(map[string]any)
	if theme["id"] != "starter-b" {
		t.Fatalf("default theme: %#v", theme)
	}
}

func TestThemesMissingReturns404(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	recorder := do(t, api, "GET", "/v1/themes/nope", nil, nil)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestThemesPublicViewKeys(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	rank := 1
	insertApprovedTheme(t, api, "view-keys", "View Keys", "general", &rank, "deadbeef", 42)
	payload := decode(t, do(t, api, "GET", "/v1/themes/view-keys", nil, nil))
	theme := payload["theme"].(map[string]any)
	for _, key := range []string{"id", "name", "description", "version"} {
		if _, ok := theme[key]; !ok {
			t.Fatalf("missing %s in %#v", key, theme)
		}
	}
	dist := theme["distribution"].(map[string]any)
	for _, key := range []string{"sha256", "url", "downloadUrl"} {
		if _, ok := dist[key]; !ok {
			t.Fatalf("missing distribution.%s in %#v", key, dist)
		}
	}
	if dist["sha256"] != "deadbeef" {
		t.Fatalf("sha256 %v", dist["sha256"])
	}
	want := "https://registry.dukafi.dev/v1/themes/view-keys/download"
	if dist["url"] != want || dist["downloadUrl"] != want {
		t.Fatalf("urls %#v", dist)
	}
}

func TestThemesSubmitRequiresAuth(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	recorder := doThemeUpload(t, api, themeFields("needs-auth"), themeArchive(t, "needs-auth", nil), nil)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestThemesMalformedArchiveRejected(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	recorder := doThemeUpload(t, api, themeFields("bad-gz"), []byte("not-gzip"), author(t, api))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestThemesIncompleteFileSetRejected(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	files := map[string]string{}
	for _, name := range themeFiles {
		if name == "reviews.json" {
			continue
		}
		if name == "theme.json" {
			files[name] = `{"id":"incomplete","name":"X","version":"1"}`
		} else {
			files[name] = `[]`
		}
	}
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, body := range files {
		data := []byte(body)
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(data))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	recorder := doThemeUpload(t, api, themeFields("incomplete"), buf.Bytes(), author(t, api))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestThemesHTTPMediaURLRejected(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	archive := themeArchive(t, "http-media", map[string]string{
		"media.json": `[{"url":"http://example.com/a.png"}]`,
	})
	recorder := doThemeUpload(t, api, themeFields("http-media"), archive, author(t, api))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestThemesOversizedArchiveRejected(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	huge := bytes.Repeat([]byte{0x1f, 0x8b, 0x08, 0x00}, (maxThemeArchive/2)+1)
	recorder := doThemeUpload(t, api, themeFields("too-big"), huge, author(t, api))
	if recorder.Code != http.StatusRequestEntityTooLarge && recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestThemesOwnershipConflict(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	first := author(t, api)
	archive := themeArchive(t, "owned-id", nil)
	if recorder := doThemeUpload(t, api, themeFields("owned-id"), archive, first); recorder.Code != http.StatusAccepted {
		t.Fatalf("first upload: %d %s", recorder.Code, recorder.Body.String())
	}
	second := signUp(t, api, "other@acme.example")
	recorder := doThemeUpload(t, api, themeFields("owned-id"), archive, second)
	if recorder.Code != http.StatusConflict {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestThemesApproveMakesListableAndDownloadable(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	id := "approved-theme"
	archive := themeArchive(t, id, nil)
	sum := sha256.Sum256(archive)
	sha := hex.EncodeToString(sum[:])
	if recorder := doThemeUpload(t, api, themeFields(id), archive, author(t, api)); recorder.Code != http.StatusAccepted {
		t.Fatalf("upload: %d %s", recorder.Code, recorder.Body.String())
	}
	if list := decode(t, do(t, api, "GET", "/v1/themes", nil, nil)); len(list["themes"].([]any)) != 0 {
		t.Fatal("pending theme must not be listed")
	}
	approve := do(t, api, "POST", "/v1/admin/themes/"+id+"/approve?defaultRank=1", nil, admin())
	if approve.Code != http.StatusOK {
		t.Fatalf("approve: %d %s", approve.Code, approve.Body.String())
	}
	list := decode(t, do(t, api, "GET", "/v1/themes", nil, nil))
	if len(list["themes"].([]any)) != 1 {
		t.Fatalf("list after approve: %#v", list)
	}
	download := do(t, api, "GET", "/v1/themes/"+id+"/download", nil, nil)
	if download.Code != http.StatusOK {
		t.Fatalf("download: %d %s", download.Code, download.Body.String())
	}
	if got := download.Header().Get("X-Checksum-Sha256"); got != sha {
		t.Fatalf("checksum header %q want %q", got, sha)
	}
	body, _ := io.ReadAll(download.Body)
	if !bytes.Equal(body, archive) {
		t.Fatal("download body mismatch")
	}
}
