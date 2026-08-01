/**
 * Lightweight console formatting for benches. Tells the user what's
 * happening while a bench is running — useful when an individual
 * scenario takes 30s.
 */

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'

const isTty = process.stdout.isTTY ?? false
const stylize = (s: string, code: string): string => (isTty ? `${code}${s}${RESET}` : s)

export const log = {
  section(name: string): void {
    console.log(`\n${stylize(`━━━ ${name} ━━━`, BOLD + CYAN)}`)
  },
  step(msg: string): void {
    console.log(`  ${stylize('›', DIM)} ${msg}`)
  },
  ok(msg: string): void {
    console.log(`  ${stylize('✓', GREEN)} ${msg}`)
  },
  warn(msg: string): void {
    console.log(`  ${stylize('!', YELLOW)} ${msg}`)
  },
  fail(msg: string): void {
    console.log(`  ${stylize('✗', RED)} ${msg}`)
  },
  detail(msg: string): void {
    console.log(`    ${stylize(msg, DIM)}`)
  },
}
