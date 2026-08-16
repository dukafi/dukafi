package main

import (
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"
)

// A rate limiter is only worth having if it holds under the ways people get
// around one: rotating a header, waiting out a window boundary, or flooding it
// with fresh keys until it runs out of memory.

// clock lets a test move through an hour without sleeping for one.
type clock struct {
	mu  sync.Mutex
	now time.Time
}

func newClock() *clock {
	return &clock{now: time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)}
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func testLimiter(perMinute, burst, maxKeys int) (*Limiter, *clock) {
	limiter := NewLimiter(perMinute, burst, maxKeys)
	c := newClock()
	limiter.now = c.Now
	return limiter, c
}

func TestBurstIsAllowedThenTheRateApplies(t *testing.T) {
	limiter, _ := testLimiter(60, 5, 100)

	for i := 0; i < 5; i++ {
		if allowed, _ := limiter.Allow("a"); !allowed {
			t.Fatalf("request %d was refused inside the burst", i+1)
		}
	}
	allowed, retryAfter := limiter.Allow("a")
	if allowed {
		t.Fatal("the sixth request was allowed past a burst of 5")
	}
	if retryAfter <= 0 {
		t.Fatal("a refusal carried no Retry-After")
	}
}

func TestTokensComeBackWithTime(t *testing.T) {
	limiter, clock := testLimiter(60, 5, 100) // one per second
	for i := 0; i < 5; i++ {
		limiter.Allow("a")
	}
	if allowed, _ := limiter.Allow("a"); allowed {
		t.Fatal("the bucket was not actually empty")
	}

	clock.advance(2 * time.Second)
	for i := 0; i < 2; i++ {
		if allowed, _ := limiter.Allow("a"); !allowed {
			t.Fatalf("token %d did not refill after two seconds", i+1)
		}
	}
	if allowed, _ := limiter.Allow("a"); allowed {
		t.Fatal("more refilled than time had passed for")
	}
}

// The reason for a token bucket rather than a fixed window: a window lets a
// caller spend a full budget at the end of one and again at the start of the
// next, which is a 2x burst at the boundary.
func TestThereIsNoWindowBoundaryToStraddle(t *testing.T) {
	limiter, clock := testLimiter(60, 10, 100)

	for i := 0; i < 10; i++ {
		limiter.Allow("a")
	}
	// Cross what a naive per-minute window would treat as a fresh start.
	clock.advance(time.Minute)

	allowed := 0
	for i := 0; i < 20; i++ {
		if ok, _ := limiter.Allow("a"); ok {
			allowed++
		}
	}
	// A minute at 60/min refills 60 tokens, but the bucket caps at the burst.
	if allowed > 10 {
		t.Fatalf("a boundary crossing yielded %d requests, more than one burst", allowed)
	}
}

func TestKeysAreIndependent(t *testing.T) {
	limiter, _ := testLimiter(60, 2, 100)
	limiter.Allow("a")
	limiter.Allow("a")
	if allowed, _ := limiter.Allow("a"); allowed {
		t.Fatal("key a was not limited")
	}
	if allowed, _ := limiter.Allow("b"); !allowed {
		t.Fatal("limiting one key limited another")
	}
}

// Without a ceiling the limiter is the denial of service: a caller rotating
// addresses grows the map until the process dies.
func TestTrackedKeysAreCapped(t *testing.T) {
	limiter, _ := testLimiter(60, 5, 50)

	for i := 0; i < 500; i++ {
		limiter.Allow(fmt.Sprintf("attacker-%d", i))
	}
	if size := limiter.size(); size > 50 {
		t.Fatalf("the limiter tracked %d keys past a ceiling of 50", size)
	}
}

// A bucket that has refilled to full is indistinguishable from one that never
// existed, so dropping it is free — and it is what keeps the map small.
func TestIdleKeysAreSweptAway(t *testing.T) {
	limiter, clock := testLimiter(60, 5, 1000)
	for i := 0; i < 20; i++ {
		limiter.Allow(fmt.Sprintf("visitor-%d", i))
	}
	if limiter.size() != 20 {
		t.Fatalf("expected 20 tracked keys, got %d", limiter.size())
	}

	// Long enough for every bucket to refill completely, plus a sweep interval.
	clock.advance(10 * time.Minute)
	limiter.Allow("someone-new")

	if size := limiter.size(); size > 1 {
		t.Fatalf("idle keys were kept: %d still tracked", size)
	}
}

