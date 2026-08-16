package main

import (
	"errors"
	"net/http"
	"strings"
	"time"
)

// The account surface: signup, login, logout, "who am I", and the endpoints
// scoped to whatever the caller owns.
//
// The session lives in an HttpOnly cookie rather than a token in localStorage.
// dukafi.dev and registry.dukafi.dev share a registrable domain, so the cookie
// is same-site and rides along on the browse UI's fetches, while remaining
// unreadable to any script — including one injected into a page we do not
// control. Machine callers that want the API without a browser send the same
// value as `Authorization: Bearer <session>`.

const sessionCookie = "dukafi_registry_session"

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *API) signup(w http.ResponseWriter, r *http.Request) {
	var request credentialsRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}

	// Signups are rate limited on the same counter as publishing: creating
	// accounts in bulk is how you would get around a per-account publish
	// limit, so the cheapest place to stop it is here.
	if a.rateLimited(w, r, "signup:"+clientIP(r, a.TrustProxy)) {
		return
	}

	account, err := a.Store.CreateAccount(request.Email, request.Password)
	switch {
	case errors.Is(err, ErrEmailTaken):
		writeError(w, http.StatusConflict, "email_taken", err.Error())
		return
	case errors.Is(err, ErrInvalidEmail), errors.Is(err, ErrWeakPassword), errors.Is(err, ErrPasswordTooLong):
		writeError(w, http.StatusBadRequest, "invalid_credentials", err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", "could not create that account")
		return
	}
	a.startSession(w, r, account, http.StatusCreated)
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var request credentialsRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	// Per IP, not per email: limiting by email lets an attacker lock a known
	// account out of its own login by failing on it deliberately.
	key := "login:" + clientIP(r, a.TrustProxy)
	if a.overLimit(w, r, key) {
		return
	}

	account, err := a.Store.Authenticate(request.Email, request.Password)
	if err != nil {
		// Only FAILURES count against the budget. A successful sign-in is not
		// abuse, and counting it would lock an office behind one NAT address
		// out of their own accounts by lunchtime — while a password guesser,
		// who by definition fails, burns the budget exactly as intended.
		//
		// The per-request memory limiter still caps how fast either can go.
		a.recordAttempt(key)
		// One message for both "no such account" and "wrong password". Which
		// one it was is exactly what an enumeration attack is asking for.
		writeError(w, http.StatusUnauthorized, "invalid_login", ErrInvalidLogin.Error())
		return
	}
	a.startSession(w, r, account, http.StatusOK)
}

func (a *API) startSession(w http.ResponseWriter, r *http.Request, account Account, status int) {
	token, expires, err := a.Store.CreateSession(account.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start a session")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		// Lax, not None: dukafi.dev → registry.dukafi.dev is same-site, so the
		// cookie rides along, while a POST from an unrelated origin does not
		// carry it. That is the CSRF defence, and it is why the frontend has
		// to live under the same registrable domain.
		SameSite: http.SameSiteLaxMode,
		// Off only under -insecure, which is development. A session cookie
		// sent in the clear is a session anyone on the path can take.
		Secure: !a.AllowInsecure,
	})
	account.Admin = a.isAdmin(account)
	writeJSON(w, status, map[string]any{
		"account": account,
		// Returned in the body as well as the cookie so a script or CI job can
		// use the API without a cookie jar. A browser never needs to read it.
		"session": token,
	})
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if token := sessionToken(r); token != "" {
		_ = a.Store.DeleteSession(token)
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: !a.AllowInsecure,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) me(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAccount(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"account": account})
}

// ── Session plumbing ─────────────────────────────────────────────────────────

func sessionToken(r *http.Request) string {
	if cookie, err := r.Cookie(sessionCookie); err == nil && cookie.Value != "" {
		return cookie.Value
	}
	if presented, ok := strings.CutPrefix(strings.TrimSpace(r.Header.Get("Authorization")), "Bearer "); ok {
		return strings.TrimSpace(presented)
	}
	return ""
}

// currentAccount resolves the caller, or reports that there is none.
func (a *API) currentAccount(r *http.Request) (Account, bool) {
	account, err := a.Store.AccountBySession(sessionToken(r))
	if err != nil {
		return Account{}, false
	}
	account.Admin = a.isAdmin(account)
	return account, true
}

func (a *API) requireAccount(w http.ResponseWriter, r *http.Request) (Account, bool) {
	account, ok := a.currentAccount(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "sign in first")
		return Account{}, false
	}
	return account, true
}

// isAdmin is the entire authorisation model: one address, from the
// environment. An unset AdminEmail means nobody is an admin — an empty
// configured value must never match an empty stored one.
func (a *API) isAdmin(account Account) bool {
	if a.AdminEmail == "" || account.Email == "" {
		return false
	}
	return NormalizeEmail(a.AdminEmail) == NormalizeEmail(account.Email)
}

// ── Publishing, scoped to the owner ──────────────────────────────────────────

