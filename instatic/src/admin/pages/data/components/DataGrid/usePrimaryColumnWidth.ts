/**
 * usePrimaryColumnWidth — per-table primary column width with localStorage
 * persistence, mirroring the editor-layout sidebar-width pattern.
 *
 * Storage shape: `{ version: 1, widths: { [tableId]: number } }` under the
 * key `instatic-data-grid-primary-widths-v1`. Validated by TypeBox; corrupted
 * blobs gracefully fall back to defaults rather than throwing.
 */
import { useState } from 'react'
import { Type, type Static } from '@core/utils/typeboxHelpers'
import { safeParseJson } from '@core/utils/jsonValidate'

const STORAGE_KEY = 'instatic-data-grid-primary-widths-v1'

const PRIMARY_COLUMN_DEFAULT_WIDTH = 280
const PRIMARY_COLUMN_MIN_WIDTH = 200
const PRIMARY_COLUMN_MAX_WIDTH = 720

const StoredWidthsSchema = Type.Object(
  {
    version: Type.Literal(1),
    widths: Type.Record(Type.String(), Type.Number()),
  },
  { additionalProperties: true },
)

type StoredWidths = Static<typeof StoredWidthsSchema>

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined'
}

function readAll(): StoredWidths {
  if (!storageAvailable()) return { version: 1, widths: {} }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { version: 1, widths: {} }
  const parsed = safeParseJson(raw, StoredWidthsSchema)
  if (!parsed.ok) return { version: 1, widths: {} }
  return parsed.value
}

function writeAll(value: StoredWidths): void {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Quota / private-mode errors are non-fatal — width persistence is
    // best-effort.
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return PRIMARY_COLUMN_DEFAULT_WIDTH
  return Math.min(PRIMARY_COLUMN_MAX_WIDTH, Math.max(PRIMARY_COLUMN_MIN_WIDTH, n))
}

function resolveInitialWidth(tableId: string | null): number {
  if (tableId == null) return PRIMARY_COLUMN_DEFAULT_WIDTH
  const stored = readAll().widths[tableId]
  return typeof stored === 'number' ? clamp(stored) : PRIMARY_COLUMN_DEFAULT_WIDTH
}

/**
 * Returns the resolved width for `tableId` plus a setter that persists to
 * localStorage. `tableId === null` uses the default and renders the setter
 * as a no-op (e.g. when no table is selected).
 *
 * When `tableId` changes, the hook re-reads localStorage so each table
 * keeps its own remembered width. Implemented with the
 * "store prev prop in state" pattern from the React docs
 * (`react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes`)
 * — both setStates fire in the same render and React batches them.
 */
export function usePrimaryColumnWidth(
  tableId: string | null,
): [number, (next: number) => void] {
  const [width, setWidth] = useState<number>(() => resolveInitialWidth(tableId))
  const [prevTableId, setPrevTableId] = useState<string | null>(tableId)

  if (prevTableId !== tableId) {
    setPrevTableId(tableId)
    setWidth(resolveInitialWidth(tableId))
  }

  const commit = (next: number) => {
    const clamped = clamp(next)
    setWidth(clamped)
    if (tableId == null) return
    const all = readAll()
    writeAll({
      version: 1,
      widths: { ...all.widths, [tableId]: clamped },
    })
  }

  return [width, commit]
}
