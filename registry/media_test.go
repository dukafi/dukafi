package main

import (
	"bytes"
	"net/http"
	"path/filepath"
	"testing"
)

// 1×1 PNG, so tests do not depend on a fixture file.
func pngPixel() []byte {
	return []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
		0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	}
}

func TestDiskMediaRoundTrip(t *testing.T) {
	store := &PluginBlobs{Root: filepath.Join(t.TempDir(), "plugins")}
	body := pngPixel()
	if err := store.PutMedia("acme-shipping", "logo", body, "image/png"); err != nil {
		t.Fatal(err)
	}
	got, ctype, err := store.GetMedia("acme-shipping", "logo")
	if err != nil {
		t.Fatal(err)
	}
	if ctype != "image/png" {
		t.Fatalf("content type %q", ctype)
	}
	if !bytes.Equal(got, body) {
		t.Fatal("stored bytes did not round-trip")
	}
	if _, _, err := store.GetMedia("acme-shipping", "../escape"); err == nil {
		t.Fatal("a path-climbing media name was accepted")
	}
}

func TestADashboardUploadStoresLogoAndScreenshots(t *testing.T) {
	archive := gzipBytes(t, "plugin-bytes")
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	png := pngPixel()
	recorder := doUploadFiles(t, api, uploadFields(), []uploadFile{
		{field: "archive", filename: "plugin.tar.gz", body: archive},
		{field: "logo", filename: "logo.png", body: png},
		{field: "screenshots", filename: "shot.png", body: png},
	}, author(t, api))
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("upload: %d %s", recorder.Code, recorder.Body.String())
	}
	plugin := decode(t, recorder)["plugin"].(map[string]any)
	if plugin["logo"] != "https://registry.dukafi.dev/v1/plugins/acme-shipping/media/logo" {
		t.Fatalf("logo %v", plugin["logo"])
	}
	images, _ := plugin["images"].([]any)
	if len(images) != 1 || images[0] != "https://registry.dukafi.dev/v1/plugins/acme-shipping/media/shot-0" {
		t.Fatalf("images %v", plugin["images"])
	}

	logo := do(t, api, "GET", "/v1/plugins/acme-shipping/media/logo", nil, nil)
	if logo.Code != http.StatusOK {
		t.Fatalf("logo GET: %d %s", logo.Code, logo.Body.String())
	}
	if logo.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("content-type %q", logo.Header().Get("Content-Type"))
	}
	if !bytes.Equal(logo.Body.Bytes(), png) {
		t.Fatal("served logo was not the upload")
	}
}

func TestANonImageLogoIsRefused(t *testing.T) {
	api := newHostingAPI(t, &stubFetcher{}, &stubArchives{})
	recorder := doUploadFiles(t, api, uploadFields(), []uploadFile{
		{field: "archive", filename: "plugin.tar.gz", body: gzipBytes(t, "x")},
		{field: "logo", filename: "logo.png", body: []byte("not-an-image")},
	}, author(t, api))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestMediaNamesRefusePathClimbing(t *testing.T) {
	if _, err := mediaName("../logo"); err == nil {
		t.Fatal("a path-climbing media name was accepted")
	}
	if code := do(t, newHostingAPI(t, &stubFetcher{}, &stubArchives{}),
		"GET", "/v1/plugins/acme-shipping/media/not-a-slot", nil, nil).Code; code != http.StatusNotFound {
		t.Fatalf("got %d", code)
	}
}

func TestS3MediaKeysStayUnderPluginsPrefix(t *testing.T) {
	store := &S3Blobs{}
	key, err := store.mediaKey("acme-shipping", "logo")
	if err != nil {
		t.Fatal(err)
	}
	if key != "plugins/acme-shipping/media/logo" {
		t.Fatalf("got %q", key)
	}
	if _, err := store.mediaKey("acme-shipping", "../escape"); err == nil {
		t.Fatal("a path-climbing media name was accepted")
	}
}
