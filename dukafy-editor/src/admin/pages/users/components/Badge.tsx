/**
 * Pill badge used in tables on the Users workspace.
 */
import { TagPill } from '@ui/components/TagPill'

export function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return <TagPill label={label} muted={muted} size="xs" />
}
