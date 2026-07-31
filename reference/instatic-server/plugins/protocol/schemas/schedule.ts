/**
 * TypeBox schemas for `cms.schedule.register` / `cms.schedule.cancel` api-call
 * arguments.
 *
 * The `CadenceSchema` union mirrors the `Cadence` union in
 * `server/repositories/pluginSchedules.ts` — both must move in lockstep.
 * The architecture test `plugin-schedule-invariants.test.ts` locks the exact
 * content of this file.
 */

import { Type } from '@sinclair/typebox'

// Cadence shapes the plugin can pass to `cms.schedule.register`. The
// validator rejects anything that doesn't match one of the documented
// intervals.
const TimeOfDayPattern = '^([01][0-9]|2[0-3]):[0-5][0-9]$'

const CadenceSchema = Type.Union([
  Type.Object({ interval: Type.Literal('hourly') }, { additionalProperties: false }),
  Type.Object(
    {
      interval: Type.Literal('daily'),
      at: Type.String({ pattern: TimeOfDayPattern }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      interval: Type.Literal('weekly'),
      at: Type.String({ pattern: TimeOfDayPattern }),
      day: Type.Union([
        Type.Literal('mon'), Type.Literal('tue'), Type.Literal('wed'),
        Type.Literal('thu'), Type.Literal('fri'), Type.Literal('sat'),
        Type.Literal('sun'),
      ]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      interval: Type.Literal('monthly'),
      at: Type.String({ pattern: TimeOfDayPattern }),
      // Capped at 28 so February never breaks. Schedules that need
      // last-day-of-month behaviour can use 'every' with 1440-minute
      // intervals plus an in-handler check.
      dayOfMonth: Type.Integer({ minimum: 1, maximum: 28 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      interval: Type.Literal('every'),
      // Lower bound of 1 minute is deliberate — sub-minute schedules
      // collide with the 10s tick polling resolution and would surprise
      // authors who expect them to fire on the second.
      minutes: Type.Integer({ minimum: 1, maximum: 1440 }),
    },
    { additionalProperties: false },
  ),
])

export const ScheduleRegisterArgSchema = Type.Object(
  {
    scheduleId: Type.String({ minLength: 1, maxLength: 120 }),
    cadence: CadenceSchema,
    overlap: Type.Union([
      Type.Literal('skip'),
      Type.Literal('queue'),
      Type.Literal('parallel'),
    ]),
    // Per-schedule wall-clock budget. Bounded so a plugin can't pin a
    // worker indefinitely; longer work should chunk and yield.
    maxDurationMs: Type.Integer({ minimum: 100, maximum: 5 * 60_000 }),
  },
  { additionalProperties: false },
)

export const ScheduleCancelArgSchema = Type.Object(
  {
    scheduleId: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false },
)
