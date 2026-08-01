/**
 * Browser benchmark — real Chromium via Playwright.
 *
 * Boots a production server + drives a real Chromium browser, runs a
 * battery of cold-load and interactive scenarios, and captures frame /
 * paint / heap metrics for each.
 *
 * Scenarios (in order):
 *   1. Cold-load metrics for /admin (login), authenticated /admin, /admin/site
 *   2. Admin-route navigation cycle (dashboard ↔ content ↔ data ↔ site)
 *   3. Idle frame stability on /admin/site
 *   4. Spotlight (Cmd+K) open/close storm — latency to "visible" + frame drops
 *   5. Selectors panel open/close storm — sidebar toggle latency
 *   6. Class creation via UI — open dialog, submit, repeat. Real UI stress.
 *   7. Heap / DOM-node growth after each scenario
 *
 * Outputs additional artifacts to `.tmp/benchmarks/`:
 *   - `browser-<scenario>.trace.zip`  — Playwright trace (only when --trace=ALL or --trace=NAME)
 *     Open with: `bunx playwright show-trace <path>`
 *
 * Skips with a clear message if:
 *   - playwright-core isn't installed
 *   - Playwright's Chromium isn't downloaded AND no system Chrome is found
 */
import { resolve, join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import type { BenchModule, BenchResult, BenchRow, BenchContext } from '../lib/types'
import { fmtMs, fmtBytes, fmtNum } from '../lib/stats'
import { log } from '../lib/log'
import { startServer, type ServerHandle } from '../lib/server'
import {
  findSystemChrome,
  launchBrowser,
  loginAdmin,
  loadPageWithMetrics,
  measureFramesDuring,
  installMetricsHarness,
  resetMetricsHarness,
  readHeapBytes,
  readDomNodeCount,
  startTrace,
  type BrowserSession,
  type PageLoadMetrics,
  type FrameStability,
} from '../lib/browser'

const REPO_ROOT = resolve(import.meta.dir, '../../..')

const ADMIN_EMAIL_ENV = 'INSTATIC_BENCH_ADMIN_EMAIL'
const ADMIN_PASSWORD_ENV = 'INSTATIC_BENCH_ADMIN_PASSWORD'

// CLI flag plumbing (read directly from process.argv to keep the bench
// module self-contained; the orchestrator just accepts unknown flags).
function readArg(name: string): string | undefined {
  for (const arg of process.argv) {
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3)
  }
  return undefined
}

function readSet(name: string): Set<string> {
  const raw = readArg(name)
  return new Set(raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [])
}

function readBenchCredentials(): { email: string; password: string } | null {
  const email = process.env[ADMIN_EMAIL_ENV]?.trim()
  const password = process.env[ADMIN_PASSWORD_ENV]?.trim()
  if (!email || !password) return null
  return { email, password }
}

interface LoadScenario {
  label: string
  url: string
  metrics: PageLoadMetrics
  heapBytes: number | null
}

async function runLoadScenario(
  session: BrowserSession,
  baseUrl: string,
  label: string,
  path: string,
): Promise<LoadScenario> {
  await resetMetricsHarness(session.page)
  const url = `${baseUrl}${path}`
  log.step(`  load: ${path}`)
  const metrics = await loadPageWithMetrics(session.page, url)
  const heapBytes = await readHeapBytes(session.page)
  return { label, url, metrics, heapBytes }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive scenarios — each returns frame stats + scenario timing
// ─────────────────────────────────────────────────────────────────────────────

async function scenarioSpotlightChurn(
  session: BrowserSession,
  iterations: number,
): Promise<{ frame: FrameStability; meanOpenMs: number; meanCloseMs: number }> {
  // Cmd+K (mac) / Ctrl+K (linux/win) opens spotlight. We toggle it N times,
  // measure latency to "spotlight node mounted" each open + close.
  const isMac = process.platform === 'darwin'
  const openKey = isMac ? 'Meta+K' : 'Control+K'

  const openTimes: number[] = []
  const closeTimes: number[] = []

  const action = async () => {
    for (let i = 0; i < iterations; i++) {
      const tOpen = performance.now()
      await session.page.keyboard.press(openKey)
      // Wait for the spotlight DOM root (the modal). The Spotlight component
      // mounts a portal — we wait for ANY element with role='dialog' that
      // contains the spotlight input.
      await session.page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 2000 }).catch(() => {})
      openTimes.push(performance.now() - tOpen)

      const tClose = performance.now()
      await session.page.keyboard.press('Escape')
      await session.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 2000 }).catch(() => {})
      closeTimes.push(performance.now() - tClose)
    }
  }

  const frame = await measureFramesDuring(session.page, action)
  const meanOpenMs = openTimes.reduce((s, v) => s + v, 0) / Math.max(1, openTimes.length)
  const meanCloseMs = closeTimes.reduce((s, v) => s + v, 0) / Math.max(1, closeTimes.length)
  return { frame, meanOpenMs, meanCloseMs }
}

