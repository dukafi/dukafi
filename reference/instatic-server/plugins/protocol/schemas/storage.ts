/**
 * TypeBox schemas for `cms.storage.*` api-call arguments.
 */

import { Type } from '@sinclair/typebox'

export const JsonRecordSchema = Type.Record(Type.String(), Type.Unknown())