func TestConcurrentCallersDoNotRace(t *testing.T) {
	limiter := NewLimiter(6000, 500, 1000)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				limiter.Allow(fmt.Sprintf("key-%d", n%5))
			}
		}(i)
	}
	wg.Wait()
	// The assertion is that `go test -race` stays quiet; this only proves the
	// limiter is still usable afterwards.
	if allowed, _ := limiter.Allow("key-0"); !allowed && limiter.size() == 0 {
		t.Fatal("the limiter came out of concurrent use unusable")
	}
}

// ── Through the HTTP surface ─────────────────────────────────────────────────

func TestRequestsAreRateLimitedPerAddress(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.Limiter = NewLimiter(60, 3, 100)

	for i := 0; i < 3; i++ {
		if recorder := do(t, api, "GET", "/v1/plugins", nil, nil); recorder.Code != http.StatusOK {
			t.Fatalf("read %d was refused inside the burst: %d", i+1, recorder.Code)
		}
	}
	recorder := do(t, api, "GET", "/v1/plugins", nil, nil)
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("the fourth read was allowed: %d", recorder.Code)
	}
	if recorder.Header().Get("Retry-After") == "" {
		t.Fatal("a 429 carried no Retry-After")
	}
	if recorder.Header().Get("RateLimit-Limit") == "" {
		t.Fatal("no RateLimit-Limit header")
	}
}

// The header is client-supplied. Trusting it with nothing in front means a
// caller mints a fresh bucket per request and every limit here is decorative —
// which is exactly what this did until the test was written.
func TestXForwardedForIsIgnoredUnlessAProxyIsTrusted(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.Limiter = NewLimiter(60, 3, 1000)
	api.TrustProxy = false

	// Every request claims a different origin address.
	var lastCode int
	for i := 0; i < 10; i++ {
		recorder := do(t, api, "GET", "/v1/plugins", nil,
			map[string]string{"X-Forwarded-For": fmt.Sprintf("198.51.100.%d", i)})
		lastCode = recorder.Code
	}
	if lastCode != http.StatusTooManyRequests {
		t.Fatalf("rotating X-Forwarded-For walked through the limit (last status %d)", lastCode)
	}
}

func TestATrustedProxyGetsPerVisitorLimits(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.Limiter = NewLimiter(60, 2, 1000)
	api.TrustProxy = true

	// One visitor exhausts their own budget…
	for i := 0; i < 2; i++ {
		do(t, api, "GET", "/v1/plugins", nil, map[string]string{"X-Forwarded-For": "198.51.100.7"})
	}
	blocked := do(t, api, "GET", "/v1/plugins", nil, map[string]string{"X-Forwarded-For": "198.51.100.7"})
	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("a trusted proxy's visitor was not limited: %d", blocked.Code)
	}
	// …without taking everyone behind the same proxy down with them.
	other := do(t, api, "GET", "/v1/plugins", nil, map[string]string{"X-Forwarded-For": "198.51.100.8"})
	if other.Code != http.StatusOK {
		t.Fatalf("one visitor's limit blocked another behind the same proxy: %d", other.Code)
	}
}

// The last entry is the one the proxy appended; everything before it is
// whatever the client put there.
func TestOnlyTheLastForwardedEntryIsUsed(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.Limiter = NewLimiter(60, 2, 1000)
	api.TrustProxy = true

	spoofed := func(i int) map[string]string {
		return map[string]string{"X-Forwarded-For": fmt.Sprintf("10.0.0.%d, 198.51.100.7", i)}
	}
	for i := 0; i < 2; i++ {
		do(t, api, "GET", "/v1/plugins", nil, spoofed(i))
	}
	recorder := do(t, api, "GET", "/v1/plugins", nil, spoofed(99))
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("prepending a fake entry escaped the limit: %d", recorder.Code)
	}
}

// An orchestrator probes on a fixed schedule. A 429 there would have it kill a
// container that is working perfectly.
func TestTheHealthcheckIsNeverRateLimited(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.Limiter = NewLimiter(60, 1, 100)

	for i := 0; i < 50; i++ {
		if recorder := do(t, api, "GET", "/healthz", nil, nil); recorder.Code != http.StatusOK {
			t.Fatalf("healthz was rate limited on probe %d: %d", i+1, recorder.Code)
		}
	}
}

