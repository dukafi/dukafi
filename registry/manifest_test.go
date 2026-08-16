package main

import (
	"strings"
	"testing"
)

// A manifest is a stranger's JSON that ends up in front of every store
// browsing the catalogue, and whose URLs those stores will follow. What it is
// allowed to say is the whole of the trust model.

func TestAcceptsAWellFormedManifest(t *testing.T) {
	manifest := validManifest()
	if err := manifest.Validate(false); err != nil {
		t.Fatalf("a good manifest was refused: %v", err)
	}
}

func TestRequiresTheBasics(t *testing.T) {
	cases := map[string]func(*Manifest){
		"id":          func(m *Manifest) { m.ID = "" },
		"name":        func(m *Manifest) { m.Name = "" },
		"description": func(m *Manifest) { m.Description = "" },
		"version":     func(m *Manifest) { m.Version = "" },
		"category":    func(m *Manifest) { m.Category = "" },
	}
	for field, breakIt := range cases {
		manifest := validManifest()
		breakIt(&manifest)
		err := manifest.Validate(false)
		if err == nil {
			t.Fatalf("a manifest with no %s was accepted", field)
		}
		// The submitter has to be able to fix it without guessing which field.
		var validation ValidationError
		if !asValidation(err, &validation) || !strings.Contains(validation.Field, field) {
			t.Fatalf("error for %s did not name the field: %v", field, err)
		}
	}
}

// An id is what a store installs by and what the registry keys on. Path
// separators and spaces in it would end up in filenames.
func TestRejectsAnUnsafeID(t *testing.T) {
	for _, id := range []string{"../etc", "Acme Shipping", "a", "acme/shipping", strings.Repeat("a", 65)} {
		manifest := validManifest()
		manifest.ID = id
		if err := manifest.Validate(false); err == nil {
			t.Fatalf("id %q was accepted", id)
		}
	}
}

// Every URL here is one a store or a browser will follow. A private address
// would make each visitor probe their own network.
func TestRejectsNonPublicURLs(t *testing.T) {
	cases := []struct {
		name  string
		apply func(*Manifest)
	}{
		{"download over http", func(m *Manifest) { m.Distribution.DownloadURL = "http://cdn.example.com/x.tar.gz" }},
		{"download on localhost", func(m *Manifest) { m.Distribution.DownloadURL = "https://127.0.0.1/x.tar.gz" }},
		{"image on a private address", func(m *Manifest) { m.Images = []string{"https://192.168.0.1/shot.png"} }},
		{"homepage on the metadata service", func(m *Manifest) { m.Homepage = "https://169.254.169.254/" }},
		{"licence endpoint over http", func(m *Manifest) {
			m.Distribution = Distribution{Type: DistributionLicensed, LicenseURL: "http://acme.example.com/dl"}
		}},
	}
	for _, tc := range cases {
		manifest := validManifest()
		tc.apply(&manifest)
		if err := manifest.Validate(false); err == nil {
			t.Fatalf("%s was accepted", tc.name)
		}
	}
}

// Without a checksum, a store installing a public download trusts the host
// completely and cannot tell the vendor's archive from a substituted one.
func TestAPublicDownloadNeedsAChecksum(t *testing.T) {
	manifest := validManifest()
	manifest.Distribution.SHA256 = ""
	if err := manifest.Validate(false); err == nil {
		t.Fatal("a public download with no sha256 was accepted")
	}

	manifest.Distribution.SHA256 = "not-a-hash"
	if err := manifest.Validate(false); err == nil {
		t.Fatal("a malformed sha256 was accepted")
	}
}

// A licensed download is minted per key, so its checksum comes back with the
// download URL rather than sitting in a public manifest.
func TestALicensedPluginNeedsNoChecksum(t *testing.T) {
	manifest := validManifest()
	manifest.Distribution = Distribution{
		Type:       DistributionLicensed,
		LicenseURL: "https://acme.example.com/api/download",
	}
	manifest.Pricing = Pricing{Model: PricingPaid, Price: "$49", PurchaseURL: "https://acme.example.com/buy"}
	if err := manifest.Validate(false); err != nil {
		t.Fatalf("a licensed plugin was refused: %v", err)
	}
	if !manifest.IsLicensed() {
		t.Fatal("a licensed plugin did not report itself as one")
	}
}

// A paid listing nobody can buy is a dead end for every visitor who wants it.
func TestAPaidPluginMustSayWhereToBuyIt(t *testing.T) {
	manifest := validManifest()
	manifest.Pricing = Pricing{Model: PricingPaid, Price: "$49"}
	err := manifest.Validate(false)
	if err == nil {
		t.Fatal("a paid plugin with no purchase URL was accepted")
	}
	var validation ValidationError
	if !asValidation(err, &validation) || validation.Field != "pricing.purchaseUrl" {
		t.Fatalf("unhelpful error: %v", err)
	}
}

// A private plugin — restricted to a vendor's own users, not sold — is the
// licensed mechanism with nothing to buy.
func TestAPrivatePluginNeedsNoPurchaseURL(t *testing.T) {
	manifest := validManifest()
	manifest.Pricing = Pricing{Model: PricingFree}
	manifest.Distribution = Distribution{
		Type:       DistributionLicensed,
		LicenseURL: "https://acme.example.com/api/download",
	}
	if err := manifest.Validate(false); err != nil {
		t.Fatalf("a private plugin was refused: %v", err)
	}
}

// Most manifests will be a free plugin with one download. Requiring the
// pricing and distribution blocks would reject all of them for no benefit.
func TestTheSimplestManifestWorks(t *testing.T) {
	manifest := Manifest{
		ID: "simple", Name: "Simple", Description: "Does one thing.", Version: "1.0.0",
		Category: "other",
		Distribution: Distribution{
			DownloadURL: "https://cdn.example.com/simple-1.0.0.tar.gz",
			SHA256:      strings.Repeat("b", 64),
		},
	}
	if err := manifest.Validate(false); err != nil {
		t.Fatalf("a minimal manifest was refused: %v", err)
	}
	if manifest.Pricing.Model != PricingFree {
		t.Fatalf("an absent pricing block should mean free, got %q", manifest.Pricing.Model)
	}
	if manifest.Distribution.Type != DistributionPublic {
		t.Fatalf("a download URL with no type should mean public, got %q", manifest.Distribution.Type)
	}
}

// Free text categories make a browsable catalogue unbrowsable.
func TestRejectsAnUnknownCategory(t *testing.T) {
	manifest := validManifest()
	manifest.Category = "miscellaneous-widgets"
	if err := manifest.Validate(false); err == nil {
		t.Fatal("an invented category was accepted")
	}
}

func TestCapsTheImageList(t *testing.T) {
	manifest := validManifest()
	for i := 0; i <= maxImages; i++ {
		manifest.Images = append(manifest.Images, "https://cdn.example.com/shot.png")
	}
	if err := manifest.Validate(false); err == nil {
		t.Fatal("an unbounded image list was accepted")
	}
}

func asValidation(err error, target *ValidationError) bool {
	if validation, ok := err.(ValidationError); ok {
		*target = validation
		return true
	}
	return false
}
