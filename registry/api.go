package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// The HTTP surface.
//
// Three audiences, three levels of trust:
//
//	public  — a Dukafi store browsing the catalogue. No auth, approved only.
//	author  — a signed-in account, acting on the plugins it published.
//	admin   — exactly one account, the one whose email matches
//	          REGISTRY_ADMIN_EMAIL. Nothing in the database grants this.
type API struct {
	Store     *Store
	Fetcher   Fetcher
	Archives  ArchiveFetcher
	Blobs     BlobStore
	PublicURL string

	// The single address that may approve, reject and unlist. Set from the
	// environment, so who reviews is a deploy-time decision rather than a row
	// somebody could UPDATE.
	AdminEmail string
	// A bearer token that reaches the same admin endpoints without a browser.
	// Kept for scripts and for getting back in if the admin account's password
	// is lost. Unset means that route in is closed entirely.
	AdminToken string

	// Browser origins allowed to call the authenticated endpoints WITH
	// credentials. The catalogue itself stays readable from anywhere.
	AllowedOrigins []string

	AllowInsecure bool

	// The per-address memory limiter applied to every request. Nil disables
	// that layer entirely; the durable SQLite limits below still apply.
	Limiter *Limiter

	// Whether an X-Forwarded-For header may be believed. Only true when this
	// registry is knowingly behind a proxy — see clientIP for why trusting it
	// otherwise makes every limit here bypassable.
	TrustProxy bool

	// How many submissions one account may make per hour. A publish makes this
	// service fetch a URL of the author's choosing, so it is not free to serve
	// and not something to leave unbounded.
	SubmissionsPerHour int

	// How many archive downloads one address may make per hour. Serving a
	// stored plugin is cheap compared to ingesting one, but 5 MB times an
	// unbounded GET is still a way to empty a disk budget.
	DownloadsPerHour int
}

const (
	// The durable, per-hour budget for the expensive and security-sensitive
	// actions: publishing, signing up, logging in.
	defaultSubmissionsPerHour = 10

	// The in-memory, per-address budget for everything. Generous, because a
	// human browsing the catalogue with a debounced search box legitimately
	// fires several requests a second while typing, and a store's plugin
	// browser opens with a handful at once. It is here to stop a flood, not to
	// meter ordinary use.
	defaultRequestsPerMinute = 120
	defaultBurst             = 40

	// Public archive downloads per source address per hour. A store installing
	// a handful of plugins is well under this; scraping the catalogue is not.
	defaultDownloadsPerHour = 60

	// Roughly 50k tracked addresses, a few MB. Past this the limiter refuses
	// new keys rather than growing without bound.
	defaultRateLimitKeys = 50_000
)

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", a.health)
	mux.HandleFunc("GET /v1/categories", a.categories)
	mux.HandleFunc("GET /v1/plugins", a.listPlugins)
	mux.HandleFunc("GET /v1/plugins/{id}/download", a.downloadPlugin)
	mux.HandleFunc("GET /v1/plugins/{id}/media/{name}", a.pluginMedia)
	mux.HandleFunc("GET /v1/plugins/{id}", a.getPlugin)
	mux.HandleFunc("GET /v1/plugins/{id}/versions", a.pluginVersions)

	mux.HandleFunc("POST /v1/auth/signup", a.signup)
	mux.HandleFunc("POST /v1/auth/login", a.login)
	mux.HandleFunc("POST /v1/auth/logout", a.logout)
	mux.HandleFunc("GET /v1/auth/me", a.me)

	// Everything an author does to their own listings.
	mux.HandleFunc("POST /v1/me/plugins", a.publish)
	mux.HandleFunc("GET /v1/me/plugins", a.myPlugins)
	mux.HandleFunc("POST /v1/me/plugins/{id}/refresh", a.myRefresh)
	mux.HandleFunc("DELETE /v1/me/plugins/{id}", a.myWithdraw)

	mux.HandleFunc("GET /v1/admin/plugins", a.adminList)
	mux.HandleFunc("POST /v1/admin/plugins/{id}/approve", a.adminApprove)
	mux.HandleFunc("POST /v1/admin/plugins/{id}/reject", a.adminReject)
	mux.HandleFunc("POST /v1/admin/plugins/{id}/unlist", a.adminUnlist)
	mux.HandleFunc("POST /v1/admin/plugins/{id}/refresh", a.adminRefresh)

	// Order matters. CORS is OUTERMOST so a 429 still carries its headers —
	// without them a browser reports the rejection as an opaque CORS failure
	// and the UI can never show "you are being rate limited". The limiter then
	// sits in front of the routes, so a flood is rejected before it reaches a
	// handler that would touch the database.
	return logRequests(a.cors(a.rateLimit(mux)))
}