async function scenarioAdminRouteCycle(
  session: BrowserSession,
  baseUrl: string,
  iterations: number,
): Promise<{ totalMs: number; perRouteMs: Array<{ route: string; mean: number; samples: number }> }> {
  // Frame stability isn't measured across navigations — each goto wipes the
  // in-page accumulator. Instead we measure per-route transition latency,
  // which is what the user-facing question actually is.
  const routes = ['/admin/dashboard', '/admin/content', '/admin/data', '/admin/site']
  const perRoute: Record<string, number[]> = {}
  for (const r of routes) perRoute[r] = []

  const totalStart = performance.now()
  for (let i = 0; i < iterations; i++) {
    const route = routes[i % routes.length]
    const t0 = performance.now()
    await session.page.goto(`${baseUrl}${route}`, { waitUntil: 'load', timeout: 8_000 }).catch(() => {})
    perRoute[route].push(performance.now() - t0)
  }
  const totalMs = performance.now() - totalStart

  const perRouteMs = Object.entries(perRoute).map(([route, samples]) => ({
    route,
    mean: samples.length ? samples.reduce((s, v) => s + v, 0) / samples.length : 0,
    samples: samples.length,
  }))
  return { totalMs, perRouteMs }
}

async function scenarioSelectorsPanelToggle(
  session: BrowserSession,
  iterations: number,
): Promise<{ frame: FrameStability; meanCycleMs: number }> {
  // Look for an element that toggles the Selectors panel. We use the
  // PanelRail button — the rail surfaces every panel as a tab.
  // The Selectors panel has testId="selectors-panel"; we use the URL hash
  // approach by directly setting the store via keyboard shortcut if defined.
  //
  // Fallback: look for a button with aria-label containing "Selectors" /
  // "selectors panel" or use the panel-rail tab.
  const button = session.page.locator('[aria-label*="Selectors" i], [data-panel-id="selectors"]').first()
  const present = (await button.count()) > 0
  if (!present) {
    return {
      frame: { frames: 0, droppedFrames: 0, worstFrameMs: 0, meanFrameMs: 0, meanFps: 0 },
      meanCycleMs: 0,
    }
  }

  const cycleTimes: number[] = []
  const action = async () => {
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now()
      await button.click().catch(() => {})
      await session.page.waitForTimeout(20)
      await button.click().catch(() => {})
      cycleTimes.push(performance.now() - t0)
    }
  }
  const frame = await measureFramesDuring(session.page, action)
  const meanCycleMs = cycleTimes.length ? cycleTimes.reduce((s, v) => s + v, 0) / cycleTimes.length : 0
  return { frame, meanCycleMs }
}

async function scenarioClassCreationViaUI(
  session: BrowserSession,
  iterations: number,
): Promise<{ frame: FrameStability; meanCreateMs: number; created: number }> {
  // Open the Selectors panel via the rail (best effort).
  const panelTab = session.page.locator('[data-panel-id="selectors"], [aria-label*="Selectors" i]').first()
  if ((await panelTab.count()) > 0) {
    await panelTab.click().catch(() => {})
  }
  await session.page.waitForTimeout(100)

  // Click the "Create selector" button N times, fill the dialog, submit.
  const createButton = session.page.locator('button[aria-label="Create selector"]').first()
  const buttonAvailable = (await createButton.count()) > 0
  if (!buttonAvailable) {
    return { frame: { frames: 0, droppedFrames: 0, worstFrameMs: 0, meanFrameMs: 0, meanFps: 0 }, meanCreateMs: 0, created: 0 }
  }

  const samples: number[] = []
  let created = 0

  const action = async () => {
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now()
      try {
        await createButton.click({ timeout: 1500 })
        // Dialog: name input is usually the first text input within the dialog.
        const dialog = session.page.locator('[role="dialog"]').last()
        await dialog.waitFor({ state: 'visible', timeout: 1500 })
        const nameInput = dialog.locator('input').first()
        await nameInput.fill(`bench-cls-${Date.now()}-${i}`)
        // Submit button: look for "Create" text.
        const submit = dialog.locator('button:has-text("Create")').first()
        await submit.click({ timeout: 1500 })
        await dialog.waitFor({ state: 'hidden', timeout: 1500 })
        created++
      } catch {
        // best effort — record the cycle as a failure but keep going
      }
      samples.push(performance.now() - t0)
    }
  }
  const frame = await measureFramesDuring(session.page, action)
  const meanCreateMs = samples.length ? samples.reduce((s, v) => s + v, 0) / samples.length : 0
  return { frame, meanCreateMs, created }
}

