package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

// The registry's job in one line: nothing reaches a store's plugin browser
// until a human here says so. Everything below is a way that could fail to be
// true.

const (
	adminToken    = "test-admin-token"
	adminEmail    = "review@dukafi.dev"
	testPassword  = "correct-horse-battery"
	allowedOrigin = "https://dukafi.dev"
)

type stubFetcher struct {
	manifest *Manifest
	err      error
	calls    int
}

func (s *stubFetcher) Fetch(ctx context.Context, url string) (*Manifest, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	copied := *s.manifest
	return &copied, nil
}

func newTestAPI(t *testing.T, fetcher Fetcher) *API {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "registry.sqlite3"))
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return &API{
		Store: store, Fetcher: fetcher,
		AdminEmail: adminEmail, AdminToken: adminToken,
		AllowedOrigins: []string{allowedOrigin},
		AllowInsecure:  true,
	}
}

func do(t *testing.T, api *API, method, path string, body any, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		encoded, _ := json.Marshal(body)
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.RemoteAddr = "203.0.113.9:1234"
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	api.Handler().ServeHTTP(recorder, req)
	return recorder
}

func admin() map[string]string { return map[string]string{"Authorization": "Bearer " + adminToken} }

// signUp creates an account and returns the headers that authenticate as it.
// The session is sent as a bearer token rather than a cookie because that is
// the same value the cookie carries, and it keeps the tests free of a jar.
func signUp(t *testing.T, api *API, email string) map[string]string {
	t.Helper()
	recorder := do(t, api, "POST", "/v1/auth/signup",
		map[string]string{"email": email, "password": testPassword}, nil)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("signup failed: %d %s", recorder.Code, recorder.Body.String())
	}
	session, ok := decode(t, recorder)["session"].(string)
	if !ok || session == "" {
		t.Fatalf("signup returned no session: %s", recorder.Body.String())
	}
	return map[string]string{"Authorization": "Bearer " + session}
}

// author is the default publishing account, created on first use so a test
// that only cares about approval does not have to spell out a signup.
//
// Held beside the API rather than on it: the production struct has no business
// carrying a test fixture, and every test builds its own API against its own
// temp database, so there is nothing to collide with.
var testAuthors = map[*API]map[string]string{}

func author(t *testing.T, api *API) map[string]string {
	t.Helper()
	if headers, ok := testAuthors[api]; ok {
		return headers
	}
	headers := signUp(t, api, "author@acme.example")
	testAuthors[api] = headers
	t.Cleanup(func() { delete(testAuthors, api) })
	return headers
}

func decode(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response was not JSON: %s", recorder.Body.String())
	}
	return payload
}

// submit publishes as the default author account.
func submit(t *testing.T, api *API, url string) {
	t.Helper()
	recorder := publishAs(t, api, author(t, api), url)
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("publish failed: %d %s", recorder.Code, recorder.Body.String())
	}
}

func publishAs(t *testing.T, api *API, headers map[string]string, url string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, api, "POST", "/v1/me/plugins", map[string]string{"manifestUrl": url}, headers)
}

// ── The approval gate ────────────────────────────────────────────────────────

// The property the whole service exists for.
func TestAPendingPluginIsNotBrowsable(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")

	list := decode(t, do(t, api, "GET", "/v1/plugins", nil, nil))
	if total := list["total"].(float64); total != 0 {
		t.Fatalf("a pending submission was listed publicly (total %v)", total)
	}
	// And not by direct id either, which is the obvious way round a listing
	// filter.
	if recorder := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil); recorder.Code != http.StatusNotFound {
		t.Fatalf("a pending plugin was readable by id: %d", recorder.Code)
	}
}

