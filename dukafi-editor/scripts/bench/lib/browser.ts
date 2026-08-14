/**
 * Browser automation helpers — Playwright-based.
 *
 * Why Playwright (vs Puppeteer): auto-waiting, reproducible Chromium pin,
 * built-in tracing (`page.context().tracing.start/stop`), HAR capture,
 * and a much better selector engine for scripted interactions.
 *
 * Chromium provisioning: `playwright-core` does NOT auto-download a
 * browser. The bench either:
 *   1. Uses a pre-installed Playwright Chromium (cached at
 *      `~/Library/Caches/ms-playwright` on macOS,
 *      `~/.cache/ms-playwright` on Linux). Install with
 *      `bunx playwright install chromium` (run once).
 *   2. Falls back to a system Chrome/Edge/Brave via `--chrome-path=`.
 *   3. Self-skips with a clear "run `bunx playwright install chromium`"
 *      message if neither is available.
 *
 * Authentication uses the JSON login endpoint (`POST /admin/api/cms/login`)
 * — much faster + more deterministic than scripting the login form,
 * and our scenarios actually need a session cookie, not a UI dance.
 */
import { existsSync } from 'node:fs'

// Playwright types — imported only for type checking. Runtime uses dynamic
// import so the rest of the bench suite keeps working if playwright-core
// isn't installed.
type Browser = import('playwright-core').Browser
type BrowserContext = import('playwright-core').BrowserContext
type Page = import('playwright-core').Page
type CDPSession = import('playwright-core').CDPSession

const COMMON_CHROME_PATHS_DARWIN = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Arc.app/Contents/MacOS/Arc',
]
const COMMON_CHROME_PATHS_LINUX = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
]
const COMMON_CHROME_PATHS_WINDOWS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

export function findSystemChrome(override?: string): string | null {
  if (override && existsSync(override)) return override
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  const candidates =
    process.platform === 'darwin' ? COMMON_CHROME_PATHS_DARWIN :
    process.platform === 'win32' ? COMMON_CHROME_PATHS_WINDOWS :
    COMMON_CHROME_PATHS_LINUX
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

export interface BrowserSession {
  browser: Browser
  context: BrowserContext
  page: Page
  /** Underlying CDP session — for fine-grained tracing / profiling. */
  cdp: CDPSession
  close(): Promise<void>
}

interface LaunchOptions {
  /** Optional: force a specific Chrome/Chromium binary. */
  executablePath?: string
  headless?: boolean
  viewport?: { width: number; height: number }
  /** Slow down each interaction (debugging only). */
  slowMo?: number
}

export async function launchBrowser(opts: LaunchOptions = {}): Promise<BrowserSession> {
  // Dynamic import keeps the rest of the bench suite working when
  // playwright-core is uninstalled (it's optional).
  const { chromium } = await import('playwright-core')

  let browser: Browser
  try {
    browser = await chromium.launch({
      executablePath: opts.executablePath,
      headless: opts.headless ?? true,
      slowMo: opts.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-extensions-with-background-pages',
        // Disable back-forward cache so every page.goto produces a real
        // document load with fresh FCP / LCP entries. Otherwise repeat
        // navigations to recently-visited pages skip paint observers.
        '--disable-back-forward-cache',
        '--disable-features=BackForwardCache',
      ],
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('Executable doesn\'t exist') || msg.includes('looks like Playwright')) {
      throw new Error(
        'Playwright Chromium not found. Run `bunx playwright install chromium` once (or pass --chrome-path=PATH for a system browser).',
        { cause: err },
      )
    }
    throw err
  }

  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
  })
  const page = await context.newPage()

  page.on('pageerror', (err) => {
    console.error('[browser] page error:', err.message)
  })

  const cdp = await context.newCDPSession(page)

  return {
    browser,
    context,
    page,
    cdp,
    async close() {
      try {
        await cdp.detach().catch(() => {})
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
      } catch {
        // best effort
      }
    },
  }
}

/**
 * Authenticate by hitting the JSON login endpoint directly. Sets the
 * session cookie on the page so subsequent navigations are authenticated.
 */
