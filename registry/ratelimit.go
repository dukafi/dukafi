package main

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Rate limiting, in two layers, because the two things being defended are not
// the same thing.
//
//	memory  — every request, keyed by source address. Defends the PROCESS
//	          against a flood. Has to be cheap, so it never touches disk, and
//	          it is allowed to forget everything on restart.
//	SQLite  — signup, login, publish, refresh. Defends against slow, patient
//	          abuse: a hundred accounts over an afternoon, or a password
//	          guessed a few tries an hour. These MUST survive a restart, or a
//	          restart is the bypass — see Store.RecentSubmissions.
//
// The read endpoints get only the first layer. A catalogue GET is meant to
// cost nothing, and recording one row per read into a single-writer SQLite
// would make every browse queue behind a write — the rate limiter would become
// the bottleneck it exists to prevent.

// Token bucket. Chosen over a fixed window because a fixed window lets a
// client spend its whole budget in the last instant of one window and again in
// the first instant of the next — a 2x burst exactly at the boundary. A bucket
// refills continuously, so the average is the average.
type bucket struct {
	tokens float64
	seen   time.Time
}

type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket

	rate  float64 // tokens per second
	burst float64 // most that can accumulate, i.e. the largest allowed spike

	// A ceiling on tracked keys. Without one, the limiter is itself the denial
	// of service: a caller rotating source addresses grows this map until the
	// process dies.
	maxKeys int

	lastSweep time.Time

	// Injectable so the tests can advance time instead of sleeping through it.
	now func() time.Time
}

// NewLimiter builds a limiter allowing `perMinute` sustained, with `burst`
// available at once.
func NewLimiter(perMinute, burst, maxKeys int) *Limiter {
	if perMinute <= 0 {
		perMinute = 1
	}
	if burst <= 0 {
		burst = perMinute
	}
	if maxKeys <= 0 {
		maxKeys = 50_000
	}
	return &Limiter{
		buckets: map[string]*bucket{},
		rate:    float64(perMinute) / 60,
		burst:   float64(burst),
		maxKeys: maxKeys,
		now:     time.Now,
	}
}

// Allow spends one token for `key`. The second return is how long to wait when
// it says no, for Retry-After.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.sweepLocked(now)

	entry, known := l.buckets[key]
	if !known {
		// At the ceiling, refuse rather than grow. This is fail-CLOSED, and it
		// does mean a flood from many addresses can lock out callers we have
		// not seen recently — but the alternative is running out of memory,
		// which locks out everyone permanently. The sweep above makes hitting
		// this genuinely hard: a bucket that has refilled is deleted.
		if len(l.buckets) >= l.maxKeys {
			return false, time.Minute
		}
		entry = &bucket{tokens: l.burst, seen: now}
		l.buckets[key] = entry
	}

	// Lazy refill: no timers, no goroutine per key. Elapsed time since the
	// last look is worth exactly that many tokens.
	elapsed := now.Sub(entry.seen).Seconds()
	if elapsed > 0 {
		entry.tokens = minFloat(l.burst, entry.tokens+elapsed*l.rate)
	}
	entry.seen = now

	if entry.tokens < 1 {
		// How long until one whole token exists.
		wait := time.Duration((1 - entry.tokens) / l.rate * float64(time.Second))
		return false, maxDuration(wait, time.Second)
	}
	entry.tokens--
	return true, 0
}

// Remaining is the whole tokens left for a key, for the RateLimit headers.
func (l *Limiter) Remaining(key string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, known := l.buckets[key]
	if !known {
		return int(l.burst)
	}
	tokens := minFloat(l.burst, entry.tokens+l.now().Sub(entry.seen).Seconds()*l.rate)
	if tokens < 0 {
		return 0
	}
	return int(tokens)
}

// sweepLocked drops buckets that have refilled to full.
//
// A full bucket is indistinguishable from one that never existed — a caller
// arriving with no entry is given a full one — so deleting it changes no
// decision and is the reason this map stays small. Rate-limited callers keep
// their (nearly empty) buckets, which is exactly backwards from an LRU and
// exactly right here: the abusive keys are the ones worth remembering.
func (l *Limiter) sweepLocked(now time.Time) {
	const sweepEvery = time.Minute
	if now.Sub(l.lastSweep) < sweepEvery && len(l.buckets) < l.maxKeys {
		return
	}
	l.lastSweep = now

	// Seconds of idleness that refill an empty bucket completely.
	refill := time.Duration(l.burst / l.rate * float64(time.Second))
	for key, entry := range l.buckets {
		if now.Sub(entry.seen) >= refill {
			delete(l.buckets, key)
		}
	}
}

func (l *Limiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func maxDuration(a, b time.Duration) time.Duration {
	if a > b {
		return a
	}
	return b
}

// ── Middleware ───────────────────────────────────────────────────────────────

// rateLimit applies the memory layer to every request except the healthcheck.
//
// The healthcheck is exempt on purpose: it is the container probing itself on a
// fixed schedule, and a 429 there would have an orchestrator kill a container
// that is working perfectly.
func (a *API) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.Limiter == nil || r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		// Preflight carries no credentials and does no work; counting it would
		// mean every real request costs two tokens.
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		key := clientIP(r, a.TrustProxy)
		allowed, retryAfter := a.Limiter.Allow(key)

		w.Header().Set("RateLimit-Limit", strconv.Itoa(int(a.Limiter.burst)))
		w.Header().Set("RateLimit-Remaining", strconv.Itoa(a.Limiter.Remaining(key)))

		if !allowed {
			seconds := int(retryAfter.Seconds() + 0.999)
			w.Header().Set("Retry-After", strconv.Itoa(seconds))
			w.Header().Set("RateLimit-Reset", strconv.Itoa(seconds))
			writeError(w, http.StatusTooManyRequests, "rate_limited",
				"too many requests — slow down and try again shortly")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── The rate-limit key ───────────────────────────────────────────────────────

// clientIP is the address a limit is counted against.
//
// `X-Forwarded-For` is consulted ONLY when this registry is knowingly behind a
// proxy. The header is client-supplied: with nothing in front of us, anyone can
// send `X-Forwarded-For: 1.2.3.4`, get a brand-new bucket for every request,
// and walk straight through every limit here. Trusting it unconditionally —
// which this did — made the whole rate limiter decorative.
//
// When trusted, the LAST entry is used, because that is the one the immediate
// proxy appended. Everything before it is whatever the client claimed.
//
// The cost of the safe default is real and worth stating: a deployment behind
// a proxy with -trust-proxy unset counts every visitor against the proxy's
// single address, and the whole service shares one budget. That fails closed
// (over-limiting) rather than open, and the boot log says which mode is on.
func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			if candidate := strings.TrimSpace(parts[len(parts)-1]); candidate != "" {
				return candidate
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
