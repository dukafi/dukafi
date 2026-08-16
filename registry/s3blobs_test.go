package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestS3ObjectKeysStayUnderPluginsPrefix(t *testing.T) {
	store := &S3Blobs{}
	sha := strings.Repeat("ab", 32)
	key, err := store.key("acme-shipping", sha)
	if err != nil {
		t.Fatal(err)
	}
	if key != "plugins/acme-shipping/"+sha+".tar.gz" {
		t.Fatalf("got %q", key)
	}
	if _, err := store.key("../escape", sha); err == nil {
		t.Fatal("a path-climbing id was accepted")
	}
}

func TestOpenBlobStoreUsesDiskWhenNoBucketIsConfigured(t *testing.T) {
	for _, key := range []string{"BUCKET", "REGISTRY_S3_BUCKET", "AWS_S3_BUCKET", "S3_BUCKET"} {
		t.Setenv(key, "")
	}
	dir := t.TempDir()
	store, where, err := openBlobStore(filepath.Join(dir, "registry.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	disk, ok := store.(*PluginBlobs)
	if !ok {
		t.Fatalf("expected disk store, got %T (%s)", store, where)
	}
	if disk.Root != filepath.Join(dir, "plugins") {
		t.Fatalf("archives root %q", disk.Root)
	}
}

func TestNewS3BlobsReadsRailwayInjectedNames(t *testing.T) {
	t.Setenv("BUCKET", "tidy-folder-example")
	t.Setenv("ACCESS_KEY_ID", "akid")
	t.Setenv("SECRET_ACCESS_KEY", "secret")
	t.Setenv("ENDPOINT", "https://storage.railway.app")
	t.Setenv("REGION", "auto")
	store, err := newS3BlobsFromEnv("tidy-folder-example")
	if err != nil {
		t.Fatal(err)
	}
	if store.bucket != "tidy-folder-example" {
		t.Fatalf("bucket %q", store.bucket)
	}
}
