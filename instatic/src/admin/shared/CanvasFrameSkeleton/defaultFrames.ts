// Mirrors the canonical default viewport widths without importing the
// page-tree runtime into the eager Site shell's loading fallback.
export const DEFAULT_CANVAS_FRAME_SKELETON_BREAKPOINTS = [
  { id: 'mobile', width: 375 },
  { id: 'tablet', width: 768 },
  { id: 'desktop', width: 1440 },
] as const
