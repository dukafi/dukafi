package main

import (
	"net/http"
	"strings"
	"testing"
)

// Accounts are the ownership model, so the tests here are mostly about the
// ways one account could reach another's work — or the public could reach
// either.

func TestSignupThenLoginThenLogout(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})

	signUp(t, api, "hampay@example.com")

	login := do(t, api, "POST", "/v1/auth/login",
		map[string]string{"email": "hampay@example.com", "password": testPassword}, nil)
	if login.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", login.Code, login.Body.String())
	}
	session := decode(t, login)["session"].(string)
	headers := map[string]string{"Authorization": "Bearer " + session}

	if me := do(t, api, "GET", "/v1/auth/me", nil, headers); me.Code != http.StatusOK {
		t.Fatalf("the session did not authenticate: %d", me.Code)
	}
	if out := do(t, api, "POST", "/v1/auth/logout", nil, headers); out.Code != http.StatusOK {
		t.Fatalf("logout failed: %d", out.Code)
	}
	// The session is destroyed server-side, not merely cleared in the browser.
	// A logout that only drops the cookie leaves a live credential behind on
	// whatever copied it.
	if me := do(t, api, "GET", "/v1/auth/me", nil, headers); me.Code != http.StatusUnauthorized {
		t.Fatalf("the session still worked after logout: %d", me.Code)
	}
}

func TestSignupIsCaseInsensitiveOnEmail(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	signUp(t, api, "Ann@Example.com")

	// Two accounts differing only in case would mean one of them can never be
	// logged into, because the lookup folds the address.
	second := do(t, api, "POST", "/v1/auth/signup",
		map[string]string{"email": "ann@example.com", "password": testPassword}, nil)
	if second.Code != http.StatusConflict {
		t.Fatalf("a case variant created a second account: %d %s", second.Code, second.Body.String())
	}

	login := do(t, api, "POST", "/v1/auth/login",
		map[string]string{"email": "ANN@EXAMPLE.COM", "password": testPassword}, nil)
	if login.Code != http.StatusOK {
		t.Fatalf("could not log in with a different case: %d", login.Code)
	}
}

func TestWeakAndMalformedCredentialsAreRefused(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})

	cases := []struct{ email, password, why string }{
		{"not-an-email", testPassword, "no domain"},
		{"Someone <a@b.com>", testPassword, "a display name, not an address"},
		{"a@localhost", testPassword, "no dot in the domain"},
		{"fine@example.com", "short", "under the minimum length"},
		// bcrypt silently truncates past 72 bytes, which would make two
		// different long passwords equivalent. Refused rather than truncated.
		{"fine@example.com", strings.Repeat("a", 73), "over bcrypt's limit"},
	}
	for _, testCase := range cases {
		recorder := do(t, api, "POST", "/v1/auth/signup",
			map[string]string{"email": testCase.email, "password": testCase.password}, nil)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("%s was accepted: %d %s", testCase.why, recorder.Code, recorder.Body.String())
		}
	}
}

// A login form that answers differently for "no such account" and "wrong
// password" is an account-enumeration oracle.
func TestLoginDoesNotRevealWhetherAnAccountExists(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	signUp(t, api, "real@example.com")

	missing := do(t, api, "POST", "/v1/auth/login",
		map[string]string{"email": "nobody@example.com", "password": testPassword}, nil)
	wrong := do(t, api, "POST", "/v1/auth/login",
		map[string]string{"email": "real@example.com", "password": "wrong-password-here"}, nil)

	if missing.Code != http.StatusUnauthorized || wrong.Code != http.StatusUnauthorized {
		t.Fatalf("statuses differed: missing %d, wrong %d", missing.Code, wrong.Code)
	}
	if missing.Body.String() != wrong.Body.String() {
		t.Fatalf("bodies differed:\n  missing: %s\n  wrong:   %s", missing.Body.String(), wrong.Body.String())
	}
}

func TestPublishingRequiresAnAccount(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})

	recorder := publishAs(t, api, nil, "https://acme.example.com/plugin.json")
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("an anonymous caller published: %d %s", recorder.Code, recorder.Body.String())
	}
	if _, err := api.Store.Get("acme-shipping"); err == nil {
		t.Fatal("an anonymous publish still created a row")
	}
}

// The owner-scoped endpoints are the ones that would hand a listing to the
// wrong person, so each is checked against a second account.
func TestOwnerEndpointsAreScopedToTheOwner(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	submit(t, api, "https://acme.example.com/plugin.json")
	stranger := signUp(t, api, "stranger@example.com")

	// 404, not 403. Whether an id exists is not something to confirm to
	// someone who does not own it.
	for _, attempt := range []struct{ method, path string }{
		{"POST", "/v1/me/plugins/acme-shipping/refresh"},
		{"DELETE", "/v1/me/plugins/acme-shipping"},
	} {
		recorder := do(t, api, attempt.method, attempt.path, nil, stranger)
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("%s %s reached another account's plugin: %d", attempt.method, attempt.path, recorder.Code)
		}
	}
	if _, err := api.Store.Get("acme-shipping"); err != nil {
		t.Fatal("a stranger deleted someone else's plugin")
	}
}

