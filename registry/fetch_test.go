package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Fetching a URL a stranger chose is the dangerous thing this service does.
// These are the ways round the guard, in the order an attacker would try them.

func TestBlocksPrivateAndLoopbackAddresses(t *testing.T) {
	fetcher := NewHTTPFetcher(false)

	for _, target := range []string{
		"https://127.0.0.1/manifest.json",
		"https://localhost/manifest.json",
		"https://10.0.0.5/manifest.json",
		"https://192.168.1.1/manifest.json",
		"https://172.16.0.1/manifest.json",
		// The one that matters most in a cloud: the instance metadata service,
		// which hands out credentials to anything that can reach it.
		"https://169.254.169.254/latest/meta-data/",
		"https://[::1]/manifest.json",
		// Carrier-grade NAT and TEST-NET are not "private" to Go but are not
		// the public internet either.
		"https://100.64.0.1/manifest.json",
		"https://198.51.100.7/manifest.json",
	} {
		if _, err := fetcher.Fetch(context.Background(), target); err == nil {
			t.Fatalf("%s was fetched — the registry must not reach it", target)
		}
	}
}

func TestRequiresHTTPS(t *testing.T) {
	fetcher := NewHTTPFetcher(false)
	// A plaintext manifest is one anybody on the path can rewrite, and it
	// names the download URL every store will then install from.
	if _, err := fetcher.Fetch(context.Background(), "http://example.com/manifest.json"); err == nil {
		t.Fatal("http:// was accepted")
	}
	if _, err := fetcher.Fetch(context.Background(), "file:///etc/passwd"); err == nil {
		t.Fatal("file:// was accepted")
	}
}

// The first hop being public says nothing about the second.
func TestRedirectToAPrivateAddressIsRefused(t *testing.T) {
	private := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"id":"x"}`))
	}))
	defer private.Close()

	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, private.URL, http.StatusFound)
	}))
	defer redirector.Close()

	// -insecure is ON here, which is what a developer runs locally — and even
	// then the DIALLER refuses a private address on a redirect, because the
	// alternative is that one flag turns the whole guard off in production by
	// accident.
	fetcher := NewHTTPFetcher(false)
	if _, err := fetcher.Fetch(context.Background(), redirector.URL); err == nil {
		t.Fatal("a redirect to a private address was followed")
	}
}

func TestRejectsAnOversizedManifest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Just over the cap, as a well-formed JSON string.
		w.Write([]byte(`{"description":"` + strings.Repeat("a", maxManifestLen+10) + `"}`))
	}))
	defer server.Close()

	fetcher := NewHTTPFetcher(true)
	_, err := fetcher.Fetch(context.Background(), server.URL)
	if err == nil || !strings.Contains(err.Error(), "larger than") {
		t.Fatalf("expected a size refusal, got %v", err)
	}
}

func TestRejectsNonJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html>not a manifest</html>"))
	}))
	defer server.Close()

	if _, err := NewHTTPFetcher(true).Fetch(context.Background(), server.URL); err == nil {
		t.Fatal("an HTML page was accepted as a manifest")
	}
}

func TestFetchesAndValidatesAGoodManifest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(validManifest())
	}))
	defer server.Close()

	manifest, err := NewHTTPFetcher(true).Fetch(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("a good manifest was refused: %v", err)
	}
	if manifest.ID != "acme-shipping" {
		t.Fatalf("got id %q", manifest.ID)
	}
}

// An upstream error must not come back to the submitter as a body — that is
// how an SSRF probe reads its answer.
func TestAnUpstreamErrorRevealsNothing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("secret internal detail"))
	}))
	defer server.Close()

	_, err := NewHTTPFetcher(true).Fetch(context.Background(), server.URL)
	if err == nil {
		t.Fatal("a 500 was accepted")
	}
	if strings.Contains(err.Error(), "secret internal detail") {
		t.Fatalf("the upstream body leaked into the error: %v", err)
	}
}

func validManifest() Manifest {
	return Manifest{
		ID: "acme-shipping", Name: "Acme Shipping", Description: "Live rates from Acme.",
		Version: "1.2.0", Author: "Acme", Category: "shipping", License: "MIT",
		Images:  []string{"https://cdn.example.com/shot.png"},
		Pricing: Pricing{Model: PricingFree},
		Distribution: Distribution{
			Type:        DistributionPublic,
			DownloadURL: "https://cdn.example.com/acme-1.2.0.tar.gz",
			SHA256:      strings.Repeat("a", 64),
		},
	}
}
