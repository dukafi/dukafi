package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"path/filepath"
	"testing"
	"time"
)

type stubArchives struct {
	body  []byte
	err   error
	calls int
}

func (s *stubArchives) FetchArchive(_ context.Context, _ string) ([]byte, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	copied := make([]byte, len(s.body))
	copy(copied, s.body)
	return copied, nil
}

func gzipBytes(t *testing.T, payload string) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := gzip.NewWriter(&buf)
	writer.ModTime = time.Time{}
	if _, err := writer.Write([]byte(payload)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func sha(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func newHostingAPI(t *testing.T, fetcher Fetcher, archives *stubArchives) *API {
	t.Helper()
	api := newTestAPI(t, fetcher)
	api.Blobs = &PluginBlobs{Root: filepath.Join(t.TempDir(), "plugins")}
	api.Archives = archives
	api.PublicURL = "https://registry.dukafi.dev"
	api.DownloadsPerHour = 60
	return api
}

func publicManifestWithArchive(t *testing.T, body []byte) Manifest {
	t.Helper()
	manifest := validManifest()
	manifest.Distribution.SHA256 = sha(body)
	return manifest
}

func TestAPublicPluginIsCopiedAndServedFromThisRegistry(t *testing.T) {
	body := gzipBytes(t, "plugin-bytes")
	manifest := publicManifestWithArchive(t, body)
	archives := &stubArchives{body: body}
	api := newHostingAPI(t, &stubFetcher{manifest: &manifest}, archives)

	submit(t, api, "https://acme.example.com/plugin.json")
	if archives.calls != 1 {
		t.Fatalf("ingest did not fetch the archive: %d calls", archives.calls)
	}
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	listing := decode(t, do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil))
	distribution := listing["distribution"].(map[string]any)
	if distribution["downloadUrl"] != "https://registry.dukafi.dev/v1/plugins/acme-shipping/download" {
		t.Fatalf("stores are still pointed at the author: %v", distribution["downloadUrl"])
	}

	recorder := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("download: %d %s", recorder.Code, recorder.Body.String())
	}
	if !bytes.Equal(recorder.Body.Bytes(), body) {
		t.Fatal("the stored archive was not what we ingested")
	}
	if recorder.Header().Get("X-Checksum-Sha256") != sha(body) {
		t.Fatal("the checksum header did not match the bytes")
	}
}

func TestAPendingPluginCannotBeDownloaded(t *testing.T) {
	body := gzipBytes(t, "pending")
	manifest := publicManifestWithArchive(t, body)
	api := newHostingAPI(t, &stubFetcher{manifest: &manifest}, &stubArchives{body: body})
	submit(t, api, "https://acme.example.com/plugin.json")

	recorder := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("unreviewed code was downloadable: %d", recorder.Code)
	}
}

func TestAChecksumMismatchIsRefusedAtPublish(t *testing.T) {
	body := gzipBytes(t, "real-bytes")
	manifest := validManifest()
	manifest.Distribution.SHA256 = sha(gzipBytes(t, "other-bytes"))
	api := newHostingAPI(t, &stubFetcher{manifest: &manifest}, &stubArchives{body: body})

	recorder := publishAs(t, api, author(t, api), "https://acme.example.com/plugin.json")
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a mismatched archive was accepted: %d %s", recorder.Code, recorder.Body.String())
	}
	if _, err := api.Store.Get("acme-shipping"); err == nil {
		t.Fatal("a failed ingest still created a listing")
	}
}

func TestALicensedPluginIsNotCopied(t *testing.T) {
	manifest := validManifest()
	manifest.ID = "acme-pro"
	manifest.Pricing = Pricing{Model: PricingPaid, Price: "$49", PurchaseURL: "https://acme.example.com/buy"}
	manifest.Distribution = Distribution{Type: DistributionLicensed, LicenseURL: "https://acme.example.com/api/download"}
	archives := &stubArchives{body: gzipBytes(t, "secret")}
	api := newHostingAPI(t, &stubFetcher{manifest: &manifest}, archives)
	submit(t, api, "https://acme.example.com/pro.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-pro/approve", nil, admin())

	if archives.calls != 0 {
		t.Fatal("a licensed plugin was fetched")
	}
	recorder := do(t, api, "GET", "/v1/plugins/acme-pro/download", nil, nil)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("a licensed plugin was downloadable: %d", recorder.Code)
	}
}

func TestArchiveDownloadsAreRateLimited(t *testing.T) {
	body := gzipBytes(t, "rate-limit")
	manifest := publicManifestWithArchive(t, body)
	api := newHostingAPI(t, &stubFetcher{manifest: &manifest}, &stubArchives{body: body})
	api.DownloadsPerHour = 2
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	if code := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil).Code; code != http.StatusOK {
		t.Fatalf("first download: %d", code)
	}
	if code := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil).Code; code != http.StatusOK {
		t.Fatalf("second download: %d", code)
	}
	recorder := do(t, api, "GET", "/v1/plugins/acme-shipping/download", nil, nil)
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("the third download was allowed: %d", recorder.Code)
	}
}

func TestBlobKeysCannotClimbOutOfTheRoot(t *testing.T) {
	blobs := &PluginBlobs{Root: t.TempDir()}
	body := gzipBytes(t, "x")
	if err := blobs.Put("../escape", sha(body), body); err == nil {
		t.Fatal("a path-climbing id was stored")
	}
}
