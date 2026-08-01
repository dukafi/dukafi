/**
 * Architecture gate — system prompt must contain the narrate-only rule.
 *
 * The agent is instructed to change the page through tools and keep its
 * reply to 1-2 sentences of narration. Emitting raw HTML/CSS/JSON in the
 * reply wastes tokens, confuses the user, and bypasses the tool pipeline.
 *
 * This gate ensures the rule is still present so refactors of the system
 * prompt cannot accidentally remove it.
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '../../../')
const PROMPT_FILE = join(REPO_ROOT, 'server/ai/tools/site/systemPrompt.ts')

const src = readFileSync(PROMPT_FILE, 'utf8')

describe('agent-no-raw-html-in-reply-rule gate', () => {
  it('contains the exact narrate-only rule prohibiting raw HTML/CSS/JSON in replies', () => {
    expect(src).toContain('No raw HTML/CSS/JSON in the reply')
  })
})