func TestApprovalMakesAPluginBrowsable(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")

	if recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin()); recorder.Code != http.StatusOK {
		t.Fatalf("approve failed: %d %s", recorder.Code, recorder.Body.String())
	}

	list := decode(t, do(t, api, "GET", "/v1/plugins", nil, nil))
	if total := list["total"].(float64); total != 1 {
		t.Fatalf("expected one listing, got %v", total)
	}
	plugin := decode(t, do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil))
	if plugin["name"] != "Acme Shipping" {
		t.Fatalf("unexpected listing: %v", plugin)
	}
}

// Rejection is not deletion — the submitter is owed a reason, and the id stays
// claimed so a rejected plugin cannot immediately resubmit under the same name
// from a different host.
func TestARejectedPluginIsHiddenButTheSubmitterIsTold(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")

	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/reject",
		map[string]string{"reason": "checksum does not match the archive"}, admin())

	if recorder := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil); recorder.Code != http.StatusNotFound {
		t.Fatal("a rejected plugin is publicly readable")
	}

	mine := decode(t, do(t, api, "GET", "/v1/me/plugins", nil, author(t, api)))
	listing := mine["plugins"].([]any)[0].(map[string]any)
	if listing["status"] != StatusRejected {
		t.Fatalf("the author was not told: %v", listing)
	}
	if listing["rejectReason"] != "checksum does not match the archive" {
		t.Fatalf("no reason given: %v", listing)
	}
}

// The reason is for the author, and for nobody else. It can name the flaw
// that got the plugin turned down, which is not a thing to publish.
func TestARejectReasonIsNotVisibleToOtherAccounts(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/reject",
		map[string]string{"reason": "bundles a keylogger"}, admin())

	stranger := signUp(t, api, "stranger@example.com")
	mine := decode(t, do(t, api, "GET", "/v1/me/plugins", nil, stranger))
	if total := mine["total"].(float64); total != 0 {
		t.Fatalf("another account saw someone else's listing (total %v)", total)
	}
	body := do(t, api, "GET", "/v1/plugins", nil, stranger).Body.String()
	if strings.Contains(body, "keylogger") {
		t.Fatal("the reject reason leaked to the public listing")
	}
}

// ── Admin auth ───────────────────────────────────────────────────────────────

func TestAdminEndpointsRejectEveryWrongCredential(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")

	for _, headers := range []map[string]string{
		nil,
		{"Authorization": "Bearer wrong"},
		{"Authorization": adminToken}, // missing the Bearer prefix
	} {
		recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, headers)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("approve was allowed with headers %v: %d", headers, recorder.Code)
		}
	}
	// And nothing was approved along the way.
	if recorder := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil); recorder.Code != http.StatusNotFound {
		t.Fatal("the plugin became public without an approval")
	}
}

// The whole point of REGISTRY_ADMIN_EMAIL: that account, and only that
// account, can approve.
func TestOnlyTheAdminEmailCanApprove(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")

	// The author is a perfectly valid account. It must not be able to approve
	// its own plugin, which is the failure that would make review theatre.
	recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, author(t, api))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("an ordinary account approved a plugin: %d %s", recorder.Code, recorder.Body.String())
	}
	if listing := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil); listing.Code != http.StatusNotFound {
		t.Fatal("the plugin became public without a real approval")
	}

	reviewer := signUp(t, api, adminEmail)
	if me := decode(t, do(t, api, "GET", "/v1/auth/me", nil, reviewer)); me["account"].(map[string]any)["admin"] != true {
		t.Fatalf("the admin email did not come back as an admin: %v", me)
	}
	if recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, reviewer); recorder.Code != http.StatusOK {
		t.Fatalf("the admin account could not approve: %d %s", recorder.Code, recorder.Body.String())
	}
	if listing := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil); listing.Code != http.StatusOK {
		t.Fatal("approval by the admin account did not publish the plugin")
	}
}