async function scenarioIdleFrames(session: BrowserSession, durationMs: number): Promise<FrameStability> {
  return measureFramesDuring(session.page, async () => {
    await session.page.waitForTimeout(durationMs)
  })
}

/**
 * Authenticated cold-load measurement. Opens a fresh browser context (no
 * disk cache, no warm JIT cache) with the session cookie pre-installed,
 * then measures the cold load of the heavy `/admin/site` route.
 *
 * This simulates the realistic scenario "user reloads the editor tab
 * while logged in" — the most common workflow path. Unlike the other
 * load rows (which measure same-session warm navigations), this one
 * actually shows what the user feels when their workday begins.
 */
async function measureAuthenticatedColdLoad(
  baseUrl: string,
  sessionCookieValue: string,
  executablePath: string | undefined,
  url: string,
  label: string,
): Promise<LoadScenario> {
  const fresh = await launchBrowser({ executablePath })
  try {
    // Set the session cookie before the very first request so the
    // server's serveAdminApp picks the authenticated shell path.
    const target = new URL(baseUrl)
    await fresh.context.addCookies([
      {
        name: 'instatic_admin_session',
        value: sessionCookieValue,
        domain: target.hostname,
        path: '/admin',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])
    await fresh.cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await installMetricsHarness(fresh.page)
    const metrics = await loadPageWithMetrics(fresh.page, `${baseUrl}${url}`)
    const heapBytes = await readHeapBytes(fresh.page)
    return { label, url: `${baseUrl}${url}`, metrics, heapBytes }
  } finally {
    await fresh.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bench module
// ─────────────────────────────────────────────────────────────────────────────

export const browserBench: BenchModule = {
  name: 'browser',
  title: 'Browser (real Chromium, paint + frame + interaction)',
  description: 'Cold-load timings + idle/interaction frame stability in real Chromium via Playwright. Skips gracefully if Chromium not installed.',

  async run(ctx: BenchContext): Promise<BenchResult> {
    const overrideChrome = readArg('chrome-path')
    const traceSelection = readSet('trace')

    let server: ServerHandle | null = null
    let baseUrl: string
    if (ctx.baseUrl) {
      baseUrl = ctx.baseUrl
    } else {
      const staticDir = existsSync(resolve(REPO_ROOT, 'dist')) ? resolve(REPO_ROOT, 'dist') : undefined
      log.step('Spawning production server on a free port' + (staticDir ? '' : ' (no dist/ — UI may not render correctly)'))
      server = await startServer({ staticDir })
      baseUrl = server.baseUrl
      log.ok(`Server up in ${fmtMs(server.bootMs)} at ${baseUrl}`)
    }

    let session: BrowserSession | null = null
    try {
      log.step('Launching Chromium (headless)' + (overrideChrome ? ` (system: ${overrideChrome})` : ''))
      try {
        session = await launchBrowser({ executablePath: overrideChrome ?? findSystemChrome() ?? undefined })
      } catch (err) {
        log.warn((err as Error).message)
        return {
          name: this.name,
          title: this.title,
          headline: { status: 'skipped — no Chromium' },
          sections: [
            {
              title: 'Skipped',
              rows: [
                {
                  label: 'browser',
                  metrics: { detected: '—' },
                  notes:
                    'Run `bunx playwright install chromium` (one-time, ~280 MB) OR install Chrome/Chromium/Edge OR pass --chrome-path=PATH.',
                },
              ],
            },
          ],
        }
      }
      await installMetricsHarness(session.page)

      const traces: Array<{ name: string; path: string }> = []
      const tracesDir = join(ctx.outputDir, 'browser-traces')
      mkdirSync(tracesDir, { recursive: true })
      const shouldTrace = (name: string): boolean => traceSelection.has('ALL') || traceSelection.has(name)
      const traced = async <T>(name: string, runner: () => Promise<T>): Promise<T> => {
        if (!session) throw new Error('session lost')
        if (!shouldTrace(name)) return runner()
        const tracePath = join(tracesDir, `${name}.trace.zip`)
        const stop = await startTrace(session.context, tracePath, name)
        try {
          return await runner()
        } finally {
          await stop()
          traces.push({ name, path: tracePath })
        }
      }

      // ── 1. Cold load metrics ────────────────────────────────────────────
      log.step('Page load metrics')
      const loadScenarios: LoadScenario[] = []
      loadScenarios.push(await runLoadScenario(session, baseUrl, 'cold /admin (login screen)', '/admin'))

      const credentials = readBenchCredentials()
      let authOk = false
      if (credentials) {
        log.step('  authenticating via /admin/api/cms/login')
        authOk = await loginAdmin(session.page, baseUrl, credentials.email, credentials.password)
          .then(() => true)
          .catch((err) => {
            log.warn(`Login failed: ${(err as Error).message}`)
            return false
          })
      } else {
        log.warn(`Authenticated browser scenarios skipped: set ${ADMIN_EMAIL_ENV} and ${ADMIN_PASSWORD_ENV}.`)
      }

      // Capture the session cookie so we can spawn a *fresh* browser
      // context with cache disabled but already authenticated — the only
      // honest way to measure what an editor user feels when they reload
      // the tab in the middle of a workday.
      let sessionCookieValue: string | null = null
      if (authOk && session) {
        const cookies = await session.context.cookies()
        const sessionCookie = cookies.find((c) => c.name === 'instatic_admin_session')
        sessionCookieValue = sessionCookie?.value ?? null
      }

      if (authOk) {
        loadScenarios.push(await runLoadScenario(session, baseUrl, 'warm /admin/dashboard (same context)', '/admin/dashboard'))
        loadScenarios.push(await runLoadScenario(session, baseUrl, 'warm /admin/site (same context)', '/admin/site'))
      }

      // ── 1b. Authenticated COLD-LOAD scenarios ───────────────────────────
      // Fresh browser context, no HTTP cache, no warm JIT cache — but
      // session cookie pre-installed. This is the realistic "user reloads
      // /admin/site after their morning coffee" measurement.
      if (authOk && sessionCookieValue) {
        log.step('Authenticated cold-load (fresh context, cache disabled)')
        const overrideChromeForCold = readArg('chrome-path')
        loadScenarios.push(
          await measureAuthenticatedColdLoad(
            baseUrl,
            sessionCookieValue,
            overrideChromeForCold ?? findSystemChrome() ?? undefined,
            '/admin/site',
            'AUTHENTICATED COLD /admin/site (fresh context)',
          ),
        )
        loadScenarios.push(
          await measureAuthenticatedColdLoad(
            baseUrl,
            sessionCookieValue,
            overrideChromeForCold ?? findSystemChrome() ?? undefined,
            '/admin/dashboard',
            'AUTHENTICATED COLD /admin/dashboard (fresh context)',
          ),
        )
      }

      // ── 2. Admin-route navigation cycle ─────────────────────────────────
      let routeCycle: Awaited<ReturnType<typeof scenarioAdminRouteCycle>> | null = null
      if (authOk) {
        log.step('Admin-route navigation cycle')
        const cycleIters = ctx.quick ? 4 : 8
        routeCycle = await traced('route-cycle', () => scenarioAdminRouteCycle(session!, baseUrl, cycleIters))
      }

      // ── 3. Idle frame stability ─────────────────────────────────────────
      log.step(authOk ? 'Idle frame stability (5s on /admin/site)' : 'Idle frame stability (login screen)')
      if (authOk) await session.page.goto(`${baseUrl}/admin/site`, { waitUntil: 'load' })
      const idleFrames = await scenarioIdleFrames(session, ctx.quick ? 2000 : 5000)

      // ── 4. Spotlight churn ──────────────────────────────────────────────
      let spotlight: Awaited<ReturnType<typeof scenarioSpotlightChurn>> | null = null
      if (authOk) {
        log.step('Spotlight (Cmd+K) open/close churn')
        const iters = ctx.quick ? 5 : 20
        spotlight = await traced('spotlight-churn', () => scenarioSpotlightChurn(session!, iters))
      }

      // ── 5. Selectors panel toggle ───────────────────────────────────────
      let panelToggle: Awaited<ReturnType<typeof scenarioSelectorsPanelToggle>> | null = null
      if (authOk) {
        log.step('Selectors panel open/close storm')
        const iters = ctx.quick ? 5 : 20
        panelToggle = await traced('selectors-panel-toggle', () => scenarioSelectorsPanelToggle(session!, iters))
      }

      // ── 6. Class creation via UI ────────────────────────────────────────
      let classCreation: Awaited<ReturnType<typeof scenarioClassCreationViaUI>> | null = null
      if (authOk) {
        log.step('Class creation via dialog UI')
        const iters = ctx.quick ? 5 : 25
        classCreation = await traced('class-creation', () => scenarioClassCreationViaUI(session!, iters))
      }

      // ── 7. Final heap + DOM size ────────────────────────────────────────
      const finalHeap = await readHeapBytes(session.page)
      const finalDomNodes = await readDomNodeCount(session.page)

      // ───────────────────────────────────────────────────────────────────
      // Render
      // ───────────────────────────────────────────────────────────────────

      const loadRows: BenchRow[] = loadScenarios.map((s) => ({
        label: s.label,
        metrics: {
          total: fmtMs(s.metrics.totalMs),
          FCP: s.metrics.fcpMs !== null ? fmtMs(s.metrics.fcpMs) : '—',
          LCP: s.metrics.lcpMs !== null ? fmtMs(s.metrics.lcpMs) : '—',
          DCL: s.metrics.domContentLoadedMs !== null ? fmtMs(s.metrics.domContentLoadedMs) : '—',
          long_tasks: fmtNum(s.metrics.longTasks.length),
          TBT: fmtMs(s.metrics.totalBlockingMs),
          transferred: fmtBytes(s.metrics.transferredBytes),
          dom_nodes: fmtNum(s.metrics.domNodeCount),
          heap: s.heapBytes !== null ? fmtBytes(s.heapBytes) : '—',
        },
      }))

      const interactionRows: BenchRow[] = []
      interactionRows.push({
        label: authOk ? 'Idle frame stability on /admin/site' : 'Idle frame stability on login screen',
        inputs: { window_ms: ctx.quick ? 2000 : 5000 },
        metrics: {
          frames: fmtNum(idleFrames.frames),
          mean_fps: idleFrames.meanFps.toFixed(1),
          worst_frame: fmtMs(idleFrames.worstFrameMs),
          dropped: `${idleFrames.droppedFrames}/${idleFrames.frames}`,
          drop_rate: `${((idleFrames.droppedFrames / Math.max(1, idleFrames.frames)) * 100).toFixed(1)}%`,
        },
        notes: 'Frames over 16.67ms count as dropped (60fps budget).',
      })
      if (routeCycle) {
        interactionRows.push({
          label: 'Admin route cycle (dashboard→content→data→site)',
          inputs: { iterations: routeCycle.perRouteMs.reduce((s, r) => s + r.samples, 0) },
          metrics: {
            total: fmtMs(routeCycle.totalMs),
            per_route_mean: routeCycle.perRouteMs
              .map((r) => `${r.route.split('/').pop()}:${fmtMs(r.mean)}`)
              .join(' '),
          },
          notes: 'Frame stability not measured across navigations — each goto wipes the in-page accumulator. Per-route transition latency is what matters here.',
        })
      }
      if (spotlight) {
        interactionRows.push({
          label: 'Spotlight open+close churn',
          inputs: { iterations: Math.max(1, Math.floor(spotlight.frame.frames / 60)) },
          metrics: {
            mean_open: fmtMs(spotlight.meanOpenMs),
            mean_close: fmtMs(spotlight.meanCloseMs),
            mean_fps: spotlight.frame.meanFps.toFixed(1),
            worst_frame: fmtMs(spotlight.frame.worstFrameMs),
            dropped: `${spotlight.frame.droppedFrames}/${spotlight.frame.frames}`,
          },
        })
      }
      if (panelToggle) {
        interactionRows.push({
          label: 'Selectors panel open/close storm',
          metrics: {
            mean_cycle: fmtMs(panelToggle.meanCycleMs),
            mean_fps: panelToggle.frame.meanFps.toFixed(1),
            worst_frame: fmtMs(panelToggle.frame.worstFrameMs),
            dropped: `${panelToggle.frame.droppedFrames}/${panelToggle.frame.frames}`,
          },
          notes: panelToggle.frame.frames === 0 ? 'Selectors panel tab not found in DOM — scenario skipped.' : undefined,
        })
      }
      if (classCreation) {
        interactionRows.push({
          label: 'Class creation via dialog UI',
          inputs: { created: classCreation.created },
          metrics: {
            mean_create: fmtMs(classCreation.meanCreateMs),
            mean_fps: classCreation.frame.meanFps.toFixed(1),
            worst_frame: fmtMs(classCreation.frame.worstFrameMs),
            dropped: `${classCreation.frame.droppedFrames}/${classCreation.frame.frames}`,
          },
          notes: classCreation.created === 0
            ? 'Create-selector button not found — Selectors panel may not have opened. Try `--trace=class-creation` to debug.'
            : undefined,
        })
      }

      const finalStateRows: BenchRow[] = [
        {
          label: 'After all scenarios',
          metrics: {
            heap: finalHeap !== null ? fmtBytes(finalHeap) : '—',
            dom_nodes: fmtNum(finalDomNodes),
          },
          notes: authOk
            ? 'Cumulative heap + DOM after route cycle, spotlight, panel toggles, and class creation.'
            : 'Cumulative heap + DOM after unauthenticated login-screen scenarios.',
        },
      ]

      const traceRows: BenchRow[] = traces.map((t) => ({
        label: t.name,
        metrics: { artifact: t.path.replace(REPO_ROOT + '/', '') },
        notes: `Open with \`bunx playwright show-trace ${t.path.replace(REPO_ROOT + '/', '')}\``,
      }))

      const coldLogin = loadScenarios.find((s) => s.label.startsWith('cold /admin (login'))
      const authedColdSite = loadScenarios.find((s) => s.label.includes('AUTHENTICATED COLD /admin/site'))
      const totalTbt = loadScenarios.reduce((sum, s) => sum + s.metrics.totalBlockingMs, 0)

      return {
        name: this.name,
        title: this.title,
        headline: {
          chromium: 'playwright-core ' + (await session.browser.version()),
          'login LCP (cold)': coldLogin?.metrics.lcpMs != null ? fmtMs(coldLogin.metrics.lcpMs) : '—',
          'editor LCP (auth cold)': authedColdSite?.metrics.lcpMs != null ? fmtMs(authedColdSite.metrics.lcpMs) : '—',
          'editor FCP (auth cold)': authedColdSite?.metrics.fcpMs != null ? fmtMs(authedColdSite.metrics.fcpMs) : '—',
          total_blocking_time: fmtMs(totalTbt),
          idle_fps: idleFrames.meanFps.toFixed(1),
          spotlight_open: spotlight ? fmtMs(spotlight.meanOpenMs) : '—',
        },
        sections: [
          {
            title: 'Page-load metrics',
            intro:
              'Core Web Vitals + long-task budget for each navigation. FCP = first paint of anything; LCP = paint of the largest element; DCL = DOMContentLoaded; TBT = sum of long-task time exceeding 50ms. **Note:** FCP / LCP only fire reliably on the *cold* first navigation. Subsequent in-session navigations are typically served from disk/HTTP cache, complete their DCL in single-digit milliseconds, and the browser does not always fire fresh paint observers for them. For those rows, watch DCL + dom_nodes + heap.',
            rows: loadRows,
          },
          {
            title: 'Interactive scenarios — frame stability',
            intro:
              'Every interaction is wrapped in a `requestAnimationFrame` sampler. The 60fps budget is 16.67ms; anything over that is a dropped frame. `mean_fps` is computed over the whole scenario, so background work shows up as low FPS even when individual frames look fine.',
            rows: interactionRows,
          },
          {
            title: 'Cumulative state after all scenarios',
            rows: finalStateRows,
          },
          ...(traceRows.length
            ? [
                {
                  title: 'Playwright traces',
                  intro:
                    'Each `--trace=NAME` (or `--trace=ALL`) wraps the named scenario in a Playwright tracing session — screenshots, snapshots, and a timeline you can scrub through in the Trace Viewer.',
                  rows: traceRows,
                },
              ]
            : []),
        ],
      }
    } finally {
      if (session) await session.close()
      if (server) await server.stop()
    }
  },
}
