/**
 * AES-256-GCM encryption for reversible server secrets.
 *
 * Plaintext secrets are encrypted at the repository boundary; the `CryptoKey`
 * is derived once from the master secret (`masterKey.ts`) and reused across
 * calls. Each stored value gets a fresh 96-bit random IV, so two rows storing
 * the same plaintext have different ciphertexts.
 *
 * The plain bytes never leave this module's call frame. Callers receive
 * `{ ciphertext, iv }` for persistence; on decrypt they hand both back and
 * receive plaintext for a single operation.
 */

const ALG_NAME = 'AES-GCM' as const
const IV_BYTE_LENGTH = 12

export interface EncryptedSecret {
  ciphertext: Uint8Array
  iv: Uint8Array
}

export async function encryptSecret(
  masterKey: CryptoKey,
  plaintext: string,
): Promise<EncryptedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH))
  const data = new TextEncoder().encode(plaintext)
  const buffer = await crypto.subtle.encrypt(
    { name: ALG_NAME, iv: iv as BufferSource },
    masterKey,
    data as BufferSource,
  )
  return { ciphertext: new Uint8Array(buffer), iv }
}

export async function decryptSecret(
  masterKey: CryptoKey,
  encrypted: EncryptedSecret,
): Promise<string> {
  const buffer = await crypto.subtle.decrypt(
    { name: ALG_NAME, iv: encrypted.iv as BufferSource },
    masterKey,
    encrypted.ciphertext as BufferSource,
  )
  return new TextDecoder().decode(buffer)
}
