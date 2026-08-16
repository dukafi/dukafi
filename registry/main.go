// Command registry is the Dukafi plugin registry.
//
// Authors describe a plugin and upload the gzip from their account, or still
// submit a manifest URL. The registry stores public archives in Railway
// Storage (an S3-compatible bucket; local disk when no bucket is configured)
// and — once approved — lists them so stores can browse and download.
// Licensed plugins stay with their vendor.
package main

import (
	"context"
	"flag"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	var (
		addr      = flag.String("addr", envOr("REGISTRY_ADDR", ":8080"), "address to listen on")
		dbPath    = flag.String("db", envOr("REGISTRY_DB", "registry.sqlite3"), "path to the SQLite database")
		publicURL = flag.String("public-url", envOr("REGISTRY_PUBLIC_URL", "https://registry.dukafi.dev"),
			"absolute URL stores use to download hosted archives")
		adminEmail     = flag.String("admin-email", os.Getenv("REGISTRY_ADMIN_EMAIL"), "the one account allowed to approve plugins; sign up with this address")
		adminToken     = flag.String("admin-token", os.Getenv("REGISTRY_ADMIN_TOKEN"), "bearer token reaching the same admin endpoints without a browser")
		allowedOrigins = flag.String("allowed-origins", envOr("REGISTRY_ALLOWED_ORIGINS", "https://dukafi.dev"),
			"comma-separated browser origins allowed to sign in against this registry")
		refreshEvery   = flag.Duration("refresh-every", envDuration("REGISTRY_REFRESH_EVERY", 6*time.Hour), "how often to re-read manifests")
		perHour        = flag.Int("submissions-per-hour", envInt("REGISTRY_SUBMISSIONS_PER_HOUR", defaultSubmissionsPerHour), "publishes, signups and logins allowed per source per hour (durable)")
		downloadsHour  = flag.Int("downloads-per-hour", envInt("REGISTRY_DOWNLOADS_PER_HOUR", defaultDownloadsPerHour), "archive downloads allowed per source address per hour (durable)")
		perMinute      = flag.Int("requests-per-minute", envInt("REGISTRY_REQUESTS_PER_MINUTE", defaultRequestsPerMinute), "requests allowed per source address per minute; 0 disables the in-memory limiter")
		burst          = flag.Int("burst", envInt("REGISTRY_BURST", defaultBurst), "requests one source may make back to back before the per-minute rate applies")
		maxLimiterKeys = flag.Int("rate-limit-keys", envInt("REGISTRY_RATE_LIMIT_KEYS", defaultRateLimitKeys), "how many source addresses the in-memory limiter will track at once")
		trustProxy     = flag.Bool("trust-proxy", os.Getenv("REGISTRY_TRUST_PROXY") == "1",
			"believe X-Forwarded-For — set ONLY when a proxy you control is in front, or rate limits become bypassable")
		allowInsecure = flag.Bool("insecure", os.Getenv("REGISTRY_INSECURE") == "1",
			"allow http and private addresses — DEVELOPMENT ONLY, it disables the SSRF guard")
		healthCheck = flag.Bool("health-check", false,
			"probe an already-running registry at -addr and exit 0 if healthy (used by the container HEALTHCHECK)")
	)
	flag.Parse()

	// Must come before the store is opened: the probe runs as a second process
	// inside the same container, and two writers on one SQLite file is exactly
	// the situation the single-writer model exists to avoid.
	if *healthCheck {
		os.Exit(probeHealth(*addr))
	}

	store, err := OpenStore(*dbPath)
	if err != nil {
		log.Fatalf("registry: opening %s: %v", *dbPath, err)
	}
	defer store.Close()

	if *allowInsecure {
		log.Print("registry: WARNING -insecure is on — http and private addresses are allowed")
	}
	if *adminEmail == "" && *adminToken == "" {
		// Not fatal: a read-only mirror is a legitimate way to run this. But
		// it must be obvious, because nothing can be approved without one.
		log.Print("registry: no admin email or token set — the admin endpoints are disabled")
	} else if *adminEmail != "" {
		// Said out loud at boot. Which address holds approval is the single
		// most consequential setting here, and a typo in it is otherwise
		// invisible until someone wonders why the queue will not open.
		log.Printf("registry: admin account is %s (sign up with that address to review)",
			NormalizeEmail(*adminEmail))
	}

	// A limiter is built unless explicitly disabled. Rate limiting that is off
	// by default is rate limiting that is off in production.
	var limiter *Limiter
	if *perMinute > 0 {
		limiter = NewLimiter(*perMinute, *burst, *maxLimiterKeys)
	} else {
		log.Print("registry: WARNING the per-request rate limiter is disabled")
	}

	// Said out loud, because the wrong setting is invisible until it matters:
	// trusting the header with nothing in front means no limit holds, and not
	// trusting it behind a proxy means everyone shares one budget.
	if *trustProxy {
		log.Print("registry: trusting X-Forwarded-For — make sure a proxy you control is in front")
	} else {
		log.Print("registry: rate limits keyed on the peer address (pass -trust-proxy if behind a proxy)")
	}

	blobs, blobWhere, err := openBlobStore(*dbPath)
	if err != nil {
		log.Fatalf("registry: archives: %v", err)
	}
	log.Printf("registry: plugin archives on %s", blobWhere)

	fetcher := NewHTTPFetcher(*allowInsecure)
	api := &API{
		Store:              store,
		Fetcher:            fetcher,
		Archives:           fetcher,
		Blobs:              blobs,
		PublicURL:          strings.TrimRight(*publicURL, "/"),
		AdminEmail:         *adminEmail,
		AdminToken:         *adminToken,
		AllowedOrigins:     strings.Split(*allowedOrigins, ","),
		AllowInsecure:      *allowInsecure,
		Limiter:            limiter,
		TrustProxy:         *trustProxy,
		SubmissionsPerHour: *perHour,
		DownloadsPerHour:   *downloadsHour,
	}

	server := &http.Server{
		Addr:    *addr,
		Handler: api.Handler(),
		// Headers stay tight. The body timeout is long enough for a 5 MB
		// archive upload; anything slower than that is a client holding the
		// connection open.
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go refreshLoop(ctx, api, *refreshEvery)

	go func() {
		log.Printf("registry: listening on %s (db %s)", *addr, *dbPath)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("registry: %v", err)
		}
	}()

	<-ctx.Done()
	log.Print("registry: shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}

// refreshLoop re-reads every live manifest on a schedule. This is what makes
// "updates" work without an author telling us anything: they ship 1.4.0 to
// their own host and the catalogue catches up on its own — including a new
// copy of the archive, when the checksum changed.
func refreshLoop(ctx context.Context, api *API, every time.Duration) {
	if every <= 0 {
		log.Print("registry: manifest refresh disabled")
		return
	}
	// Not on boot: a deploy loop would otherwise hammer every vendor's host
	// once per restart.
	ticker := time.NewTicker(every)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			refreshed, failed := api.RefreshAll(ctx)
			// Kept for a week: long enough to see a burst, short enough that
			// the table does not grow without bound.
			_ = api.Store.PruneSubmissionAttempts(7 * 24 * time.Hour)
			// Expired sessions are rejected on read regardless; this is only
			// so the table does not grow forever.
			_ = api.Store.PruneSessions()
			log.Printf("registry: refreshed %d manifests, %d failed", refreshed, failed)
		}
	}
}

// probeHealth GETs /healthz on an already-running instance and returns a
// process exit code. Written against `-addr` so it always probes the port this
// build was told to serve, rather than a second constant that could drift.
//
// A bare ":8080" is a listen address, not a dial address — Go's dialler wants
// a host, so loopback is filled in. Loopback deliberately: the probe runs
// inside the container, and a healthcheck that could reach the outside world
// would be reporting on the wrong thing.
func probeHealth(addr string) int {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		log.Printf("registry: health check: cannot parse address %q: %v", addr, err)
		return 1
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}

	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get("http://" + net.JoinHostPort(host, port) + "/healthz")
	if err != nil {
		log.Printf("registry: health check: %v", err)
		return 1
	}
	defer resp.Body.Close()
	// Drained so the connection can be reused rather than reset — costs
	// nothing here and keeps the server's logs quiet.
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Printf("registry: health check: /healthz returned %d", resp.StatusCode)
		return 1
	}
	return 0
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if value, err := strconv.Atoi(os.Getenv(key)); err == nil && value > 0 {
		return value
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if value, err := time.ParseDuration(os.Getenv(key)); err == nil {
		return value
	}
	return fallback
}