// Signing up as the admin address is what grants review, so the comparison
// has to survive the ways an address gets typed.
func TestTheAdminEmailMatchIsCaseAndSpaceInsensitive(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.AdminEmail = "  Review@Dukafi.DEV "
	submit(t, api, "https://acme.example.com/plugin.json")

	reviewer := signUp(t, api, "REVIEW@dukafi.dev")
	if recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, reviewer); recorder.Code != http.StatusOK {
		t.Fatalf("a differently-cased admin email was refused: %d %s", recorder.Code, recorder.Body.String())
	}
}

// Neither secret set must not mean "everyone is an admin" — the classic way a
// staging deploy becomes a public write endpoint.
func TestNoAdminConfigDisablesAdminEntirely(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")
	api.AdminEmail = ""
	api.AdminToken = ""

	// Including for an account whose email is the empty string's equal — an
	// unset config must never match an unset field.
	for _, headers := range []map[string]string{nil, author(t, api)} {
		recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, headers)
		if recorder.Code != http.StatusForbidden {
			t.Fatalf("admin was reachable with nothing configured: %d %s", recorder.Code, recorder.Body.String())
		}
	}
}

// ── Ownership ────────────────────────────────────────────────────────────────

// The id is what a store installs by. Letting a second ACCOUNT claim a listed
// id would let anyone replace someone else's plugin in every store that has
// it installed.
func TestASecondAccountCannotClaimAListedID(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")

	attacker := signUp(t, api, "attacker@example.com")
	recorder := publishAs(t, api, attacker, "https://attacker.example.com/plugin.json")
	if recorder.Code != http.StatusConflict {
		t.Fatalf("a second account claimed a listed id: %d %s", recorder.Code, recorder.Body.String())
	}

	plugin, err := api.Store.Get("acme-shipping")
	if err != nil {
		t.Fatalf("plugin vanished: %v", err)
	}
	if plugin.ManifestURL != "https://acme.example.com/plugin.json" {
		t.Fatalf("the manifest URL was repointed by the attempt: %s", plugin.ManifestURL)
	}
}

// The owner moving hosts is legitimate — but approval said "this plugin,
// served from here". A new source has to be looked at again.
func TestTheOwnerMovingHostsSendsTheListingBackForReview(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	if recorder := publishAs(t, api, author(t, api), "https://cdn.acme.example.com/plugin.json"); recorder.Code != http.StatusAccepted {
		t.Fatalf("the owner could not move hosts: %d %s", recorder.Code, recorder.Body.String())
	}

	plugin, _ := api.Store.Get("acme-shipping")
	if plugin.Status != StatusPending {
		t.Fatalf("a new host stayed approved without review: %s", plugin.Status)
	}
	if recorder := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil); recorder.Code != http.StatusNotFound {
		t.Fatal("the relisted plugin stayed public while pending re-review")
	}
}

// Resubmitting the same URL is a legitimate "please re-read me", not a
// duplicate.
func TestResubmittingTheSameURLRefreshesInPlace(t *testing.T) {
	manifest := validManifest()
	fetcher := &stubFetcher{manifest: &manifest}
	api := newTestAPI(t, fetcher)
	submit(t, api, "https://acme.example.com/plugin.json")

	manifest.Version = "1.3.0"
	submit(t, api, "https://acme.example.com/plugin.json")

	plugin, err := api.Store.Get("acme-shipping")
	if err != nil {
		t.Fatalf("plugin vanished: %v", err)
	}
	if plugin.Version != "1.3.0" {
		t.Fatalf("version did not update: %s", plugin.Version)
	}
	if plugin.Status != StatusPending {
		t.Fatalf("status changed on a refresh: %s", plugin.Status)
	}
}

// ── Updates ──────────────────────────────────────────────────────────────────

