import { describe, expect, it } from 'bun:test'
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../../../server/auth/tokens'

describe('CMS auth primitives', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('generates opaque session tokens and stores only hashes', async () => {
    const token = createSessionToken()
    const hash = await hashSessionToken(token)
    expect(token.length).toBeGreaterThan(32)
    expect(hash).not.toBe(token)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('uses a stable admin session cookie name', () => {
    expect(SESSION_COOKIE_NAME).toBe('instatic_admin_session')
  })
})
