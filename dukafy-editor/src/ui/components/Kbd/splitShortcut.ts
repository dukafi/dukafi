/**
 * splitShortcut — break a shortcut label into individual keycap tokens.
 *
 * Splits on modifier symbols (⌘ ⌥ ⌃ ⇧), on the boundary between an
 * alphanumeric character and an uppercase letter, and on "+" separators.
 *
 * Examples:
 *   "⌘K"      → ["⌘", "K"]
 *   "⌘⇧P"     → ["⌘", "⇧", "P"]
 *   "Ctrl+K"  → ["Ctrl", "K"]
 *
 * Single source of truth — previously duplicated in SpotlightRow and
 * HelpKeybindingsList.
 */
export function splitShortcut(label: string): string[] {
  return label.split(/(?=[⌘⌥⌃⇧])|(?<=[\w])(?=[A-Z+])|[+]/).filter(Boolean)
}
