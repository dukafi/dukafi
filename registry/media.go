package main

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const maxImageLen = 1 * 1024 * 1024

var (
	ErrNotImage  = errors.New("must be a jpeg, png, webp or gif")
	ErrImageHuge = fmt.Errorf("image is larger than %d bytes", maxImageLen)

	mediaNamePattern = regexp.MustCompile(`^(logo|shot-[0-7])$`)
)

func mediaName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if !mediaNamePattern.MatchString(name) {
		return "", ErrBadBlobKey
	}
	return name, nil
}

func screenshotName(index int) string { return "shot-" + strconv.Itoa(index) }

func sniffImage(body []byte) (string, error) {
	switch {
	case len(body) >= 3 && body[0] == 0xff && body[1] == 0xd8 && body[2] == 0xff:
		return "image/jpeg", nil
	case bytes.HasPrefix(body, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png", nil
	case bytes.HasPrefix(body, []byte("GIF87a")), bytes.HasPrefix(body, []byte("GIF89a")):
		return "image/gif", nil
	case len(body) >= 12 && bytes.HasPrefix(body, []byte("RIFF")) && string(body[8:12]) == "WEBP":
		return "image/webp", nil
	default:
		return "", ErrNotImage
	}
}

func (b *PluginBlobs) mediaFile(id, name string) (string, error) {
	if b == nil || b.Root == "" {
		return "", ErrNoBlob
	}
	if !idPattern.MatchString(id) {
		return "", ErrBadBlobKey
	}
	safe, err := mediaName(name)
	if err != nil {
		return "", err
	}
	return filepath.Join(b.Root, id, "media", safe), nil
}

func (b *PluginBlobs) HasMedia(id, name string) bool {
	path, err := b.mediaFile(id, name)
	if err != nil {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

func (b *PluginBlobs) GetMedia(id, name string) ([]byte, string, error) {
	path, err := b.mediaFile(id, name)
	if err != nil {
		return nil, "", err
	}
	body, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, "", ErrNoBlob
	}
	if err != nil {
		return nil, "", err
	}
	ctype, _ := os.ReadFile(path + ".ctype")
	contentType := strings.TrimSpace(string(ctype))
	if contentType == "" {
		contentType, _ = sniffImage(body)
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return body, contentType, nil
}

func (b *PluginBlobs) PutMedia(id, name string, body []byte, contentType string) error {
	if len(body) > maxImageLen {
		return ErrImageHuge
	}
	if _, err := sniffImage(body); err != nil {
		return err
	}
	path, err := b.mediaFile(id, name)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	return os.WriteFile(path+".ctype", []byte(contentType+"\n"), 0o644)
}
