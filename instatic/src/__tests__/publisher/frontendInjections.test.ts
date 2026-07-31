/**
 * Frontend-injection CSP relaxation — gates the four tiers the publisher
 * applies to a page's `script-src` and `worker-src` directives when one or
 * more plugins contribute `frontend.assets[]` tags:
 *
 *   1. No frontend assets at all              → CSP unchanged (script-src 'none')
 *   2. Only external `<script src=…>`         → script-src 'self'      + worker-src relaxed
 *   3. Only inline `<script>…</script>`       → script-src 'self' 'unsafe-inline' + worker-src relaxed
 *   4. Mix of external and inline             → script-src 'self' 'unsafe-inline' + worker-src relaxed
 *
 * The bug this test fleet locks in: case 2 (external-only) previously failed
 * to relax `script-src`, leaving it at `'none'` so the browser blocked the
 * tag the publisher had just injected. Every analytics / observability /
 * tracker plugin with a single external script hit this.
 */
import { describe, it, expect } from 'bun:test'
import { injectFrontendAssets, type FrontendInjections } from '../../../server/publish/frontendInjections'

const PAGE_WITH_CSP_META = `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; worker-src 'none'; style-src 'self'; img-src 'self' data:; connect-src 'self';">
</head>
<body></body>
</html>`

function emptyPlan(): FrontendInjections {
  return {
    tags: { head: [], 'head-end': [], 'body-start': [], 'body-end': [] },
    hasInlineScript: false,
    hasExternalScript: false,
    hasInlineStyle: false,
    networkAllowedHosts: [],
    mediaCspOrigins: [],
  }
}

describe('frontend injection — CSP relaxation', () => {
  it('keeps script-src `none` when no plugin contributes a tag', () => {
    const out = injectFrontendAssets(PAGE_WITH_CSP_META, emptyPlan())
    expect(out).toContain("script-src 'none'")
    expect(out).toContain("worker-src 'none'")
  })

  it('relaxes script-src to `self` for external-only scripts (regression: tracker plugins)', () => {
    const plan = emptyPlan()
    plan.hasExternalScript = true
    plan.tags['body-end'] = [`<script src="/uploads/plugins/acme.analytics/1.0.0/frontend/tracker.js" defer></script>`]
    const out = injectFrontendAssets(PAGE_WITH_CSP_META, plan)
    expect(out).toContain("script-src 'self';")
    // NOT 'unsafe-inline' — the plan is external-only
    expect(out).not.toContain("script-src 'self' 'unsafe-inline'")
    // worker-src relaxed too, in case the plugin script spawns a worker
    expect(out).toContain("worker-src 'self' blob:;")
  })

  it('relaxes script-src to `self` + `unsafe-inline` for inline scripts', () => {
    const plan = emptyPlan()
    plan.hasInlineScript = true
    plan.tags['body-end'] = [`<script>console.log('hi')</script>`]
    const out = injectFrontendAssets(PAGE_WITH_CSP_META, plan)
    expect(out).toContain("script-src 'self' 'unsafe-inline';")
    expect(out).toContain("worker-src 'self' blob:;")
  })

  it('relaxes script-src to `self` + `unsafe-inline` for mixed external + inline plans', () => {
    const plan = emptyPlan()
    plan.hasExternalScript = true
    plan.hasInlineScript = true
    plan.tags.head = [`<script>window.X=1</script>`]
    plan.tags['body-end'] = [`<script src="/uploads/plugins/x/1.0.0/frontend/t.js"></script>`]
    const out = injectFrontendAssets(PAGE_WITH_CSP_META, plan)
    expect(out).toContain("script-src 'self' 'unsafe-inline';")
    expect(out).toContain("worker-src 'self' blob:;")
  })
})
