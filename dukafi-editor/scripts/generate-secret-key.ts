#!/usr/bin/env bun
/**
 * Generate a fresh 32-byte (256-bit) base64 AES key suitable for
 * `INSTATIC_SECRET_KEY`.
 *
 * Usage:
 *
 *     bun run scripts/generate-secret-key.ts
 *
 * Prints the key (and a setup hint) to stdout. The key is generated via
 * `crypto.getRandomValues`, never written to disk by this script — that's
 * the operator's job (env var, secret manager, etc.).
 *
 * @see server/secrets/masterKey.ts
 * @see docs/plans/2026-05-26-ai-runtime-rewrite.md → "Encryption"
 */

const KEY_BYTE_LENGTH = 32

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

const keyBytes = crypto.getRandomValues(new Uint8Array(KEY_BYTE_LENGTH))
const key = bytesToBase64(keyBytes)

process.stdout.write(`${key}\n`)

if (process.stderr.isTTY) {
  process.stderr.write(
    `\nGenerated a new 256-bit master key for encrypted server secrets.\n` +
    `Add it to your environment to use it:\n\n` +
    `    export INSTATIC_SECRET_KEY=${key}\n\n` +
    `Or set it in your deployment's secret manager. Without it, reversible ` +
    `server secrets such as AI credentials and MFA TOTP seeds cannot be ` +
    `decrypted (existing rows become unreadable if the key is lost).\n`,
  )
}
