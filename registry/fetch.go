package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Fetching a URL a stranger submitted is the dangerous thing this service
// does, and everything below exists because of it.
//
// The registry runs somewhere with a network — a cloud VPC, a container host,
// a machine with a metadata service on 169.254.169.254. A submitter who can
// make it request an arbitrary address turns it into a probe for everything
// that address can reach, and the response comes back to them in the
// submission's error message. So:
//
//   · https only (http is allowed only with -insecure, for local development);
//   · every address the host resolves to is checked, not just the first —
//     a name with one public and one private answer must not pass;
//   · redirects are re-checked, because the first hop being public says
//     nothing about the second;
//   · the body is capped and the read is deadlined, so a slow or endless
//     response cannot hold a connection open forever.
//
// This is the same shape as Dukafi's own `MediaIntake#check_address!`, for the
// same reason.

const (
	fetchTimeout   = 12 * time.Second
	maxRedirects   = 3
	maxManifestLen = 256 * 1024
)

var (
	ErrBlockedAddress = errors.New("that address is not reachable from the registry")
	ErrTooLarge       = fmt.Errorf("manifest is larger than %d bytes", maxManifestLen)
)

// Fetcher retrieves manifests. An interface so tests can hand the API a
// manifest without a network, and so a future cache is a swap rather than a
// rewrite.
type Fetcher interface {
	Fetch(ctx context.Context, manifestURL string) (*Manifest, error)
}

type HTTPFetcher struct {
	AllowInsecure bool
	client        *http.Client
}

func NewHTTPFetcher(allowInsecure bool) *HTTPFetcher {
	f := &HTTPFetcher{AllowInsecure: allowInsecure}
	f.client = &http.Client{
		Timeout: fetchTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return fmt.Errorf("too many redirects")
			}
			// The whole point: a public URL that redirects to 127.0.0.1 is the
			// oldest way round an allow-list.
			return f.checkRequestURL(req.URL)
		},
		Transport: &http.Transport{
			// Belt and braces: even if a redirect check is missed, the dialler
			// re-checks the address it is about to connect to. This also
			// closes DNS rebinding, where the name resolves public for the
			// check and private for the connection.
			//
			// Skipped under -insecure, which exists precisely so a developer
			// can point the registry at a manifest on their own machine.
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				if !f.AllowInsecure {
					host, _, err := net.SplitHostPort(addr)
					if err != nil {
						return nil, err
					}
					if ip := net.ParseIP(host); ip != nil && !publicIP(ip) {
						return nil, ErrBlockedAddress
					}
				}
				return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, addr)
			},
			TLSHandshakeTimeout:   6 * time.Second,
			ResponseHeaderTimeout: 8 * time.Second,
			DisableKeepAlives:     true,
		},
	}
	return f
}

func (f *HTTPFetcher) Fetch(ctx context.Context, manifestURL string) (*Manifest, error) {
	parsed, err := url.Parse(strings.TrimSpace(manifestURL))
	if err != nil {
		return nil, invalid("manifestUrl", "is not a URL")
	}
	if err := f.checkRequestURL(parsed); err != nil {
		return nil, invalid("manifestUrl", err.Error())
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, invalid("manifestUrl", "could not be requested")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "dukafi-registry/1.0 (+https://github.com/dukafi/registry)")

	res, err := f.client.Do(req)
	if err != nil {
		// The submitter's own URL failed, so they are told what happened —
		// but never anything the response body contained, which is how an
		// SSRF probe reads its answer.
		if errors.Is(err, ErrBlockedAddress) {
			return nil, invalid("manifestUrl", ErrBlockedAddress.Error())
		}
		return nil, invalid("manifestUrl", "could not be reached")
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, invalid("manifestUrl", fmt.Sprintf("answered %d", res.StatusCode))
	}
	if contentType := res.Header.Get("Content-Type"); contentType != "" &&
		!strings.Contains(strings.ToLower(contentType), "json") {
		return nil, invalid("manifestUrl", "did not return JSON")
	}

	// LimitReader + one extra byte, so "exactly at the cap" and "over the cap"
	// are distinguishable.
	body, err := io.ReadAll(io.LimitReader(res.Body, maxManifestLen+1))
	if err != nil {
		return nil, invalid("manifestUrl", "could not be read")
	}
	if len(body) > maxManifestLen {
		return nil, invalid("manifestUrl", ErrTooLarge.Error())
	}

	var manifest Manifest
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	if err := decoder.Decode(&manifest); err != nil {
		return nil, invalid("manifestUrl", "did not return a valid manifest: "+err.Error())
	}
	if err := manifest.Validate(f.AllowInsecure); err != nil {
		return nil, err
	}
	return &manifest, nil
}

func (f *HTTPFetcher) checkRequestURL(parsed *url.URL) error {
	if parsed.Scheme != "https" && !(f.AllowInsecure && parsed.Scheme == "http") {
		return errors.New("must be an https URL")
	}
	return checkPublicHost(parsed.Hostname(), f.AllowInsecure)
}

// checkPublicHost resolves a hostname and refuses anything that is not a
// public unicast address. EVERY answer is checked: a name that resolves to
// both a public and a private address must not pass on the strength of the
// public one.
func checkPublicHost(host string, allowInsecure bool) error {
	if host == "" {
		return errors.New("has no host")
	}
	// A literal address needs no lookup.
	if ip := net.ParseIP(host); ip != nil {
		if allowInsecure || publicIP(ip) {
			return nil
		}
		return ErrBlockedAddress
	}
	if allowInsecure {
		// Local development points everything at localhost; refusing it would
		// make the service untestable without a public host.
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return errors.New("could not be resolved")
	}
	if len(addresses) == 0 {
		return errors.New("could not be resolved")
	}
	for _, address := range addresses {
		if !publicIP(address.IP) {
			return ErrBlockedAddress
		}
	}
	return nil
}

// publicIP is deliberately a deny-list of everything that is not routable on
// the public internet, rather than an allow-list of what looks fine.
func publicIP(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() ||
		ip.IsUnspecified() {
		return false
	}
	// Ranges Go does not class as private but which are just as much "not the
	// public internet": carrier-grade NAT, TEST-NET blocks, 6to4 relay,
	// benchmarking, and the IPv4 reserved space.
	for _, blocked := range reservedRanges {
		if blocked.Contains(ip) {
			return false
		}
	}
	return true
}

var reservedRanges = func() []*net.IPNet {
	blocks := []string{
		"100.64.0.0/10",   // carrier-grade NAT
		"192.0.0.0/24",    // IETF protocol assignments
		"192.0.2.0/24",    // TEST-NET-1
		"198.18.0.0/15",   // benchmarking
		"198.51.100.0/24", // TEST-NET-2
		"203.0.113.0/24",  // TEST-NET-3
		"192.88.99.0/24",  // 6to4 relay anycast
		"240.0.0.0/4",     // reserved
		"::/128",          // unspecified
		"64:ff9b::/96",    // IPv4/IPv6 translation
		"100::/64",        // discard-only
		"2001:db8::/32",   // documentation
	}
	ranges := make([]*net.IPNet, 0, len(blocks))
	for _, block := range blocks {
		if _, parsed, err := net.ParseCIDR(block); err == nil {
			ranges = append(ranges, parsed)
		}
	}
	return ranges
}()
