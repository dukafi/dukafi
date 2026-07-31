/**
 * Public contract between `FrameworkScalePanel` and its consumers
 * (`TypographyPanel`, `SpacingPanel`).
 *
 * The two consumer panels share an identical visual shell — tab row, mode
 * toggle, fluid/manual editors, class generator — and differ only in:
 *   - what numeric "base size" field they edit (`fontSize` vs `size`),
 *   - their default scale ratio options,
 *   - the rendered preview (text vs spacing bar),
 *   - the supported CSS properties in the Class Generator.
 *
 * Those differences flow through this adapter so the panel itself stays
 * rendering-agnostic.
 */

import type { IconComponent } from 'pixel-art-icons/types'
import type { useEditorStore } from '@site/store/store'
import type {
  FrameworkScaleManualSize,
  FrameworkSpacingClassGenerator,
  FrameworkSpacingGroup,
  FrameworkTypographyClassGenerator,
  FrameworkTypographyGroup,
} from '@core/framework-schema'

export type GroupShape = FrameworkTypographyGroup | FrameworkSpacingGroup
export type GeneratorShape =
  | FrameworkTypographyClassGenerator
  | FrameworkSpacingClassGenerator

export interface ScaleAdapter<G, C> {
  /** Public name used in the panel header and aria labels. */
  title: 'Typography' | 'Spacing'
  /** Stable id passed to PanelHeader. */
  panelId: 'typography' | 'spacing'
  /** Read the active group list from the store. */
  selectGroups: (state: ReturnType<typeof useEditorStore.getState>) => G[]
  /** Read the class generators list from the store. */
  selectClasses: (state: ReturnType<typeof useEditorStore.getState>) => C[]
  /** Read the disabled flag from the store. */
  selectIsDisabled: (state: ReturnType<typeof useEditorStore.getState>) => boolean
  /** Numeric ratio options shown in the min/max scale selectors. */
  ratioOptions: ReadonlyArray<{ value: string; label: string }>
  /** Available kebab-case CSS properties for the Class Generator. */
  classGeneratorProperties: ReadonlyArray<{ value: string; label: string }>
  /** Fluid-min / fluid-max field label ("Min Font Size" vs "Min Size"). */
  baseSizeLabel: string
  /** Read the base size from a group min/max breakpoint config. */
  readBaseSize: (group: G, side: 'min' | 'max') => number
  /** Patch the base size on a group min/max breakpoint config. */
  patchBaseSize: (side: 'min' | 'max', value: number) => Record<string, unknown>
  /**
   * Render the per-step preview for a single breakpoint.
   * Used as the default visualization when `renderStepBody` is not supplied.
   */
  renderPreview: (sizePx: number) => React.ReactNode
  /**
   * Optional richer per-step visualization. When supplied, replaces the simple
   * two-column min/max preview row with whatever the adapter returns. Receives
   * both endpoints and the largest size in the entire scale so adapters can
   * draw proportional charts.
   */
  renderStepBody?: (args: {
    minPx: number
    maxPx: number
    maxInScale: number
    stepLabel: string
    variableName: string
  }) => React.ReactNode
  /**
   * Optional unified visualisation rendered ONCE above the per-step list.
   * Receives the full series so an adapter can draw a single stream / area /
   * line chart that spans the entire scale, instead of (or in addition to)
   * the per-step rows. Useful for showing how min and max grow across the
   * whole scale at a glance.
   */
  renderChart?: (args: {
    points: Array<{
      stepLabel: string
      variableName: string
      minPx: number
      maxPx: number
      /** True when this step's index matches the group's baseScaleIndex —
       * i.e. the step whose value equals the user-configured min/max base
       * size verbatim. Adapters use this to highlight the base in the chart. */
      isBase: boolean
    }>
    maxInScale: number
    /** Index of the base step in the points array (mirrors `isBase`). */
    baseStepIndex: number
    /**
     * Step add/remove callbacks. Wired up by the FluidEditor so an adapter can
     * embed `+ / −` buttons directly in the chart card (when the chart fully
     * replaces the per-step list, the controls have to live somewhere).
     */
    onPrependStep: () => void
    onAppendStep: () => void
    onRemoveFirstStep: () => void
    onRemoveLastStep: () => void
    canRemoveStep: boolean
  }) => React.ReactNode
  /**
   * Optional legend rendered at the bottom of the step list. Useful when
   * `renderStepBody` / `renderChart` introduce colour-coded series that
   * need a key.
   */
  chartLegend?: React.ReactNode
  /** Action to toggle the disabled flag. */
  onToggleDisabled: () => void
  /** Create a new group / tab. Returns the new group. */
  onCreateGroup: () => G
  /** Update fields on an existing group. */
  onUpdateGroup: (groupId: string, patch: Record<string, unknown>) => void
  /** Duplicate / reset / delete on a group. */
  onDuplicateGroup: (groupId: string) => G | null
  onResetGroup: (groupId: string) => void
  onDeleteGroup: (groupId: string) => void
  /** Update a manual size entry on a group. */
  onUpsertManualSize: (
    groupId: string,
    sizeId: string,
    patch: Partial<FrameworkScaleManualSize>,
  ) => void
  /** Replace the whole class-generators list. */
  onSetClassGenerators: (next: C[]) => void
  /**
   * Icon shown in the "Scales" Section header. Conventionally the same icon
   * the panel rail uses for this family — `text-start-t` for typography,
   * `ruler-dimension` for spacing — so the rail → panel → section chain
   * shares a consistent visual identity.
   */
  scalesSectionIcon?: IconComponent
  /**
   * Optional extra collapsible sections rendered alongside the built-in
   * "Scales" + "Utilities" sections. Used by TypographyPanel to host the
   * "Fonts" section (Google + custom font library). Each entry is its own
   * Section with its own collapse state.
   *
   * `position`: 'top' renders BEFORE the built-in Scales section (e.g. fonts
   *   live above scales for typography). 'bottom' renders AFTER Utilities
   *   (the original behaviour). Default: 'bottom'.
   *
   * The render callback receives the currently active scale group, or `null`
   * when there are no scales (the Fonts library is independent of scales —
   * the user can still install fonts before any scale exists, and the module
   * being disabled doesn't disable the fonts library either).
   */
  extraSections?: ReadonlyArray<{
    id: string
    title: string
    icon?: IconComponent
    defaultOpen?: boolean
    position?: 'top' | 'bottom'
    render: (group: G | null) => React.ReactNode
  }>
}
