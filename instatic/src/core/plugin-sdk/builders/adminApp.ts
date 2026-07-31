/**
 * `definePluginAdminApp` — type-safe plugin admin app entrypoint.
 *
 *   import { definePluginAdminApp } from '@instatic/plugin-sdk'
 *   import { Stack, Heading, Button, Card, Text } from '@instatic/host-ui'
 *   import { useState } from 'react'
 *
 *   export default definePluginAdminApp(function Dashboard() {
 *     const [count, setCount] = useState(0)
 *     return (
 *       <Card>
 *         <Stack gap={12}>
 *           <Heading level={2}>Counter</Heading>
 *           <Text variant="muted">Total clicks: {count}</Text>
 *           <Button variant="primary" onClick={() => setCount(count + 1)}>
 *             Increment
 *           </Button>
 *         </Stack>
 *       </Card>
 *     )
 *   })
 *
 * What plugins get:
 *
 *   • Real React + JSX. `import { useState } from 'react'`.
 *   • `@instatic/host-ui` for design-system primitives (Button, Stack, …).
 *   • `@instatic/host-hooks` for editor / settings / routes hooks.
 *
 * The plugin's bundle externalizes those names — at runtime the browser's
 * import map resolves them to the host's React instance and design system,
 * so plugin bundles stay tiny and there's only ever one React per page.
 *
 * The admin page descriptor is passed as a prop so plugin code that
 * wants to read its own `page.pluginSettings` snapshot can do so without
 * a hook round-trip.
 */

import type { ComponentType } from 'react'
import type { PluginAdminPageRoute } from '../types'

export interface PluginAdminAppProps {
  /** Page descriptor the host built when routing to this admin app. */
  page: PluginAdminPageRoute
}

export type PluginAdminAppComponent = ComponentType<PluginAdminAppProps>

/**
 * Identity wrapper — gives plugin authors a typed React component for
 * their default export without any runtime cost. The host's admin
 * loader expects `mod.default` to be a `PluginAdminAppComponent`.
 */
export function definePluginAdminApp(
  Component: PluginAdminAppComponent,
): PluginAdminAppComponent {
  return Component
}

// ---------------------------------------------------------------------------
// Type-only re-exports for plugin authors who want to share prop shapes.
// These mirror the host-ui prop interfaces — kept here as a stable contract
// surface alongside the SDK builders.
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'

export interface PluginUiButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  fullWidth?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  type?: 'button' | 'submit' | 'reset'
  ariaLabel?: string
  children?: ReactNode
}

export interface PluginUiInputProps {
  label?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'url' | 'number' | 'search'
  invalid?: boolean
  disabled?: boolean
  required?: boolean
  prefix?: string
  unit?: string
  description?: string
  onChange?: (value: string) => void
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
}

export interface PluginUiTextareaProps {
  label?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  rows?: number
  invalid?: boolean
  disabled?: boolean
  required?: boolean
  description?: string
  onChange?: (value: string) => void
}

export interface PluginUiSelectProps<T extends string = string> {
  label?: string
  value?: T
  description?: string
  disabled?: boolean
  options: ReadonlyArray<{ label: string; value: T; disabled?: boolean }>
  onChange?: (value: T) => void
}

export interface PluginUiSwitchProps {
  label?: string
  checked?: boolean
  description?: string
  disabled?: boolean
  onChange?: (next: boolean) => void
}

export interface PluginUiCheckboxProps {
  label?: string
  checked?: boolean
  description?: string
  disabled?: boolean
  onChange?: (next: boolean) => void
}

export interface PluginUiSearchBarProps {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
}

export interface PluginUiStackProps {
  gap?: number
  direction?: 'row' | 'column'
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  wrap?: boolean
  /**
   * Fixed height of the flex container. Useful when children use
   * `margin-top: auto` (e.g. chart primitives) to push themselves to the
   * bottom of a column Stack. Accepts a pixel count (`180` → `"180px"`)
   * or any CSS length string (`"100%"`, `"12rem"`).
   */
  height?: number | string
  children?: ReactNode
}

export interface PluginUiCardProps {
  padding?: number
  bordered?: boolean
  children?: ReactNode
}

export interface PluginUiHeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6
  children?: ReactNode
}

export interface PluginUiTextProps {
  variant?: 'default' | 'muted' | 'strong' | 'mono'
  size?: 'sm' | 'md' | 'lg'
  children?: ReactNode
}

export interface PluginUiSeparatorProps {
  orientation?: 'horizontal' | 'vertical'
}

export interface PluginUiEmptyStateProps {
  title: string
  body?: string
  action?: ReactNode
}

export interface PluginUiAlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children?: ReactNode
}

export interface PluginUiCodeProps {
  children?: ReactNode
}