// The reason submitting a URL beats submitting a form: the vendor ships a new
// version to their own host and the catalogue catches up, with no
// re-approval and nobody telling us.
func TestARefreshPicksUpANewVersionWithoutReApproval(t *testing.T) {
	manifest := validManifest()
	fetcher := &stubFetcher{manifest: &manifest}
	api := newTestAPI(t, fetcher)
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	manifest.Version = "2.0.0"
	manifest.Description = "Now with tracking."
	if recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/refresh", nil, admin()); recorder.Code != http.StatusOK {
		t.Fatalf("refresh failed: %d %s", recorder.Code, recorder.Body.String())
	}

	plugin := decode(t, do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil))
	if plugin["version"] != "2.0.0" {
		t.Fatalf("the listing did not update: %v", plugin["version"])
	}
	// Still approved: re-approving every release would make the registry
	// useless to both sides.
	versions := decode(t, do(t, api, "GET", "/v1/plugins/acme-shipping/versions", nil, nil))
	if list := versions["versions"].([]any); len(list) != 2 {
		t.Fatalf("expected both versions in the history, got %d", len(list))
	}
}

// A manifest that changes its id is pointing at a different plugin. Following
// that would silently swap what every store has installed.
func TestARefreshThatChangesTheIDIsRefused(t *testing.T) {
	manifest := validManifest()
	fetcher := &stubFetcher{manifest: &manifest}
	api := newTestAPI(t, fetcher)
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	manifest.ID = "something-else"
	recorder := do(t, api, "POST", "/v1/admin/plugins/acme-shipping/refresh", nil, admin())
	if recorder.Code == http.StatusOK {
		t.Fatal("a manifest was allowed to change the id of a listing")
	}

	plugin, _ := api.Store.Get("acme-shipping")
	if plugin.Status != StatusApproved {
		t.Fatal("a bad refresh delisted a good plugin")
	}
}

// A vendor's host being down for an hour must not delist them.
func TestAFailedRefreshKeepsTheListing(t *testing.T) {
	manifest := validManifest()
	fetcher := &stubFetcher{manifest: &manifest}
	api := newTestAPI(t, fetcher)
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	fetcher.err = invalid("manifestUrl", "could not be reached")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/refresh", nil, admin())

	if recorder := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil); recorder.Code != http.StatusOK {
		t.Fatal("a plugin was delisted because its host blinked")
	}
	plugin, _ := api.Store.Get("acme-shipping")
	if plugin.RefreshError == "" {
		t.Fatal("the failure was not recorded anywhere")
	}
}

// ── Paid and private plugins ─────────────────────────────────────────────────

// The Elementor Pro shape: listed so people can find it, downloadable only
// with a licence key the vendor issues. The registry holds no keys and proxies
// no files.
func TestALicensedPluginIsListedWithoutADownloadURL(t *testing.T) {
	manifest := validManifest()
	manifest.ID = "acme-pro"
	manifest.Pricing = Pricing{Model: PricingPaid, Price: "$49/year", PurchaseURL: "https://acme.example.com/buy"}
	manifest.Distribution = Distribution{
		Type:       DistributionLicensed,
		LicenseURL: "https://acme.example.com/api/download",
		CheckURL:   "https://acme.example.com/api/check",
	}
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/pro.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-pro/approve", nil, admin())

	plugin := decode(t, do(t, api, "GET", "/v1/plugins/acme-pro", nil, nil))
	if plugin["licensed"] != true {
		t.Fatal("a store cannot tell this needs a licence")
	}
	distribution := plugin["distribution"].(map[string]any)
	if distribution["downloadUrl"] != "" {
		t.Fatal("a licensed plugin exposed a direct download")
	}
	if distribution["licenseUrl"] != "https://acme.example.com/api/download" {
		t.Fatalf("no way to redeem a key: %v", distribution)
	}
	pricing := plugin["pricing"].(map[string]any)
	if pricing["purchaseUrl"] != "https://acme.example.com/buy" {
		t.Fatal("a paid plugin with nowhere to buy it")
	}
}

