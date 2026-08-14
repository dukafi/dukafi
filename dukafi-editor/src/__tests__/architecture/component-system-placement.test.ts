/**
 * Architecture Source-Scan — Phase 4 Component-System Placement Gate
 *
 * Locks down the three component-placement flows introduced in Phase 4.
 * Every flow that inserts a `base.visual-component-ref` node MUST route
 * through the shared `insertComponentRef` action in siteSlice.ts.
 * Direct calls to `insertNode` or `addNodeToVc` with the literal moduleId
 * `'base.visual-component-ref'` are forbidden in placement-flow files —
 * those raw mutations bypass cycle detection and the unified VC / page mode
 * dispatch that `insertComponentRef` encapsulates.
 *
 * PLACEMENT FLOWS (Phase 4):
 * 1. ModulePickerDropdown.tsx — Components category click in the toolbar picker.
 * 2. LayerNodeContextMenu.tsx — 'Insert module here' submenu click (which
 *    embeds the compact ModulePicker; picking a Visual Component flows
 *    through this file via the onSelectVC callback).
 *
 * ENFORCED CONSTRAINTS:
 * G1 — ModulePickerDropdown must call insertComponentRef for VC insertion.
 * G2 — SiteExplorerPanel must not expose a visualComponentRef drag source.
 * G3 — LayerNodeContextMenu must call insertComponentRef for VC insertion.
 * G4 — No placement file may call insertNode with 'base.visual-component-ref' directly.
 * G5 — No placement file may call addNodeToVc with 'base.visual-component-ref' directly.
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dir, '../../..')

const PICKER_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/pages/site/toolbar/ModulePickerDropdown.tsx',
)
const EXPLORER_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/pages/site/panels/SiteExplorerPanel/SiteExplorerPanel.tsx',
)
const EXPLORER_TREE_SECTION_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/pages/site/panels/SiteExplorerPanel/SiteExplorerTreeSection.tsx',
)
const CONTEXT_MENU_PATH = resolve(
  PROJECT_ROOT,
  'src/admin/pages/site/panels/DomPanel/LayerNodeContextMenu.tsx',
)
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

/**
 * Returns true when `callFn(` appears (on a non-comment line) within
 * `windowLines` lines of the literal `'base.visual-component-ref'` or
 * `"base.visual-component-ref"`. This detects a bypass call expression
 * even when the arguments span multiple lines.
 */