export async function loginAdmin(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
): Promise<void> {
  // Need to be on a same-origin page first so the cookie is settable.
  if (!page.url().startsWith(baseUrl)) {
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' })
  }
  const res = await page.evaluate(
    async (args: { baseUrl: string; email: string; password: string }) => {
      const r = await fetch(`${args.baseUrl}/admin/api/cms/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: args.email, password: args.password }),
      })
      return { ok: r.ok, status: r.status, body: await r.text() }
    },
    { baseUrl, email, password },
  )
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status}: ${res.body.slice(0, 200)}`)
}

export interface PageLoadMetrics {
  totalMs: number
  fcpMs: number | null
  lcpMs: number | null
  domContentLoadedMs: number | null
  loadMs: number | null
  longTasks: Array<{ duration: number; startTime: number }>
  totalBlockingMs: number
  transferredBytes: number
  /** Number of DOM nodes after load — proxy for "did the editor explode?". */
  domNodeCount: number
}

/**
 * Inject the PerformanceObserver harness BEFORE any navigation. Adds a
 * window.__benchMetrics accumulator that captures FCP, LCP, longtasks.
 *
 * Must be called once per page, before the first goto.
 */
export async function installMetricsHarness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __benchMetrics: {
        fcp: number | null
        lcp: number | null
        longTasks: Array<{ duration: number; startTime: number }>
      }
    }
    if (w.__benchMetrics) return
    w.__benchMetrics = { fcp: null, lcp: null, longTasks: [] }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') w.__benchMetrics.fcp = entry.startTime
        }
      }).observe({ type: 'paint', buffered: true })
    } catch {
      // ignore
    }
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (last) w.__benchMetrics.lcp = last.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      // ignore
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__benchMetrics.longTasks.push({ duration: entry.duration, startTime: entry.startTime })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // ignore
    }
  })
}

/**
 * Reset the in-page metrics accumulator. Use between scenarios so each
 * scenario starts fresh.
 */
export async function resetMetricsHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __benchMetrics?: {
        fcp: number | null
        lcp: number | null
        longTasks: Array<{ duration: number; startTime: number }>
      }
    }
    if (w.__benchMetrics) {
      w.__benchMetrics.longTasks = []
      // Keep fcp/lcp — those fire once per page load.
    }
  })
}

/**
 * Navigate to `url` and capture page-load metrics.
 *
 * Uses `waitUntil: 'networkidle'` as the "fully loaded" signal. The
 * metrics harness must have been installed first via `installMetricsHarness`.
 */
export async function loadPageWithMetrics(page: Page, url: string): Promise<PageLoadMetrics> {
  const t0 = performance.now()
  // `load` (not `networkidle`) because the admin app maintains long-lived
  // connections (telemetry, agent streaming) that prevent `networkidle`
  // from ever firing.
  await page.goto(url, { waitUntil: 'load', timeout: 15_000 })

  // The admin shell ships with an initial-loader spinner inside #root that
  // React replaces once the app mounts. Waiting for it to disappear is the
  // most reliable "React rendered the first frame" signal — much more
  // accurate than a fixed timeout.
  await page
    .locator('[data-initial-loader-spinner]')
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => {
      // Not on the admin shell (e.g. a published public page) — that's
      // fine, we'll just measure whatever did render.
    })

  // Drain microtasks so the PerformanceObserver callbacks for FCP/LCP fire
  // before we sample. `buffered: true` queues existing entries, but the
  // observer callback is async — a single tick of waitForTimeout(0) isn't
  // enough on a slow CI host, so use 500ms which is also a typical LCP
  // settling window in Lighthouse.
  await page.waitForTimeout(500)
  const totalMs = performance.now() - t0

  const metrics = await page.evaluate(() => {
    const w = window as unknown as {
      __benchMetrics?: {
        fcp: number | null
        lcp: number | null
        longTasks: Array<{ duration: number; startTime: number }>
      }
    }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const transferredBytes = resourceEntries.reduce((sum, r) => sum + (r.transferSize ?? 0), 0)
    const domNodeCount = document.querySelectorAll('*').length
    // Fall back to a direct read of the paint timeline. With very-fast cold
    // loads the PerformanceObserver may race against the FCP entry (the
    // entry can land before the observer's task fires its first callback);
    // `getEntriesByType('paint')` is the synchronous, authoritative source.
    const paintEntries = performance.getEntriesByType('paint') as PerformanceEntry[]
    const fcpEntry = paintEntries.find((p) => p.name === 'first-contentful-paint')
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[]
    const lastLcp = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1] : undefined
    return {
      fcp: w.__benchMetrics?.fcp ?? fcpEntry?.startTime ?? null,
      lcp: w.__benchMetrics?.lcp ?? lastLcp?.startTime ?? null,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
      load: nav ? nav.loadEventEnd - nav.startTime : null,
      longTasks: w.__benchMetrics?.longTasks ?? [],
      transferredBytes,
      domNodeCount,
    }
  })

  const totalBlockingMs = metrics.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)

  return {
    totalMs,
    fcpMs: metrics.fcp,
    lcpMs: metrics.lcp,
    domContentLoadedMs: metrics.domContentLoaded,
    loadMs: metrics.load,
    longTasks: metrics.longTasks,
    totalBlockingMs,
    transferredBytes: metrics.transferredBytes,
    domNodeCount: metrics.domNodeCount,
  }
}

