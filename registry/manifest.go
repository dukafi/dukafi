package main

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Manifest is what a plugin host serves at its manifest URL.
//
// The registry stores a COPY of this and re-fetches it periodically. The host
// stays the source of truth: renaming a plugin, shipping a new version or
// changing screenshots is a change to the host's own JSON, not a resubmission
// here. That is the whole point of submitting a URL rather than a form.
type Manifest struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Version     string   `json:"version"`
	Author      string   `json:"author"`
	Homepage    string   `json:"homepage"`
	Category    string   `json:"category"`
	License     string   `json:"license"`
	Images      []string `json:"images"`
	Logo        string   `json:"logo"`

	// The lowest Dukafi version this plugin works on. Advisory: the registry
	// records it so a store can hide what it cannot run.
	MinDukafiVersion string `json:"minDukafiVersion"`

	Pricing      Pricing      `json:"pricing"`
	Distribution Distribution `json:"distribution"`

	// When the HOST last changed this plugin. Optional and untrusted — the
	// registry keeps its own timestamps — but useful to show.
	UpdatedAt string `json:"updatedAt"`
}

// Pricing is what a shopper is told before they install.
//
// The registry never takes money and never issues licences. A paid plugin is
// bought from its vendor, exactly as Elementor Pro is bought from Elementor:
// we are a catalogue, and entitlement is the vendor's business.
type Pricing struct {
	// "free" or "paid".
	Model string `json:"model"`
	// Free text, because currencies, tiers and "from £X/year" are the vendor's
	// to phrase. The registry does not compute or convert it.
	Price string `json:"price"`
	// Where to buy. Required for paid plugins — a paid listing with no way to
	// pay is a dead end.
	PurchaseURL string `json:"purchaseUrl"`
}

// Distribution says how a store GETS the files.
//
//	public   — an open URL anyone can download. Free plugins, mostly.
//	licensed — the vendor hands out downloads against a licence key. The store
//	           POSTs {"licenseKey": "..."} to LicenseURL and gets back a
//	           short-lived download URL. The registry holds no keys, proxies no
//	           files, and cannot see who bought what.
//
// A private plugin — one the vendor does not sell but restricts to their own
// customers — is the same mechanism with no PurchaseURL: listed so their users
// can find it, downloadable only with a key.
type Distribution struct {
	Type string `json:"type"`

	// public: the archive itself.
	DownloadURL string `json:"downloadUrl"`
	// Hex sha256 of the archive, so a store can verify what it downloaded.
	// Required for public downloads: without it a compromised host can serve
	// anything and every store installs it.
	SHA256 string `json:"sha256"`

	// licensed: where a store redeems a key for a download.
	LicenseURL string `json:"licenseUrl"`
	// licensed, optional: where a store checks a key is still valid, so an
	// expired licence can be reported before an update is attempted.
	CheckURL string `json:"checkUrl"`
}

const (
	DistributionPublic   = "public"
	DistributionLicensed = "licensed"

	PricingFree = "free"
	PricingPaid = "paid"

	// hostedManifestPrefix marks a listing whose archive was uploaded to this
	// registry rather than fetched from a URL the author hosts. Refresh must
	// not try to GET this — it is not a network address.
	hostedManifestPrefix = "hosted:"
)

func hostedManifestURL(id string) string { return hostedManifestPrefix + id }

func isHostedManifest(manifestURL string) bool {
	return strings.HasPrefix(manifestURL, hostedManifestPrefix)
}

// Categories the registry browses by. A fixed list rather than free text: a
// browsable catalogue where everyone invents their own category is not
// browsable.
var Categories = []string{
	"payments",
	"shipping",
	"marketing",
	"analytics",
	"content",
	"media",
	"integrations",
	"other",
}