function containsBypassCall(src: string, callFn: string, windowLines = 10): boolean {
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip comment lines
    if (/^\s*\/\//.test(line.trim())) continue
    if (!line.includes(`${callFn}(`)) continue

    // Scan forward in a window for the VC ref module ID literal
    const end = Math.min(lines.length, i + windowLines)
    for (let j = i; j < end; j++) {
      const scanLine = lines[j]
      if (
        scanLine.includes("'base.visual-component-ref'") ||
        scanLine.includes('"base.visual-component-ref"')
      ) {
        return true
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Gate 1 — ModulePickerDropdown must use insertComponentRef
// ---------------------------------------------------------------------------

describe('G1 — ModulePickerDropdown calls insertComponentRef for VC insertion (Phase 4)', () => {
  test('ModulePickerDropdown.tsx must reference insertComponentRef', () => {
    const src = readSource(PICKER_PATH)
    if (!src.includes('insertComponentRef')) {
      throw new Error(
        '[Phase 4 / G1] ModulePickerDropdown.tsx does not reference insertComponentRef.\n' +
        'The Components-category click must route through insertComponentRef — the single\n' +
        'shared action that handles both page-mode and VC-mode insertion with cycle detection.\n' +
        'File: src/admin/pages/site/components/Toolbar/ModulePickerDropdown.tsx',
      )
    }
    expect(src).toContain('insertComponentRef')
  })
})

// ---------------------------------------------------------------------------
// Gate 2 — SiteExplorerPanel must not be a canvas insertion drag source.
//
// Visual Components are still insertable through explicit module-picking flows.
// The Site Explorer is for opening and organizing site artifacts, so it must
// not register a visualComponentRef drag payload or a component drag handle.
// ---------------------------------------------------------------------------

describe('G2 — SiteExplorerPanel does not expose a visualComponentRef drag source', () => {
  test('SiteExplorer tree must not register component-to-canvas drag payloads', () => {
    const src = readSource(EXPLORER_TREE_SECTION_PATH)
    if (src.includes("'visualComponentRef'") || src.includes('site-explorer-component-drag-handle')) {
      throw new Error(
        '[Phase 4 / G2] Site Explorer exposes component-to-canvas dragging.\n' +
        'Component rows may open and organize Visual Components, but they must not register\n' +
        "a drag payload with kind: 'visualComponentRef' or render the canvas drag handle.\n" +
        'File: src/admin/pages/site/panels/SiteExplorerPanel/SiteExplorerTreeSection.tsx',
      )
    }
    expect(src).not.toContain("'visualComponentRef'")
    expect(src).not.toContain('site-explorer-component-drag-handle')
  })
})

// ---------------------------------------------------------------------------
// Gate 3 — LayerNodeContextMenu must use insertComponentRef
// ---------------------------------------------------------------------------

describe("G3 — LayerNodeContextMenu calls insertComponentRef for 'Insert module here' (Phase 4)", () => {
  test('LayerNodeContextMenu.tsx must reference insertComponentRef', () => {
    const src = readSource(CONTEXT_MENU_PATH)
    if (!src.includes('insertComponentRef')) {
      throw new Error(
        '[Phase 4 / G4] LayerNodeContextMenu.tsx does not reference insertComponentRef.\n' +
        "The 'Insert module here' submenu's VC-pick callback must route through\n" +
        "insertComponentRef so cycle detection and VC/page mode dispatch are\n" +
        'applied uniformly.\n' +
        'File: src/admin/pages/site/components/DomPanel/LayerNodeContextMenu.tsx',
      )
    }
    expect(src).toContain('insertComponentRef')
  })
})

// ---------------------------------------------------------------------------
// Gate 4 — No placement file may bypass insertComponentRef via insertNode
//
// insertNode(moduleId, defaults, parentId) can create any node type directly,
// including 'base.visual-component-ref'. Calling it with that moduleId in a
// placement-flow file skips cycle detection and the VC-mode path entirely.
// ---------------------------------------------------------------------------

describe("G4 — No placement file calls insertNode with 'base.visual-component-ref' directly (Phase 4)", () => {
  const FILES: [string, string][] = [
    ['ModulePickerDropdown.tsx', PICKER_PATH],
    ['SiteExplorerPanel.tsx', EXPLORER_PATH],
    ['LayerNodeContextMenu.tsx', CONTEXT_MENU_PATH],
  ]

  for (const [label, filePath] of FILES) {
    test(`${label} must not call insertNode with 'base.visual-component-ref'`, () => {
      const src = readSource(filePath)
      const hasBypass = containsBypassCall(src, 'insertNode')
      if (hasBypass) {
        throw new Error(
          `[Phase 4 / G4] ${label} calls insertNode with 'base.visual-component-ref'.\n` +
          "Use insertComponentRef(parentId, componentId) instead — it handles both VC and page\n" +
          "mode, prevents cycles, and is the single authorised entry point for VC ref insertion.\n" +
          `File: ${filePath}`,
        )
      }
      expect(hasBypass).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// Gate 5 — No placement file may bypass insertComponentRef via addNodeToVc
//
// addNodeToVc(vcId, parentNodeId, newNode) adds a pre-constructed VCNode to a
// Visual Component tree. Calling it with a node whose moduleId is
// 'base.visual-component-ref' in a placement-flow file bypasses
// insertComponentRef's cycle check and page-mode dispatch.
// ---------------------------------------------------------------------------

describe("G5 — No placement file calls addNodeToVc with 'base.visual-component-ref' directly (Phase 4)", () => {
  const FILES: [string, string][] = [
    ['ModulePickerDropdown.tsx', PICKER_PATH],
    ['SiteExplorerPanel.tsx', EXPLORER_PATH],
    ['LayerNodeContextMenu.tsx', CONTEXT_MENU_PATH],
  ]

  for (const [label, filePath] of FILES) {
    test(`${label} must not call addNodeToVc with 'base.visual-component-ref'`, () => {
      const src = readSource(filePath)
      const hasBypass = containsBypassCall(src, 'addNodeToVc')
      if (hasBypass) {
        throw new Error(
          `[Phase 4 / G5] ${label} calls addNodeToVc with 'base.visual-component-ref'.\n` +
          "Use insertComponentRef(parentId, componentId) instead — it wraps addNodeToVc\n" +
          "with cycle detection and is the single authorised entry point for VC ref insertion.\n" +
          `File: ${filePath}`,
        )
      }
      expect(hasBypass).toBe(false)
    })
  }
})
