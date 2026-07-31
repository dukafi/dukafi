/**
 * Class composition helper for the instatic.
 *
 * Joins truthy strings into a single space-separated className.
 * Falsy values (false / null / undefined) are dropped so callers can
 * use boolean short-circuits: cn(styles.foo, isActive && styles.active)
 *
 * In-house: NO external dependency. This codebase uses CSS Modules,
 * not Tailwind — there is no need for clsx, tailwind-merge, or cva.
 */
type ClassName = string | false | null | undefined

export function cn(...inputs: ClassName[]): string {
  return inputs.filter(Boolean).join(' ')
}
