package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
)

// BlobStore is where a public plugin's gzip lives after ingest.
//
// Production is a Railway S3-compatible bucket. Local development without
// bucket credentials writes next to the SQLite file so `go run` still works.
type BlobStore interface {
	Has(id, sha string) bool
	Get(id, sha string) ([]byte, error)
	Put(id, sha string, body []byte) error
}

// PluginBlobs is the on-disk copy of public plugin archives, used when no
// Railway bucket is configured.
type PluginBlobs struct {
	Root string
}

const gzipMagic = "\x1f\x8b"

var (
	ErrNoBlob           = errors.New("no stored archive")
	ErrNotGzip          = errors.New("the archive is not a gzipped tarball")
	ErrBadBlobKey       = errors.New("invalid archive key")
	ErrChecksumMismatch = errors.New("the downloaded archive did not match")
)

func (b *PluginBlobs) file(id, sha string) (string, error) {
	if b == nil || b.Root == "" {
		return "", ErrNoBlob
	}
	if !idPattern.MatchString(id) || !sha256Pattern.MatchString(sha) {
		return "", ErrBadBlobKey
	}
	return filepath.Join(b.Root, id, sha+".tar.gz"), nil
}

func (b *PluginBlobs) Has(id, sha string) bool {
	path, err := b.file(id, sha)
	if err != nil {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

func (b *PluginBlobs) Get(id, sha string) ([]byte, error) {
	path, err := b.file(id, sha)
	if err != nil {
		return nil, err
	}
	body, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNoBlob
	}
	return body, err
}

func (b *PluginBlobs) Put(id, sha string, body []byte) error {
	if err := checkArchive(body, sha); err != nil {
		return err
	}
	path, err := b.file(id, sha)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	// Same hash is the same bytes; writing again is a no-op for the catalogue.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func checkArchive(body []byte, expectedSHA string) error {
	if len(body) < 2 || string(body[:2]) != gzipMagic {
		return ErrNotGzip
	}
	sum := sha256.Sum256(body)
	actual := hex.EncodeToString(sum[:])
	if actual != expectedSHA {
		return ErrChecksumMismatch
	}
	return nil
}