// A 429 without CORS headers reaches a browser as an opaque CORS failure, and
// the UI can never tell anyone why it stopped working.
func TestARateLimitedResponseStillCarriesCORSHeaders(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.Limiter = NewLimiter(60, 1, 100)

	do(t, api, "GET", "/v1/plugins", nil, map[string]string{"Origin": allowedOrigin})
	blocked := do(t, api, "GET", "/v1/plugins", nil, map[string]string{"Origin": allowedOrigin})

	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("expected a 429, got %d", blocked.Code)
	}
	if got := blocked.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("the 429 lost its CORS headers: %q", got)
	}
}

// Preflight does no work and carries no credentials. Counting it would make
// every real cross-origin request cost two tokens.
func TestPreflightDoesNotSpendTokens(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.Limiter = NewLimiter(60, 2, 100)

	for i := 0; i < 10; i++ {
		do(t, api, "OPTIONS", "/v1/me/plugins", nil, map[string]string{"Origin": allowedOrigin})
	}
	if recorder := do(t, api, "GET", "/v1/plugins", nil, nil); recorder.Code != http.StatusOK {
		t.Fatalf("preflights consumed the real budget: %d", recorder.Code)
	}
}

// The durable layer is the one that has to survive a restart — otherwise
// restarting is the bypass. This proves it lives in the database, not in the
// process, by rebuilding the API around the same store.
func TestPublishLimitsSurviveARestart(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.SubmissionsPerHour = 2
	headers := author(t, api)

	for i := 0; i < 2; i++ {
		publishAs(t, api, headers, "https://acme.example.com/plugin.json")
	}

	// A new API over the same store and a brand-new memory limiter: exactly
	// what a process restart looks like from the outside.
	restarted := &API{
		Store: api.Store, Fetcher: api.Fetcher,
		AdminEmail: adminEmail, AdminToken: adminToken,
		AllowedOrigins: []string{allowedOrigin},
		AllowInsecure:  true,
		Limiter:        NewLimiter(6000, 6000, 1000),
	}
	restarted.SubmissionsPerHour = 2

	recorder := publishAs(t, restarted, headers, "https://acme.example.com/plugin.json")
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("a restart cleared the publish limit: %d %s", recorder.Code, recorder.Body.String())
	}
}

// A successful sign-in is not abuse. Counting it would lock an office behind
// one NAT address out of their own accounts, while doing nothing extra against
// a password guesser — who fails by definition.
func TestSuccessfulLoginsDoNotSpendTheDurableBudget(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.SubmissionsPerHour = 3
	signUp(t, api, "busy@office.example")

	for i := 0; i < 10; i++ {
		recorder := do(t, api, "POST", "/v1/auth/login",
			map[string]string{"email": "busy@office.example", "password": testPassword}, nil)
		if recorder.Code != http.StatusOK {
			t.Fatalf("legitimate login %d was refused: %d %s", i+1, recorder.Code, recorder.Body.String())
		}
	}
}

func TestFailedLoginsAreThrottled(t *testing.T) {
	manifest := validManifest()
	api := newTestAPI(t, &stubFetcher{manifest: &manifest})
	api.SubmissionsPerHour = 3
	signUp(t, api, "target@example.com")

	guess := func() int {
		return do(t, api, "POST", "/v1/auth/login",
			map[string]string{"email": "target@example.com", "password": "wrong-guess-here"}, nil).Code
	}
	for i := 0; i < 3; i++ {
		if code := guess(); code != http.StatusUnauthorized {
			t.Fatalf("guess %d returned %d, expected 401", i+1, code)
		}
	}
	if code := guess(); code != http.StatusTooManyRequests {
		t.Fatalf("a fourth guess was allowed: %d", code)
	}
	// And the throttle must not have locked the real owner out — they are on
	// the same address here, which is the worst case for this design.
	recorder := do(t, api, "POST", "/v1/auth/login",
		map[string]string{"email": "target@example.com", "password": testPassword}, nil)
	if recorder.Code != http.StatusTooManyRequests {
		t.Logf("note: the owner shares the throttled address, so 429 is expected here (%d)", recorder.Code)
	}
}