// cors decides what a browser on another origin may do.
//
// Two regimes, and the split matters. The catalogue is public data, so it
// answers `*` to anyone — a store's admin UI fetching it from an arbitrary
// self-hosted domain is the normal case. The authenticated endpoints echo the
// origin only if it is allowlisted and only then set Allow-Credentials, because
// `*` plus credentials is both forbidden by the spec and, if it worked, would
// mean any page on the internet could act as a signed-in author.
func (a *API) cors(next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, origin := range a.AllowedOrigins {
		if trimmed := strings.TrimSpace(origin); trimmed != "" {
			allowed[strings.ToLower(strings.TrimRight(trimmed, "/"))] = true
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.ToLower(strings.TrimRight(r.Header.Get("Origin"), "/"))
		// Always, even when the answer is `*`: a cache that stored the
		// credentialed response for one origin and served it to another would
		// undo the whole distinction above.
		w.Header().Add("Vary", "Origin")

		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── Public ───────────────────────────────────────────────────────────────────

func (a *API) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) categories(w http.ResponseWriter, r *http.Request) {
	counts, err := a.Store.CategoryCounts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read categories")
		return
	}
	list := make([]map[string]any, 0, len(Categories))
	for _, category := range Categories {
		list = append(list, map[string]any{"id": category, "count": counts[category]})
	}
	writeJSON(w, http.StatusOK, map[string]any{"categories": list})
}

func (a *API) listPlugins(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	opts := ListOptions{
		// Approved only, always. A pending submission is not a listing, and a
		// rejected one must not be reachable by guessing a query string.
		Status:   StatusApproved,
		Category: strings.ToLower(strings.TrimSpace(query.Get("category"))),
		Query:    strings.TrimSpace(query.Get("q")),
		Limit:    intParam(query.Get("limit"), 50),
		Offset:   intParam(query.Get("offset"), 0),
	}
	if opts.Category != "" && !validCategory(opts.Category) {
		writeError(w, http.StatusBadRequest, "invalid_category",
			"category must be one of: "+strings.Join(Categories, ", "))
		return
	}
	switch query.Get("licensed") {
	case "true":
		licensed := true
		opts.Licensed = &licensed
	case "false":
		licensed := false
		opts.Licensed = &licensed
	}

	plugins, total, err := a.Store.List(opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read plugins")
		return
	}
	views := make([]map[string]any, 0, len(plugins))
	for _, plugin := range plugins {
		views = append(views, a.publicView(plugin))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"plugins": views, "total": total, "limit": opts.Limit, "offset": opts.Offset,
	})
}

func (a *API) getPlugin(w http.ResponseWriter, r *http.Request) {
	plugin, err := a.Store.Get(r.PathValue("id"))
	// A plugin that is not approved is a 404 to the public, not a 403: whether
	// an id is pending or rejected is not something to leak by status code.
	if err != nil || plugin.Status != StatusApproved {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin")
		return
	}
	writeJSON(w, http.StatusOK, a.publicView(plugin))
}

// downloadPlugin serves the copy of a public archive this registry stored.
//
// Approved and public only. A pending listing is a 404 — we may already have
// the bytes (ingest happens at publish), but unreviewed code is not something
// to hand out. A licensed listing is the same 404: those files never pass
// through here.
func (a *API) downloadPlugin(w http.ResponseWriter, r *http.Request) {
	if a.downloadLimited(w, r) {
		return
	}
	plugin, err := a.Store.Get(r.PathValue("id"))
	if err != nil || plugin.Status != StatusApproved || plugin.Distribution.Type != DistributionPublic {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin")
		return
	}
	if a.Blobs == nil {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin")
		return
	}
	body, err := a.Blobs.Get(plugin.ID, plugin.Distribution.SHA256)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin")
		return
	}

	filename := plugin.ID + "-" + plugin.Version + ".tar.gz"
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("X-Checksum-Sha256", plugin.Distribution.SHA256)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("ETag", `"`+plugin.Distribution.SHA256+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (a *API) pluginVersions(w http.ResponseWriter, r *http.Request) {
	plugin, err := a.Store.Get(r.PathValue("id"))
	if err != nil || plugin.Status != StatusApproved {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin")
		return
	}
	versions, err := a.Store.Versions(plugin.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read versions")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": plugin.ID, "current": plugin.Version, "versions": versions})
}

