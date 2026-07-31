/**
 * alignmentOptions — the axis-aware icon option sets shared by the Flex
 * `AlignmentControl` and the Grid `GridAxisControl`.
 *
 * The icon set is keyed off the *main-axis* orientation:
 *   - direction: row | row-reverse        → main is horizontal, cross is vertical
 *   - direction: column | column-reverse  → main is vertical,   cross is horizontal
 * Both MAIN and CROSS arrays are named after the direction items flow
 * (i.e. the main axis), so callers just pick the matching pair.
 *
 * The same `flex-start | center | flex-end | stretch | baseline` value
 * keywords work in both flex and grid containers per CSS Box Alignment
 * Module 3, so keeping these arrays in one place is what lets Flex and Grid
 * speak the same visual language.
 */

import { ArrowsHorizontalIcon } from 'pixel-art-icons/icons/arrows-horizontal'
import { ArrowsVerticalIcon } from 'pixel-art-icons/icons/arrows-vertical'
import { AlignStartHorizontalSolidIcon } from 'pixel-art-icons/icons/align-start-horizontal-solid'
import { AlignCenterHorizontalSolidIcon } from 'pixel-art-icons/icons/align-center-horizontal-solid'
import { AlignEndHorizontalSolidIcon } from 'pixel-art-icons/icons/align-end-horizontal-solid'
import { AlignStartVerticalSolidIcon } from 'pixel-art-icons/icons/align-start-vertical-solid'
import { AlignCenterVerticalSolidIcon } from 'pixel-art-icons/icons/align-center-vertical-solid'
import { AlignEndVerticalSolidIcon } from 'pixel-art-icons/icons/align-end-vertical-solid'
import { AlignHorizontalSpaceBetweenSolidIcon } from 'pixel-art-icons/icons/align-horizontal-space-between-solid'
import { AlignHorizontalSpaceAroundSolidIcon } from 'pixel-art-icons/icons/align-horizontal-space-around-solid'
import { AlignVerticalSpaceBetweenSolidIcon } from 'pixel-art-icons/icons/align-vertical-space-between-solid'
import { AlignVerticalSpaceAroundSolidIcon } from 'pixel-art-icons/icons/align-vertical-space-around-solid'
import { UnderlineIcon } from 'pixel-art-icons/icons/underline'

/**
 * Cross-axis (alignItems) icon set when items flow horizontally — items align
 * along the vertical (cross) axis. The horizontal-row icon family expresses
 * "horizontal items aligned to start/center/end of their vertical track."
 */
export const CROSS_HORIZONTAL_OPTIONS = [
  {
    value: 'flex-start',
    icon: <AlignStartHorizontalSolidIcon size={14} />,
    ariaLabel: 'Align start',
    tooltip: 'align-items: flex-start',
  },
  {
    value: 'center',
    icon: <AlignCenterHorizontalSolidIcon size={14} />,
    ariaLabel: 'Align center',
    tooltip: 'align-items: center',
  },
  {
    value: 'flex-end',
    icon: <AlignEndHorizontalSolidIcon size={14} />,
    ariaLabel: 'Align end',
    tooltip: 'align-items: flex-end',
  },
  {
    value: 'stretch',
    icon: <ArrowsVerticalIcon size={14} />,
    ariaLabel: 'Align stretch',
    tooltip: 'align-items: stretch',
  },
  {
    value: 'baseline',
    icon: <UnderlineIcon size={14} />,
    ariaLabel: 'Align baseline',
    tooltip: 'align-items: baseline',
  },
] as const

/** Cross-axis when items flow vertically — items align along the horizontal axis. */
export const CROSS_VERTICAL_OPTIONS = [
  {
    value: 'flex-start',
    icon: <AlignStartVerticalSolidIcon size={14} />,
    ariaLabel: 'Align start',
    tooltip: 'align-items: flex-start',
  },
  {
    value: 'center',
    icon: <AlignCenterVerticalSolidIcon size={14} />,
    ariaLabel: 'Align center',
    tooltip: 'align-items: center',
  },
  {
    value: 'flex-end',
    icon: <AlignEndVerticalSolidIcon size={14} />,
    ariaLabel: 'Align end',
    tooltip: 'align-items: flex-end',
  },
  {
    value: 'stretch',
    icon: <ArrowsHorizontalIcon size={14} />,
    ariaLabel: 'Align stretch',
    tooltip: 'align-items: stretch',
  },
  {
    value: 'baseline',
    icon: <UnderlineIcon size={14} />,
    ariaLabel: 'Align baseline',
    tooltip: 'align-items: baseline',
  },
] as const

/**
 * Main-axis (justifyContent) icon set when items flow horizontally — they
 * justify along the horizontal axis.
 *
 * The first three values (flex-start / center / flex-end) reuse the same
 * alignment-line icons that Grid's Justify control uses for its
 * `justify-items` segments, so the visual language stays consistent across
 * Flex and Grid for the values both layouts share. The flex-only
 * `space-between` / `space-around` keep the distribution-style icons since
 * Grid's `justify-items` has no equivalent.
 */
export const MAIN_HORIZONTAL_OPTIONS = [
  {
    value: 'flex-start',
    icon: <AlignStartVerticalSolidIcon size={14} />,
    ariaLabel: 'Justify start',
    tooltip: 'justify-content: flex-start',
  },
  {
    value: 'center',
    icon: <AlignCenterVerticalSolidIcon size={14} />,
    ariaLabel: 'Justify center',
    tooltip: 'justify-content: center',
  },
  {
    value: 'flex-end',
    icon: <AlignEndVerticalSolidIcon size={14} />,
    ariaLabel: 'Justify end',
    tooltip: 'justify-content: flex-end',
  },
  {
    value: 'space-between',
    icon: <AlignHorizontalSpaceBetweenSolidIcon size={14} />,
    ariaLabel: 'Space between',
    tooltip: 'justify-content: space-between',
  },
  {
    value: 'space-around',
    icon: <AlignHorizontalSpaceAroundSolidIcon size={14} />,
    ariaLabel: 'Space around',
    tooltip: 'justify-content: space-around',
  },
] as const

/** Main-axis when items flow vertically — they justify along the vertical axis. */
export const MAIN_VERTICAL_OPTIONS = [
  {
    value: 'flex-start',
    icon: <AlignStartHorizontalSolidIcon size={14} />,
    ariaLabel: 'Justify start',
    tooltip: 'justify-content: flex-start',
  },
  {
    value: 'center',
    icon: <AlignCenterHorizontalSolidIcon size={14} />,
    ariaLabel: 'Justify center',
    tooltip: 'justify-content: center',
  },
  {
    value: 'flex-end',
    icon: <AlignEndHorizontalSolidIcon size={14} />,
    ariaLabel: 'Justify end',
    tooltip: 'justify-content: flex-end',
  },
  {
    value: 'space-between',
    icon: <AlignVerticalSpaceBetweenSolidIcon size={14} />,
    ariaLabel: 'Space between',
    tooltip: 'justify-content: space-between',
  },
  {
    value: 'space-around',
    icon: <AlignVerticalSpaceAroundSolidIcon size={14} />,
    ariaLabel: 'Space around',
    tooltip: 'justify-content: space-around',
  },
] as const
