/**
 * TypeBox schemas for `crypto.digest` / `crypto.signHmac` api-call arguments.
 *
 * Inputs are base64-encoded over the wire. We cap them at 8 MB so a runaway
 * plugin can't OOM the host process by sending arbitrarily large hash
 * requests. Real AWS Sigv4 / OAuth signing inputs are < 4 KB; this ceiling
 * is generous defense-in-depth.
 */

import { Type } from '@sinclair/typebox'

const HashAlgorithmSchema = Type.Union([
  Type.Literal('SHA-256'),
  Type.Literal('SHA-1'),
  Type.Literal('SHA-512'),
])

/** Max base64 payload — 8 MB after decode. (base64 inflates by 4/3 → ~10.7 MB encoded.) */
const MAX_CRYPTO_PAYLOAD_BASE64 = 12 * 1024 * 1024

export const CryptoDigestArgSchema = Type.Object(
  {
    algorithm: HashAlgorithmSchema,
    data: Type.String({ minLength: 0, maxLength: MAX_CRYPTO_PAYLOAD_BASE64 }),
  },
  { additionalProperties: false },
)

export const CryptoSignHmacArgSchema = Type.Object(
  {
    hash: HashAlgorithmSchema,
    key: Type.String({ minLength: 0, maxLength: MAX_CRYPTO_PAYLOAD_BASE64 }),
    data: Type.String({ minLength: 0, maxLength: MAX_CRYPTO_PAYLOAD_BASE64 }),
  },
  { additionalProperties: false },
)