// fetchManifest reads and validates a manifest URL, answering the caller
// itself on failure. Shared so the publish path and any future one cannot
// disagree about what a bad manifest looks like.
func (a *API) fetchManifest(w http.ResponseWriter, r *http.Request, manifestURL string) (*Manifest, bool) {
	ctx, cancel := context.WithTimeout(r.Context(), fetchTimeout+2*time.Second)
	defer cancel()

	manifest, err := a.Fetcher.Fetch(ctx, manifestURL)
	if err == nil {
		return manifest, true
	}

	var validation ValidationError
	if errors.As(err, &validation) {
		// The field name is the difference between "it did not work" and
		// "fix your sha256", so it is passed through rather than flattened.
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error": map[string]any{
				"code": "invalid_manifest", "message": validation.Message, "field": validation.Field,
			},
		})
		return nil, false
	}
	// Deliberately not err.Error(): a transport failure's text can carry the
	// upstream response, and echoing that back is how an SSRF probe reads its
	// answer through this endpoint.
	writeError(w, http.StatusUnprocessableEntity, "invalid_manifest", "could not read that manifest")
	return nil, false
}

// ── Admin ────────────────────────────────────────────────────────────────────

// requireAdmin admits two callers, and only two.
//
//  1. The signed-in account whose email matches REGISTRY_ADMIN_EMAIL. This is
//     the normal path — someone reviewing the queue in a browser.
//  2. A bearer token equal to REGISTRY_ADMIN_TOKEN, for scripts and for
//     getting back in when the admin account's password is lost.
//
// Both are configured in the environment, and an unset value never matches:
// a registry deployed with neither has no admin surface at all, which is the
// correct failure. An empty secret must not mean "everyone".
func (a *API) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if a.AdminEmail == "" && a.AdminToken == "" {
		writeError(w, http.StatusForbidden, "admin_disabled",
			"no admin email or token is configured")
		return false
	}

	// Session first: it is the path a browser takes, and it means the token
	// need not exist at all on a deployment that only ever reviews by hand.
	if account, ok := a.currentAccount(r); ok {
		if account.Admin {
			return true
		}
		// A signed-in non-admin gets 403, not 401. They are authenticated;
		// re-authenticating will not help, and saying so avoids a login loop.
		writeError(w, http.StatusForbidden, "forbidden", "this account cannot review plugins")
		return false
	}

	if a.AdminToken == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "sign in as the admin account")
		return false
	}
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	// The scheme is REQUIRED, not stripped if present: `TrimPrefix` returns
	// the string unchanged when the prefix is absent, so trimming would have
	// accepted a bare token with no scheme at all. It did, until a test said so.
	presented, ok := strings.CutPrefix(header, "Bearer ")
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "admin credentials required")
		return false
	}
	// Constant time: a token compared with == leaks its prefix through timing.
	if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(presented)), []byte(a.AdminToken)) != 1 {
		writeError(w, http.StatusUnauthorized, "unauthorized", "admin credentials required")
		return false
	}
	return true
}

func (a *API) adminList(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	query := r.URL.Query()
	status := strings.ToLower(strings.TrimSpace(query.Get("status")))
	if status != "" && !validStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid_status", "unknown status")
		return
	}
	plugins, total, err := a.Store.List(ListOptions{
		Status: status,
		Query:  strings.TrimSpace(query.Get("q")),
		Limit:  intParam(query.Get("limit"), 50),
		Offset: intParam(query.Get("offset"), 0),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read plugins")
		return
	}

	// Who published it is the first thing a reviewer wants to know — the
	// manifest's `author` field is whatever the manifest claims, while the
	// account email is who actually pressed publish. Memoised because one
	// author usually holds several of the rows on screen.
	emails := map[string]string{}
	views := make([]map[string]any, 0, len(plugins))
	for _, plugin := range plugins {
		view := a.ownerView(plugin)
		if plugin.AccountID != "" {
			email, seen := emails[plugin.AccountID]
			if !seen {
				if account, lookupErr := a.Store.AccountByID(plugin.AccountID); lookupErr == nil {
					email = account.Email
				}
				emails[plugin.AccountID] = email
			}
			if email != "" {
				view["publishedBy"] = email
			}
		}
		views = append(views, view)
	}
	writeJSON(w, http.StatusOK, map[string]any{"plugins": views, "total": total})
}