var (
	idPattern      = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,63}$`)
	versionPattern = regexp.MustCompile(`^[0-9]+(\.[0-9]+){0,3}(-[0-9A-Za-z.-]+)?$`)
	sha256Pattern  = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

const (
	maxNameLen        = 120
	maxDescriptionLen = 4000
	maxAuthorLen      = 120
	maxPriceLen       = 60
	maxImages         = 8
)

// ValidationError names the field so a submitter can fix it without guessing.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e ValidationError) Error() string { return e.Field + ": " + e.Message }

func invalid(field, message string) error { return ValidationError{Field: field, Message: message} }

// Validate checks a fetched manifest hard enough that an approved listing
// cannot mislead a store.
//
// Every URL is checked with the same rules the fetcher uses, because a store
// will follow these links: an image on a private address would make every
// visitor's browser probe the store's own network, and a download on http://
// is a plugin someone else can replace in transit.
func (m *Manifest) Validate(allowInsecure bool) error {
	m.normalise()

	if !idPattern.MatchString(m.ID) {
		return invalid("id", "must be 2–64 characters of lowercase letters, numbers, hyphen or underscore")
	}
	if m.Name == "" || len(m.Name) > maxNameLen {
		return invalid("name", fmt.Sprintf("required, at most %d characters", maxNameLen))
	}
	if m.Description == "" || len(m.Description) > maxDescriptionLen {
		return invalid("description", fmt.Sprintf("required, at most %d characters", maxDescriptionLen))
	}
	if !versionPattern.MatchString(m.Version) {
		return invalid("version", "must look like 1.2.3 or 1.2.3-beta1")
	}
	if len(m.Author) > maxAuthorLen {
		return invalid("author", fmt.Sprintf("at most %d characters", maxAuthorLen))
	}
	if !validCategory(m.Category) {
		return invalid("category", "must be one of: "+strings.Join(Categories, ", "))
	}
	if m.MinDukafiVersion != "" && !versionPattern.MatchString(m.MinDukafiVersion) {
		return invalid("minDukafiVersion", "must look like 1.2.3")
	}
	if m.Homepage != "" {
		if err := checkURL("homepage", m.Homepage, allowInsecure); err != nil {
			return err
		}
	}
	if m.Logo != "" {
		if err := checkURL("logo", m.Logo, allowInsecure); err != nil {
			return err
		}
	}

	if len(m.Images) > maxImages {
		return invalid("images", fmt.Sprintf("at most %d images", maxImages))
	}
	for i, image := range m.Images {
		if err := checkURL(fmt.Sprintf("images[%d]", i), image, allowInsecure); err != nil {
			return err
		}
	}

	if err := m.validatePricing(allowInsecure); err != nil {
		return err
	}
	return m.validateDistribution(allowInsecure)
}

func (m *Manifest) validatePricing(allowInsecure bool) error {
	switch m.Pricing.Model {
	case PricingFree:
		// A free plugin may still link somewhere to donate or upgrade.
		if m.Pricing.PurchaseURL != "" {
			return checkURL("pricing.purchaseUrl", m.Pricing.PurchaseURL, allowInsecure)
		}
		return nil
	case PricingPaid:
		if len(m.Pricing.Price) > maxPriceLen {
			return invalid("pricing.price", fmt.Sprintf("at most %d characters", maxPriceLen))
		}
		// A paid listing with nowhere to pay is a dead end for every visitor
		// who wants it.
		if m.Pricing.PurchaseURL == "" {
			return invalid("pricing.purchaseUrl", "required for a paid plugin — say where to buy it")
		}
		return checkURL("pricing.purchaseUrl", m.Pricing.PurchaseURL, allowInsecure)
	default:
		return invalid("pricing.model", `must be "free" or "paid"`)
	}
}

func (m *Manifest) validateDistribution(allowInsecure bool) error {
	switch m.Distribution.Type {
	case DistributionPublic:
		if err := checkURL("distribution.downloadUrl", m.Distribution.DownloadURL, allowInsecure); err != nil {
			return err
		}
		// Without a checksum a store has no way to tell the vendor's archive
		// from one substituted after the fact, and every install trusts the
		// host completely.
		if !sha256Pattern.MatchString(m.Distribution.SHA256) {
			return invalid("distribution.sha256", "required for a public download: 64 hex characters")
		}
		return nil
	case DistributionLicensed:
		if err := checkURL("distribution.licenseUrl", m.Distribution.LicenseURL, allowInsecure); err != nil {
			return err
		}
		if m.Distribution.CheckURL != "" {
			if err := checkURL("distribution.checkUrl", m.Distribution.CheckURL, allowInsecure); err != nil {
				return err
			}
		}
		// No sha256 here: the archive is minted per licence, so the vendor
		// returns the checksum with the download URL instead.
		return nil
	default:
		return invalid("distribution.type", `must be "public" or "licensed"`)
	}
}

func (m *Manifest) normalise() {
	m.ID = strings.ToLower(strings.TrimSpace(m.ID))
	m.Name = strings.TrimSpace(m.Name)
	m.Description = strings.TrimSpace(m.Description)
	m.Version = strings.TrimSpace(m.Version)
	m.Author = strings.TrimSpace(m.Author)
	m.Category = strings.ToLower(strings.TrimSpace(m.Category))
	m.License = strings.TrimSpace(m.License)
	m.Logo = strings.TrimSpace(m.Logo)
	m.Distribution.Type = strings.ToLower(strings.TrimSpace(m.Distribution.Type))
	m.Distribution.SHA256 = strings.ToLower(strings.TrimSpace(m.Distribution.SHA256))
	m.Pricing.Model = strings.ToLower(strings.TrimSpace(m.Pricing.Model))

	// An empty pricing block means free. Most plugins are, and requiring the
	// block would reject every simple manifest for no benefit.
	if m.Pricing.Model == "" {
		m.Pricing.Model = PricingFree
	}
	// Same for distribution: a manifest with a download URL and no type is
	// unambiguous.
	if m.Distribution.Type == "" {
		if m.Distribution.LicenseURL != "" {
			m.Distribution.Type = DistributionLicensed
		} else {
			m.Distribution.Type = DistributionPublic
		}
	}

	images := make([]string, 0, len(m.Images))
	for _, image := range m.Images {
		if trimmed := strings.TrimSpace(image); trimmed != "" {
			images = append(images, trimmed)
		}
	}
	m.Images = images
}

// IsLicensed reports whether a store needs a licence key to download this.
func (m *Manifest) IsLicensed() bool { return m.Distribution.Type == DistributionLicensed }

func validCategory(value string) bool {
	for _, category := range Categories {
		if category == value {
			return true
		}
	}
	return false
}

// checkURL enforces what a STORE will follow — a download, an image, a
// purchase page.
//
// Deliberately NO DNS resolution, unlike the manifest URL itself. The registry
// does not fetch these, so resolving them here would mean up to a dozen
// lookups per submission, would fail a good manifest whenever a vendor's
// resolver was slow, and would prove nothing anyway: DNS answers at validation
// time say nothing about DNS answers when a store downloads next week.
//
// A literal private address is still refused, because that needs no lookup and
// is the case worth catching — an image pointed at 192.168.0.1 makes every
// visitor's browser probe their own network.
func checkURL(field, raw string, allowInsecure bool) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return invalid(field, "is not a URL")
	}
	if parsed.Scheme != "https" && !(allowInsecure && parsed.Scheme == "http") {
		return invalid(field, "must be an https URL")
	}
	if parsed.Host == "" {
		return invalid(field, "has no host")
	}
	if ip := net.ParseIP(parsed.Hostname()); ip != nil && !publicIP(ip) && !allowInsecure {
		return invalid(field, ErrBlockedAddress.Error())
	}
	return nil
}

// ParseTime is lenient: `updatedAt` comes from someone else's server and a
// bad value is not a reason to reject an otherwise good plugin.
func ParseTime(value string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z", "2006-01-02"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}