// overLimit answers the caller with a 429 if `key` has spent its hourly
// budget. It records NOTHING — recording is a separate call, because the two
// endpoints that use this disagree about which attempts should count.
//
// This is the durable layer. It lives in SQLite rather than in memory
// precisely so a restart does not clear it; a patient attacker gets a fresh
// budget from a crash otherwise, and crashes are something they can cause.
func (a *API) overLimit(w http.ResponseWriter, r *http.Request, key string) bool {
	limit := a.SubmissionsPerHour
	if limit <= 0 {
		limit = defaultSubmissionsPerHour
	}
	return a.overLimitN(w, r, key, limit)
}

func (a *API) overLimitN(w http.ResponseWriter, r *http.Request, key string, limit int) bool {
	recent, err := a.Store.RecentSubmissions(key, time.Hour)
	if err == nil && recent >= limit {
		w.Header().Set("Retry-After", "3600")
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts — try again in an hour")
		return true
	}
	return false
}

func (a *API) recordAttempt(key string) {
	_ = a.Store.RecordSubmissionAttempt(key)
}

// rateLimited is check-and-count in one, for the actions where the attempt
// itself is the cost — publishing makes this service fetch a URL of the
// caller's choosing whether or not the manifest turns out to be valid, so
// "make it fail" must not be an unlimited fetch budget.
func (a *API) rateLimited(w http.ResponseWriter, r *http.Request, key string) bool {
	if a.overLimit(w, r, key) {
		return true
	}
	// Counted BEFORE the work, so a failure still counts.
	a.recordAttempt(key)
	return false
}

func (a *API) downloadLimited(w http.ResponseWriter, r *http.Request) bool {
	limit := a.DownloadsPerHour
	if limit <= 0 {
		limit = defaultDownloadsPerHour
	}
	key := "download:" + clientIP(r, a.TrustProxy)
	if a.overLimitN(w, r, key, limit) {
		return true
	}
	a.recordAttempt(key)
	return false
}

// publish is the authenticated version of submitting a manifest URL.
func (a *API) publish(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAccount(w, r)
	if !ok {
		return
	}

	var request struct {
		ManifestURL string `json:"manifestUrl"`
		Note        string `json:"note"`
	}
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	manifestURL := strings.TrimSpace(request.ManifestURL)
	if manifestURL == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "manifestUrl is required")
		return
	}
	if len(request.Note) > 1000 {
		writeError(w, http.StatusBadRequest, "invalid_body", "note is too long")
		return
	}
	// Keyed on the account, not the IP: an author on a shared address should
	// not be throttled by a stranger's publishing.
	if a.rateLimited(w, r, "publish:"+account.ID) {
		return
	}

	manifest, ok := a.fetchManifest(w, r, manifestURL)
	if !ok {
		return
	}
	if err := a.ingestArchive(r.Context(), manifest); err != nil {
		var validation ValidationError
		if errors.As(err, &validation) {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error": map[string]any{
					"code": "invalid_manifest", "message": validation.Message, "field": validation.Field,
				},
			})
			return
		}
		writeError(w, http.StatusUnprocessableEntity, "invalid_manifest", "could not copy that archive")
		return
	}

	plugin, err := a.Store.Submit(manifest, manifestURL, request.Note, account.ID)
	if errors.Is(err, ErrDuplicate) {
		writeError(w, http.StatusConflict, "duplicate_id",
			"another account already lists the id "+manifest.ID)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not record that plugin")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"plugin": a.ownerView(plugin)})
}

func (a *API) myPlugins(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAccount(w, r)
	if !ok {
		return
	}
	plugins, total, err := a.Store.List(ListOptions{AccountID: account.ID, Limit: 100})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read your plugins")
		return
	}
	views := make([]map[string]any, 0, len(plugins))
	for _, plugin := range plugins {
		views = append(views, a.ownerView(plugin))
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": views, "total": total})
}

// ownedPlugin resolves a path id and proves the caller owns it. A plugin
// belonging to someone else is a 404, not a 403: whether an id exists is not
// something to confirm to a stranger.
func (a *API) ownedPlugin(w http.ResponseWriter, r *http.Request) (Plugin, Account, bool) {
	account, ok := a.requireAccount(w, r)
	if !ok {
		return Plugin{}, Account{}, false
	}
	plugin, err := a.Store.Get(r.PathValue("id"))
	if err != nil || plugin.AccountID == "" || plugin.AccountID != account.ID {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin on this account")
		return Plugin{}, Account{}, false
	}
	return plugin, account, true
}

// myRefresh re-reads an owner's own manifest now — the button an author
// presses after shipping a release rather than waiting for the sweep.
func (a *API) myRefresh(w http.ResponseWriter, r *http.Request) {
	plugin, account, ok := a.ownedPlugin(w, r)
	if !ok {
		return
	}
	if a.rateLimited(w, r, "refresh:"+account.ID) {
		return
	}
	updated, err := a.RefreshOne(r.Context(), plugin)
	if err != nil {
		// 502, because the failure is the vendor's host, not this request.
		writeError(w, http.StatusBadGateway, "refresh_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugin": a.ownerView(updated)})
}

func (a *API) myWithdraw(w http.ResponseWriter, r *http.Request) {
	plugin, account, ok := a.ownedPlugin(w, r)
	if !ok {
		return
	}
	if err := a.Store.Withdraw(plugin.ID, account.ID); err != nil {
		writeError(w, http.StatusConflict, "cannot_withdraw", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": plugin.ID})
}
