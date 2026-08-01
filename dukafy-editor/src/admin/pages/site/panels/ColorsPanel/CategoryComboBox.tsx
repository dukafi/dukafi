import {
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { Input } from '@ui/components/Input'
import styles from './CategoryComboBox.module.css'

interface CategoryComboBoxProps {
  label: string
  suggestions: string[]
  /** Current category of the editing token — kept out of the suggestion list. */
  excludeCategory?: string
  value: string
  onValueChange: (value: string) => void
  onCommit: (value: string) => void
  fieldClassName?: string
  labelClassName?: string
}

/**
 * Free-form category picker. Suggestions are drawn from the categories already
 * present on other tokens; the input itself accepts any string. Empty string
 * (or whitespace-only) commits as "uncategorized".
 */
export function CategoryComboBox({
  label,
  suggestions,
  excludeCategory,
  value,
  onValueChange,
  onCommit,
  fieldClassName = styles.field,
  labelClassName,
}: CategoryComboBoxProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const query = value.trim().toLowerCase()
  const exclude = excludeCategory?.trim().toLowerCase()
  const filteredSuggestions = suggestions.filter((candidate) => {
    const key = candidate.toLowerCase()
    if (exclude && key === exclude) return false
    if (!query) return true
    return key.includes(query)
  })

  // Reset highlight when the filtered set changes via a previous-value comparison
  // so the active index never points past the end of the filtered list.
  const [lastValue, setLastValue] = useState(value)
  if (lastValue !== value) {
    setLastValue(value)
    setActiveIndex(0)
  }

  const showMenu = open && filteredSuggestions.length > 0

  function handleFocus() {
    setOpen(true)
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (
      event.relatedTarget instanceof HTMLElement &&
      event.currentTarget.parentElement?.contains(event.relatedTarget)
    ) {
      return
    }
    onCommit(value)
    window.setTimeout(() => setOpen(false), 0)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(event.target.value)
    setOpen(true)
  }

  function commitSuggestion(suggestion: string) {
    onValueChange(suggestion)
    onCommit(suggestion)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showMenu) {
      if (event.key === 'ArrowDown' && filteredSuggestions.length > 0) {
        event.preventDefault()
        setOpen(true)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) =>
        Math.min(index + 1, filteredSuggestions.length - 1),
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commitSuggestion(filteredSuggestions[activeIndex])
    }
  }

  return (
    <div className={fieldClassName}>
      <span className={labelClassName}>{label}</span>
      <div className={styles.categoryField}>
        <Input
          type="text"
          value={value}
          fieldSize="sm"
          aria-label={label}
          aria-expanded={showMenu ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Uncategorized"
          onFocus={handleFocus}
          onMouseDown={() => setOpen(true)}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {showMenu && (
          <div
            role="listbox"
            aria-label={`${label} suggestions`}
            className={styles.categoryMenu}
          >
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={styles.categoryOption}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
