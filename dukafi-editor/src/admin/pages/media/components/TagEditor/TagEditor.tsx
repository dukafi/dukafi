/**
 * TagEditor — chip-style tag input used in the inspector.
 *
 * - Typing + Enter / Comma adds a new tag (lowercased, deduped).
 * - Backspace on an empty input removes the most recent chip.
 * - Each chip has a remove (×) button.
 * - Tag list is treated as immutable: every mutation calls `onChange` with
 *   the full next list. Parent persists.
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { TagPill } from '@ui/components/TagPill'
import styles from './TagEditor.module.css'

interface TagEditorProps {
  value: string[]
  onChange: (next: string[]) => void
  /** Tags collected from other assets — surfaced as autocomplete suggestions. */
  palette?: string[]
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase()
}

export function TagEditor({
  value,
  onChange,
  palette = [],
  ariaLabel = 'Tags',
  placeholder = 'Add tag…',
  disabled = false,
}: TagEditorProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function commit(raw: string) {
    const normalized = normalizeTag(raw)
    if (!normalized) {
      setDraft('')
      return
    }
    if (value.includes(normalized)) {
      setDraft('')
      return
    }
    onChange([...value, normalized].sort())
    setDraft('')
  }

  function removeAt(tag: string) {
    onChange(value.filter((existing) => existing !== tag))
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault()
      removeAt(value[value.length - 1])
    }
  }

  const suggestions = palette.filter((tag) => {
    if (value.includes(tag)) return false
    if (!draft.trim()) return false
    return tag.includes(normalizeTag(draft))
  }).slice(0, 6)

  return (
    <div className={styles.root} aria-label={ariaLabel}>
      <ul className={styles.chips} role="list" aria-label="Selected tags">
        {value.map((tag) => (
          <li key={tag} className={styles.chipItem}>
            <TagPill
              label={tag}
              onRemove={disabled ? undefined : () => removeAt(tag)}
              removeAriaLabel={`Remove ${tag}`}
            />
          </li>
        ))}
        <li className={styles.inputLi}>
          <Input
            ref={inputRef}
            value={draft}
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : ''}
            aria-label="Add tag"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={handleKey}
            className={styles.input}
          />
        </li>
      </ul>
      {suggestions.length > 0 && (
        <ul className={styles.suggestions} role="listbox" aria-label="Tag suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion} role="option" aria-selected="false">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => commit(suggestion)}
                className={styles.suggestion}
              >
                {suggestion}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
