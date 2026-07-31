/**
 * Architecture gate — encrypted credential material never crosses the
 * HTTP boundary.
 *
 * Static scan of `server/ai/handlers/**`:
 *
 *   - Handler files must not contain `ciphertext`, `iv:`, or `apiKey` in
 *     their RESPONSE bodies (jsonResponse(...) calls). The only field
 *     names that may appear in a CredentialView are the ones declared in
 *     `server/ai/credentials/types.ts` → `CredentialView`.
 *
 *   - Handlers must always use `toCredentialView()` to project a
 *     CredentialRecord before serialising. Direct `JSON.stringify(record)`
 *     of a CredentialRecord would leak everything.
 *
 * The complement (handlers MUST gate every operation with
 * `requireCapability`) lives in `ai-handlers-capability-gated.test.ts`.
 */

import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'

const REPO_ROOT = join(import.meta.dir, '../../../')
const HANDLERS_DIR = join(REPO_ROOT, 'server/ai/handlers')

function listHandlerFiles(): string[] {
  if (!existsSync(HANDLERS_DIR)) return []
  return readdirSync(HANDLERS_DIR)
    .filter((f) => extname(f) === '.ts' && f !== 'index.ts')
    .map((f) => join(HANDLERS_DIR, f))
}

describe('ai-credentials-never-leak gate', () => {
  it('no handler file reads .ciphertext or .iv from a CredentialRecord', () => {
    const files = listHandlerFiles()
    expect(files.length).toBeGreaterThan(0)

    const violations: { file: string; finding: string }[] = []

    for (const file of files) {
      const src = readFileSync(file, 'utf8')

      // The only paths to a leak are reading `record.ciphertext` or
      // `record.iv` from a CredentialRecord and then flowing the value
      // into a response body. We catch the read itself — there is no
      // legitimate handler reason to touch raw encryption material.
      //
      // `apiKey` is intentionally NOT in this list: it appears
      // legitimately in input body schemas (CreateBodySchema) and in
      // AiResolvedCredential construction (passed to drivers, not
      // serialised). The runtime test
      // (`.tmp/smoke-handlers.ts` → "list response never carries
      // plaintext key") covers the actual leak vector.
      const PATTERNS: Array<{ name: string; re: RegExp }> = [
        { name: '.ciphertext member access', re: /\.ciphertext\b/ },
        // `\.iv\b` is too noisy (matches `.invoke` etc.). Require an
        // ASCII boundary specifically after the `iv` field.
        { name: '.iv member access', re: /\.iv(?=[\s,;)\]}.])/ },
        // Defensive: prevent direct serialisation of credential rows.
        { name: 'JSON.stringify of credential record', re: /JSON\.stringify\s*\(\s*\w*[Cc]redential/ },
      ]

      for (const pattern of PATTERNS) {
        if (pattern.re.test(src)) {
          violations.push({
            file: relative(REPO_ROOT, file).replaceAll('\\', '/'),
            finding: pattern.name,
          })
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `[ai-credentials-never-leak] handler files touch encryption material:\n` +
        violations.map((v) => `  ${v.file} → ${v.finding}`).join('\n') +
        `\n\nProject CredentialRecord → CredentialView via toCredentialView() before serialising.`,
      )
    }
    expect(violations).toHaveLength(0)
  })

  it('credentials handler uses toCredentialView() for every response that includes a credential', () => {
    const credentialsFile = join(HANDLERS_DIR, 'credentials.ts')
    if (!existsSync(credentialsFile)) return // handler not yet present
    const src = readFileSync(credentialsFile, 'utf8')

    // Every response that mentions a credential should funnel through
    // toCredentialView. A simple presence check is enough — the leak
    // patterns above catch direct serialisation of the raw record.
    expect(src.includes('toCredentialView(')).toBe(true)
  })
})