func TestAnOwnerCanRefreshAndWithdrawTheirOwnPlugin(t *testing.T) {
	manifest := validManifest()
	fetcher := &stubFetcher{manifest: &manifest}
	api := newTestAPI(t, fetcher)
	headers := author(t, api)
	submit(t, api, "https://acme.example.com/plugin.json")

	manifest.Version = "1.4.0"
	refresh := do(t, api, "POST", "/v1/me/plugins/acme-shipping/refresh", nil, headers)
	if refresh.Code != http.StatusOK {
		t.Fatalf("the owner could not refresh: %d %s", refresh.Code, refresh.Body.String())
	}
	if plugin, _ := api.Store.Get("acme-shipping"); plugin.Version != "1.4.0" {
		t.Fatalf("refresh did not pick up the new version: %s", plugin.Version)
	}

	if recorder := do(t, api, "DELETE", "/v1/me/plugins/acme-shipping", nil, headers); recorder.Code != http.StatusOK {
		t.Fatalf("the owner could not withdraw: %d %s", recorder.Code, recorder.Body.String())
	}
	if _, err := api.Store.Get("acme-shipping"); err == nil {
		t.Fatal("withdraw left the row behind")
	}
}

// An approved plugin that vanishes breaks every store that installed it. The
// author does not get to do that unilaterally.
func TestAnApprovedPluginCannotBeWithdrawn(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	headers := author(t, api)
	submit(t, api, "https://acme.example.com/plugin.json")
	do(t, api, "POST", "/v1/admin/plugins/acme-shipping/approve", nil, admin())

	if recorder := do(t, api, "DELETE", "/v1/me/plugins/acme-shipping", nil, headers); recorder.Code != http.StatusConflict {
		t.Fatalf("an approved plugin was withdrawn: %d %s", recorder.Code, recorder.Body.String())
	}
	if _, err := api.Store.Get("acme-shipping"); err != nil {
		t.Fatal("the listing was removed anyway")
	}
}

// ── CORS ─────────────────────────────────────────────────────────────────────

// `*` plus credentials is forbidden by the spec, and if browsers honoured it
// any page on the internet could act as a signed-in author. The catalogue
// stays readable from anywhere, because it is public data.
func TestCredentialsAreOnlyOfferedToAllowedOrigins(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})

	allowed := do(t, api, "GET", "/v1/plugins", nil, map[string]string{"Origin": allowedOrigin})
	if got := allowed.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("the allowed origin was not echoed: %q", got)
	}
	if allowed.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("the allowed origin was not offered credentials")
	}

	stranger := do(t, api, "GET", "/v1/plugins", nil, map[string]string{"Origin": "https://evil.example"})
	if got := stranger.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("an unknown origin got something other than the public answer: %q", got)
	}
	if stranger.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatal("an unknown origin was offered credentials")
	}
	// Without Vary, a shared cache could serve the credentialed response for
	// one origin to another, undoing the whole distinction.
	if !strings.Contains(stranger.Header().Get("Vary"), "Origin") {
		t.Fatal("responses are not varied on Origin")
	}
}

func TestPreflightIsAnswered(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})

	recorder := do(t, api, "OPTIONS", "/v1/me/plugins", nil, map[string]string{"Origin": allowedOrigin})
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("preflight was not answered: %d", recorder.Code)
	}
	if !strings.Contains(recorder.Header().Get("Access-Control-Allow-Methods"), "DELETE") {
		t.Fatalf("preflight did not allow DELETE: %q", recorder.Header().Get("Access-Control-Allow-Methods"))
	}
}

// ── Session cookie ───────────────────────────────────────────────────────────

func TestTheSessionCookieIsHttpOnlyAndSameSite(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.AllowInsecure = false

	recorder := do(t, api, "POST", "/v1/auth/signup",
		map[string]string{"email": "cookie@example.com", "password": testPassword}, nil)

	var found *http.Cookie
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == sessionCookie {
			found = cookie
		}
	}
	if found == nil {
		t.Fatal("signup set no session cookie")
	}
	if !found.HttpOnly {
		t.Fatal("the session cookie is readable by script")
	}
	if !found.Secure {
		t.Fatal("the session cookie would be sent in the clear")
	}
	// Lax is the CSRF defence: dukafi.dev → registry.dukafi.dev is same-site
	// so it rides along, while a POST from an unrelated origin does not.
	if found.SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected SameSite: %v", found.SameSite)
	}
}