func (a *API) adminApprove(w http.ResponseWriter, r *http.Request) {
	a.adminSetStatus(w, r, StatusApproved, "")
}

func (a *API) adminUnlist(w http.ResponseWriter, r *http.Request) {
	a.adminSetStatus(w, r, StatusUnlisted, a.reasonFrom(r))
}

func (a *API) adminReject(w http.ResponseWriter, r *http.Request) {
	a.adminSetStatus(w, r, StatusRejected, a.reasonFrom(r))
}

func (a *API) reasonFrom(r *http.Request) string {
	var body struct {
		Reason string `json:"reason"`
	}
	_ = decodeJSON(r, &body)
	if len(body.Reason) > 1000 {
		return body.Reason[:1000]
	}
	return strings.TrimSpace(body.Reason)
}

func (a *API) adminSetStatus(w http.ResponseWriter, r *http.Request, status, reason string) {
	if !a.requireAdmin(w, r) {
		return
	}
	plugin, err := a.Store.SetStatus(r.PathValue("id"), status, reason)
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update that plugin")
		return
	}
	writeJSON(w, http.StatusOK, plugin)
}

// adminRefresh re-reads one manifest now, rather than waiting for the sweep.
func (a *API) adminRefresh(w http.ResponseWriter, r *http.Request) {
	if !a.requireAdmin(w, r) {
		return
	}
	plugin, err := a.Store.Get(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "no such plugin")
		return
	}
	if isHostedManifest(plugin.ManifestURL) {
		writeError(w, http.StatusConflict, "hosted",
			"this listing is hosted here — there is no remote manifest to re-read")
		return
	}
	updated, err := a.RefreshOne(r.Context(), plugin)
	if err != nil {
		writeError(w, http.StatusBadGateway, "refresh_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ── Refresh ──────────────────────────────────────────────────────────────────

// RefreshOne re-fetches a listing's manifest, copies a new public archive if
// the checksum changed, and writes what changed.
//
// A failure is RECORDED, not fatal: a vendor's host being down for an hour
// must not delist their plugin, and the stored copy is what the catalogue
// serves in the meantime. The archive is ingested BEFORE the listing is
// updated, so a store never sees a checksum for bytes we do not have.
func (a *API) RefreshOne(ctx context.Context, plugin Plugin) (Plugin, error) {
	if isHostedManifest(plugin.ManifestURL) {
		return Plugin{}, errors.New("this listing is hosted here — upload a new archive from the dashboard")
	}
	manifest, err := a.Fetcher.Fetch(ctx, plugin.ManifestURL)
	if err != nil {
		_ = a.Store.RecordRefreshError(plugin.ID, err.Error())
		return Plugin{}, err
	}
	// The id is the identity of the listing. A manifest that changes it is
	// pointing at a different plugin, which is a resubmission, not an update.
	if manifest.ID != plugin.ID {
		message := "manifest id changed from " + plugin.ID + " to " + manifest.ID
		_ = a.Store.RecordRefreshError(plugin.ID, message)
		return Plugin{}, errors.New(message)
	}
	if err := a.ingestArchive(ctx, manifest); err != nil {
		_ = a.Store.RecordRefreshError(plugin.ID, err.Error())
		return Plugin{}, err
	}
	return a.Store.applyManifest(plugin, manifest)
}

// RefreshAll sweeps every listing that is still live. Rejected ones are left
// alone — the registry stops fetching a URL it has already declined.
func (a *API) RefreshAll(ctx context.Context) (int, int) {
	refreshed, failed := 0, 0
	for _, status := range []string{StatusApproved, StatusPending} {
		plugins, _, err := a.Store.List(ListOptions{Status: status, Limit: 100})
		if err != nil {
			continue
		}
		for _, plugin := range plugins {
			if ctx.Err() != nil {
				return refreshed, failed
			}
			if isHostedManifest(plugin.ManifestURL) {
				continue
			}
			if _, err := a.RefreshOne(ctx, plugin); err != nil {
				failed++
				continue
			}
			refreshed++
		}
	}
	return refreshed, failed
}

func (a *API) publicView(plugin Plugin) map[string]any {
	return a.rewriteMedia(plugin, a.rewriteDownload(plugin, plugin.PublicView()))
}

func (a *API) ownerView(plugin Plugin) map[string]any {
	return a.rewriteMedia(plugin, a.rewriteDownload(plugin, plugin.OwnerView()))
}

// rewriteDownload points stores at OUR copy when we have one. The author's
// original URL stays in the database so a refresh can still fetch it.
func (a *API) rewriteDownload(plugin Plugin, view map[string]any) map[string]any {
	if plugin.Distribution.Type != DistributionPublic {
		return view
	}
	if a.Blobs == nil || !a.Blobs.Has(plugin.ID, plugin.Distribution.SHA256) {
		return view
	}
	distribution, _ := view["distribution"].(map[string]any)
	if distribution == nil {
		return view
	}
	distribution["downloadUrl"] = a.hostedDownloadURL(plugin.ID)
	return view
}

func (a *API) hostedDownloadURL(id string) string {
	path := "/v1/plugins/" + url.PathEscape(id) + "/download"
	base := strings.TrimRight(a.PublicURL, "/")
	if base == "" {
		return path
	}
	return base + path
}

func (a *API) hostedMediaURL(id, name string) string {
	path := "/v1/plugins/" + url.PathEscape(id) + "/media/" + url.PathEscape(name)
	base := strings.TrimRight(a.PublicURL, "/")
	if base == "" {
		return path
	}
	return base + path
}

func (a *API) rewriteMedia(plugin Plugin, view map[string]any) map[string]any {
	if a.Blobs == nil {
		return view
	}
	if a.Blobs.HasMedia(plugin.ID, "logo") {
		view["logo"] = a.hostedMediaURL(plugin.ID, "logo")
	}
	shots := []string{}
	for i := 0; i < maxImages; i++ {
		name := screenshotName(i)
		if !a.Blobs.HasMedia(plugin.ID, name) {
			break
		}
		shots = append(shots, a.hostedMediaURL(plugin.ID, name))
	}
	if len(shots) > 0 {
		view["images"] = shots
	}
	return view
}

func (a *API) pluginMedia(w http.ResponseWriter, r *http.Request) {
	if a.Blobs == nil {
		writeError(w, http.StatusNotFound, "not_found", "no such file")
		return
	}
	body, contentType, err := a.Blobs.GetMedia(r.PathValue("id"), r.PathValue("name"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "no such file")
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// ingestArchive copies a public plugin's gzip onto this registry. Licensed
// listings skip this: those files are the vendor's. Tests that do not set
// Archives or Blobs skip it too, so existing catalogue tests stay about
// listing rather than hosting.
func (a *API) ingestArchive(ctx context.Context, manifest *Manifest) error {
	if manifest == nil || manifest.Distribution.Type != DistributionPublic {
		return nil
	}
	if a.Archives == nil || a.Blobs == nil {
		return nil
	}
	if a.Blobs.Has(manifest.ID, manifest.Distribution.SHA256) {
		return nil
	}

	body, err := a.Archives.FetchArchive(ctx, manifest.Distribution.DownloadURL)
	if err != nil {
		return err
	}
	if err := a.Blobs.Put(manifest.ID, manifest.Distribution.SHA256, body); err != nil {
		if errors.Is(err, ErrNotGzip) {
			return invalid("distribution.downloadUrl", ErrNotGzip.Error())
		}
		if errors.Is(err, ErrChecksumMismatch) {
			return invalid("distribution.sha256", ErrChecksumMismatch.Error())
		}
		if errors.Is(err, ErrBadBlobKey) {
			return invalid("id", err.Error())
		}
		return err
	}
	return nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func validStatus(status string) bool {
	switch status {
	case StatusPending, StatusApproved, StatusRejected, StatusUnlisted:
		return true
	}
	return false
}

func intParam(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return fallback
	}
	return value
}

func decodeJSON(r *http.Request, target any) error {
	// Capped: an endpoint that reads an unbounded body is a memory exhaustion
	// away from being down.
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 64*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errors.New("could not read the request body as JSON")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// CORS headers are NOT set here. The middleware has already decided
	// whether this response may carry credentials, and a blanket `*` written
	// at this point would overwrite the echoed origin and silently break every
	// signed-in request from the browse UI.
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("registry: writing response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message}})
}

func (a *API) writeIngestError(w http.ResponseWriter, err error) {
	var validation ValidationError
	if errors.As(err, &validation) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error": map[string]any{
				"code": "invalid_manifest", "message": validation.Message, "field": validation.Field,
			},
		})
		return
	}
	if errors.Is(err, ErrArchiveTooLarge) || errors.Is(err, ErrImageHuge) {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", err.Error())
		return
	}
	writeError(w, http.StatusUnprocessableEntity, "invalid_manifest", err.Error())
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(started).Round(time.Millisecond))
	})
}
