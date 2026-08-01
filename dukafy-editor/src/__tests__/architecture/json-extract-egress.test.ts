/**
 * Architecture Source-Scan — JSON Extraction Operator Egress
 *
 * `server/db/jsonExtract.ts` is the single, authorised source of dialect-aware
 * JSON field extraction SQL. It is the ONLY file in `server/` that may contain
 * the operator forms:
 *
 *   Postgres : `->>` (jsonb text extraction)
 *   SQLite   : `json_extract(` (JSON path extraction)
 *
 * All other `server/` files must go through `jsonField()` from that module.
 * Inlining these operators elsewhere bypasses identifier validation, breaks
 * dialect portability, and circumvents the PG-ism isolation gate.
 *
 * The two migration files are also allowed because:
 *   - `migrations-pg.ts`     — may legitimately use `->>'` in index DDL or
 *                              generated-column expressions.
 *   - `migrations-sqlite.ts` — may legitimately use `json_extract(` in the
 *                              same contexts for the SQLite dialect.
 *
 * Comment stripping is applied before scanning so JSDoc or inline comments
 * that document the operators don't produce false positives.
 *
 * @see server/db/jsonExtract.ts  — the one permitted implementation
 * @see db-postgres-isms.test.ts  — companion gate for other PG-only syntax
 */

import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { extname, join, relative } from 'path'

const PROJECT_ROOT = join(import.meta.dir, '../../../')
const SCAN_ROOT = join(PROJECT_ROOT, 'server')

/** Strip JS line and block comments so documented mentions of operators don't false-positive. */
const COMMENT_RE = /\/\/.*$|\/\*[\s\S]*?\*\//gm

// ---------------------------------------------------------------------------
// File walker — .ts files only, recursive
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (extname(entry) === '.ts') out.push(full)
  }
  return out
}

// ---------------------------------------------------------------------------
// Allowlist — files that are explicitly permitted to use these operators
// ---------------------------------------------------------------------------

const ALLOWLISTED = new Set([
  // The one helper that knows about both operators — its entire purpose.
  join(PROJECT_ROOT, 'server/db/jsonExtract.ts'),
  // Postgres migration file: may use ->>' in generated-column or index DDL.
  join(PROJECT_ROOT, 'server/db/migrations-pg.ts'),
  // SQLite migration file: may use json_extract( in the same DDL contexts.
  join(PROJECT_ROOT, 'server/db/migrations-sqlite.ts'),
])

// ---------------------------------------------------------------------------
// Comment stripper
// ---------------------------------------------------------------------------

/**
 * Strips JS line + block comments. Replaces each non-newline character inside
 * a comment with a space so that violation line numbers still line up with the
 * original source.
 */
function stripComments(src: string): string {
  return src.replace(COMMENT_RE, (m) => m.replace(/[^\n]/g, ' '))
}

// ---------------------------------------------------------------------------
// Forbidden patterns (applied after comment stripping)
// ---------------------------------------------------------------------------

interface ForbiddenPattern {
  name: string
  regex: RegExp
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    name: "->>' — Postgres jsonb text extraction; use jsonField() from server/db/jsonExtract.ts",
    regex: /->>'/, // single-quote variant used for scalar text extraction
  },
  {
    name: "json_extract( — SQLite JSON path extraction; use jsonField() from server/db/jsonExtract.ts",
    regex: /\bjson_extract\s*\(/i,
  },
]

// ---------------------------------------------------------------------------
// Violation record
// ---------------------------------------------------------------------------

interface Violation {
  /** Relative path from project root, e.g. `server/repositories/plugins.ts`. */
  file: string
  /** 1-based line number. */
  line: number
  /** Forbidden pattern name. */
  pattern: string
  /** The exact matched text. */
  match: string
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function scanForViolations(): Violation[] {
  const files = walk(SCAN_ROOT).filter((f) => !ALLOWLISTED.has(f))
  const violations: Violation[] = []

  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }

    const lines = stripComments(content).split('\n')

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]
      for (const pattern of FORBIDDEN_PATTERNS) {
        const m = pattern.regex.exec(line)
        if (m !== null) {
          violations.push({
            file: relative(PROJECT_ROOT, file),
            line: lineIdx + 1,
            pattern: pattern.name,
            match: m[0],
          })
        }
      }
    }
  }

  return violations
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JSON extraction operator egress — server/ files', () => {
  test('SCAN_ROOT resolves to at least one existing .ts file', () => {
    // Defensive: if the server/ layout moves, walk() returns nothing and the
    // gate silently passes on zero files. Fail loudly here instead.
    const total = walk(SCAN_ROOT).length
    if (total === 0) {
      throw new Error(
        `[json-extract-egress] SCAN_ROOT resolved to zero .ts files — the layout has likely ` +
          `moved. Update SCAN_ROOT in this file to match the current server/ directory.`,
      )
    }
    expect(total).toBeGreaterThan(0)
  })

  test('jsonExtract.ts is present and in the allowlist (sanity check)', () => {
    // If someone deletes or renames jsonExtract.ts the gate would trivially
    // pass (no violations), but the authorised implementation would be gone.
    // This assertion catches that.
    const helperPath = join(PROJECT_ROOT, 'server/db/jsonExtract.ts')
    expect(ALLOWLISTED.has(helperPath)).toBe(true)
    expect(existsSync(helperPath)).toBe(true)
  })

  test('no server/ file outside the allowlist uses ->>' + "' or json_extract(", () => {
    const violations = scanForViolations()

    if (violations.length === 0) {
      expect(violations).toHaveLength(0)
      return
    }

    const lines = violations.map(
      (v) =>
        `  ${v.file}:${v.line} — [${v.pattern}]\n` +
        `    matched: ${JSON.stringify(v.match)}`,
    )

    throw new Error(
      `[json-extract-egress] ${violations.length} raw JSON extraction operator(s) found outside the allowlist.\n` +
        `Use jsonField() from server/db/jsonExtract.ts instead — it validates identifiers and\n` +
        `emits the correct dialect-aware fragment for both Postgres and SQLite.\n\n` +
        `Violations:\n` +
        lines.join('\n') +
        `\n\nAllowlisted files (operators are acceptable there):\n` +
        `  server/db/jsonExtract.ts\n` +
        `  server/db/migrations-pg.ts\n` +
        `  server/db/migrations-sqlite.ts`,
    )
  })
})
