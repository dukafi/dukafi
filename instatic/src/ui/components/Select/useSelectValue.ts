import { useState } from 'react'
import {
  hasTextValue,
  stringifySelectValue,
  type NormalizedSelectOption,
} from './SelectOption'

interface UseSelectValueArgs {
  value: unknown
  defaultValue: unknown
  placeholder: string | undefined
  normalizedOptions: NormalizedSelectOption[]
}

interface UseSelectValueResult {
  isControlled: boolean
  selectedValue: string
  selectedOption: NormalizedSelectOption | undefined
  selectedText: string
  showPlaceholder: boolean
  internalValue: string
  setInternalValue: (next: string) => void
}

/**
 * Resolves the visible value of a Select, transparently supporting controlled
 * and uncontrolled usage. Falls back to the first option when the supplied
 * value isn't in the option list (so the UI always has *something* to render).
 */
export function useSelectValue({
  value,
  defaultValue,
  placeholder,
  normalizedOptions,
}: UseSelectValueArgs): UseSelectValueResult {
  const firstValue = normalizedOptions[0]?.value ?? ''
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(() => {
    return stringifySelectValue(defaultValue ?? firstValue)
  })

  const rawSelectedValue = stringifySelectValue(isControlled ? value : internalValue)
  const selectedValue = normalizedOptions.some((option) => option.value === rawSelectedValue)
    ? rawSelectedValue
    : firstValue
  const selectedOption =
    normalizedOptions.find((option) => option.value === selectedValue) ??
    normalizedOptions[0]
  const showPlaceholder = rawSelectedValue === '' && hasTextValue(placeholder)
  const selectedText = showPlaceholder ? '' : (selectedOption?.textValue ?? '')

  return {
    isControlled,
    selectedValue,
    selectedOption,
    selectedText,
    showPlaceholder,
    internalValue,
    setInternalValue,
  }
}
