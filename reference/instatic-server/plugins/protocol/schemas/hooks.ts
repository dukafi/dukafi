/**
 * TypeBox schemas for `cms.hooks.*` api-call arguments.
 */

import { Type } from '@sinclair/typebox'

export const HookListenerArgSchema = Type.Object(
  {
    event: Type.String({ minLength: 1 }),
    listenerId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
)

export const HookFilterArgSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    filterId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
)

export const HookEmitArgSchema = Type.Object(
  {
    event: Type.String({ minLength: 1 }),
    payload: Type.Unknown(),
  },
  { additionalProperties: false },
)