export interface FrameStability {
  frames: number
  droppedFrames: number
  worstFrameMs: number
  meanFrameMs: number
  meanFps: number
}

/**
 * Run `action()` and measure every animation frame while it runs.
 *
 * Important: this only measures frames on the CURRENT document. If
 * `action` causes a navigation (page.goto), the in-page accumulator is
 * wiped — the result will only reflect frames before the navigation.
 * For navigation-heavy scenarios use direct timing instead.
 */
export async function measureFramesDuring(
  page: Page,
  action: () => Promise<void> | void,
  options: { minDurationMs?: number; budgetMs?: number } = {},
): Promise<FrameStability> {
  const minDurationMs = options.minDurationMs ?? 0
  const budgetMs = options.budgetMs ?? 16.67

  // Start the frame-time accumulator inside the page.
  await page.evaluate(() => {
    const w = window as unknown as {
      __benchFrames?: { times: number[]; running: boolean; last: number }
    }
    w.__benchFrames = { times: [], running: true, last: performance.now() }
    function tick(now: number): void {
      const accum = w.__benchFrames
      if (!accum || !accum.running) return
      const dt = now - accum.last
      accum.times.push(dt)
      accum.last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const actionStart = performance.now()
  await action()
  const actionMs = performance.now() - actionStart
  const tailMs = Math.max(50, minDurationMs - actionMs)
  await page.waitForTimeout(tailMs)

  const result = await page.evaluate((budget: number) => {
    const w = window as unknown as {
      __benchFrames?: { times: number[]; running: boolean }
    }
    if (!w.__benchFrames) {
      return { frames: 0, droppedFrames: 0, worstFrameMs: 0, meanFrameMs: 0 }
    }
    w.__benchFrames.running = false
    const t = w.__benchFrames.times
    const dropped = t.filter((dt) => dt > budget).length
    const worst = t.reduce((m, v) => (v > m ? v : m), 0)
    const mean = t.length ? t.reduce((s, v) => s + v, 0) / t.length : 0
    return { frames: t.length, droppedFrames: dropped, worstFrameMs: worst, meanFrameMs: mean }
  }, budgetMs)

  return {
    ...result,
    meanFps: result.meanFrameMs > 0 ? 1000 / result.meanFrameMs : 0,
  }
}

/** Read JS heap. Returns null on browsers that don't expose `performance.memory`. */
export async function readHeapBytes(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number } }
    return perf.memory?.usedJSHeapSize ?? null
  })
}

/** Number of DOM nodes — proxy for "did the editor add a lot of markup?". */
export async function readDomNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('*').length)
}

/**
 * Start a Playwright trace covering the next slice of work. Returns a
 * disposer that stops + saves the trace to disk. Open in the Playwright
 * Trace Viewer with `bunx playwright show-trace <file>`.
 */
export async function startTrace(
  context: BrowserContext,
  outputFile: string,
  title: string,
): Promise<() => Promise<void>> {
  await context.tracing.start({
    title,
    screenshots: true,
    snapshots: true,
    sources: false,
  })
  return async () => {
    await context.tracing.stop({ path: outputFile })
  }
}

/**
 * Start CDP-level CPU profiling. Returns a disposer that stops + writes
 * a `.cpuprofile` to disk (open in Chrome DevTools → Performance →
 * "Load profile").
 */
export async function startCpuProfile(
  cdp: CDPSession,
  outputFile: string,
): Promise<() => Promise<void>> {
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.start')
  return async () => {
    const { profile } = await cdp.send('Profiler.stop')
    await Bun.write(outputFile, JSON.stringify(profile))
    await cdp.send('Profiler.disable').catch(() => {})
  }
}