// A store browsing for things it can install without paying.
func TestListingFiltersByLicensedAndCategory(t *testing.T) {
	free := validManifest()
	fetcher := &stubFetcher{manifest: &free}
	api := newTestAPI(t, fetcher)
	submit(t, api, "https://acme.example.com/free.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	paid := validManifest()
	paid.ID = "acme-pro"
	paid.Name = "Acme Payments Pro"
	paid.Description = "Card payments for Acme."
	paid.Category = "payments"
	paid.Pricing = Pricing{Model: PricingPaid, Price: "$49", PurchaseURL: "https://acme.example.com/buy"}
	paid.Distribution = Distribution{Type: DistributionLicensed, LicenseURL: "https://acme.example.com/api/download"}
	fetcher.manifest = &paid
	submit(t, api, "https://acme.example.com/pro.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-pro/approve", nil, admin())

	onlyFree := decode(t, do(t, api, "GET", "/v1/plugins?licensed=false", nil, nil))
	if plugins := onlyFree["plugins"].([]any); len(plugins) != 1 {
		t.Fatalf("licensed=false returned %d plugins", len(plugins))
	}
	byCategory := decode(t, do(t, api, "GET", "/v1/plugins?category=payments", nil, nil))
	if plugins := byCategory["plugins"].([]any); len(plugins) != 1 {
		t.Fatalf("category filter returned %d plugins", len(plugins))
	}
	search := decode(t, do(t, api, "GET", "/v1/plugins?q=shipping", nil, nil))
	if plugins := search["plugins"].([]any); len(plugins) != 1 {
		t.Fatalf("search returned %d plugins", len(plugins))
	}
}

// ── Abuse ────────────────────────────────────────────────────────────────────

// Every submission makes this service fetch a URL of the submitter's choosing.
func TestSubmissionsAreRateLimitedPerSource(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.SubmissionsPerHour = 2

	headers := author(t, api)
	for i := 0; i < 2; i++ {
		publishAs(t, api, headers, "https://acme.example.com/plugin.json")
	}
	recorder := publishAs(t, api, headers, "https://acme.example.com/plugin.json")
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("the third publish was allowed: %d", recorder.Code)
	}
}

// A URL that fails must still count, or supplying broken URLs is an unlimited
// fetch budget.
func TestFailedSubmissionsCountTowardTheLimit(t *testing.T) {
	api := newTestAPI(t, &stubFetcher{err: invalid("manifestUrl", "could not be reached")})
	api.SubmissionsPerHour = 1

	headers := author(t, api)
	publishAs(t, api, headers, "https://acme.example.com/a.json")
	recorder := publishAs(t, api, headers, "https://acme.example.com/b.json")
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("a failed fetch did not count: %d", recorder.Code)
	}
}

// A session is a bearer credential. It must never come back out of any
// endpoint, including the admin listing, which reads across every account.
func TestSessionsAndSubmitTokensNeverLeak(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	headers := author(t, api)
	session := strings.TrimPrefix(headers["Authorization"], "Bearer ")
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	plugin, _ := api.Store.Get("acme-shipping")
	secrets := map[string]string{"the session": session, "the submit token": plugin.SubmitToken()}

	for _, path := range []string{
		"/v1/plugins",
		"/v1/plugins/acme-shipping",
		"/v1/admin/plugins",
		"/v1/me/plugins",
	} {
		requestHeaders := map[string]string(nil)
		switch {
		case strings.Contains(path, "admin"):
			requestHeaders = admin()
		case strings.Contains(path, "/me/"):
			requestHeaders = headers
		}
		body := do(t, api, "GET", path, nil, requestHeaders).Body.String()
		for name, secret := range secrets {
			if secret != "" && strings.Contains(body, secret) {
				t.Fatalf("%s leaked %s", path, name)
			}
		}
	}
}

// The manifest URL is the vendor's business, not a browsable directory of
// where everyone hosts.
func TestThePublicListingHidesTheManifestURL(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	body := do(t, api, "GET", "/v1/plugins/acme-shipping", nil, nil).Body.String()
	if strings.Contains(body, "acme.example.com/plugin.json") {
		t.Fatal("the public listing exposed the manifest URL")
	}
}
