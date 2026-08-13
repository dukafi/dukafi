/**
 * PasteBlockModal — paste a `.dukafy-block.json` subtree and SEE it before it
 * lands.
 *
 * Importing a block from a file is blind: you pick `card.json` and something
 * appears. A block is not markup though — it carries bindings, cart verbs,
 * live-region markers and render conditions, and none of those are visible in
 * the canvas until you click the right node. So this parses as you type and
 * reports what the block actually contains, which is the difference between
 * "9 nodes" and "9 nodes, 2 cart actions, a live region, 3 conditions".
 *
 * Parsing is the preview. `parseBlockExport` is the same function the insert
 * path uses, so what the summary describes is exactly what will be inserted —
 * there is no second, drifting description of the file.
 */

import { useMemo, useState } from 'react'
import { parseBlockExport, type DukafyBlockExportFile } from '@core/page-tree'
import { Dialog } from '@ui/components/Dialog'
import { Button } from '@ui/components/Button'
import styles from './PasteBlockModal.module.css'

interface PasteBlockModalProps {
  open: boolean
  onClose: () => void
  /** Insert the parsed block. Returns the new root id, or null if it failed. */
  onInsert: (block: DukafyBlockExportFile) => string | null
}

interface BlockSummary {
  nodeCount: number
  moduleCount: number
  bindings: number
  actions: number
  regions: number
  conditions: number
  loops: number
  classes: number
}

function summarise(block: DukafyBlockExportFile): BlockSummary {
  const nodes = Object.values(block.block.nodes)
  let bindings = 0
  let actions = 0
  let regions = 0
  let conditions = 0
  let loops = 0
  for (const node of nodes) {
    bindings += Object.keys(node.dynamicBindings ?? {}).length
    if (node.actions?.click) actions += 1
    if (node.actions?.region) regions += 1
    if (node.visibleWhen) conditions += 1
    if (node.moduleId === 'store.relationship-loop' || node.moduleId === 'store.collection-loop') loops += 1
  }
  return {
    nodeCount: nodes.length,
    moduleCount: new Set(nodes.map((n) => n.moduleId)).size,
    bindings,
    actions,
    regions,
    conditions,
    loops,
    classes: Object.keys(block.block.classes).length,
  }
}

/** Only the parts that are actually present — an all-zero list tells you nothing. */
function summaryRows(summary: BlockSummary): Array<[string, number]> {
  return ([
    ['Nodes', summary.nodeCount],
    ['Module types', summary.moduleCount],
    ['Loops', summary.loops],
    ['Data bindings', summary.bindings],
    ['Cart actions', summary.actions],
    ['Live regions', summary.regions],
    ['Render conditions', summary.conditions],
    ['Styles', summary.classes],
  ] as Array<[string, number]>).filter(([, value]) => value > 0)
}

export function PasteBlockModal({ open, onClose, onInsert }: PasteBlockModalProps) {
  const [text, setText] = useState('')

  // Parse on every keystroke. The file is small and `parseBlockExport` is
  // pure, so this is cheaper than the debounce would be to reason about.
  const parsed = useMemo(() => {
    const trimmed = text.trim()
    if (!trimmed) return { block: null as DukafyBlockExportFile | null, error: '' }
    let raw: unknown
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return { block: null, error: 'That isn’t valid JSON.' }
    }
    const block = parseBlockExport(raw)
    if (!block) {
      return {
        block: null,
        error: 'Valid JSON, but not a Dukafy block — expected a file with "dukafyExport": "block".',
      }
    }
    return { block, error: '' }
  }, [text])

  function handleClose() {
    setText('')
    onClose()
  }

  function handleInsert() {
    if (!parsed.block) return
    if (onInsert(parsed.block)) handleClose()
  }

  const summary = parsed.block ? summaryRows(summarise(parsed.block)) : []

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Paste a block"
      eyebrow="Import"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!parsed.block}
            tooltip={parsed.block ? undefined : 'Paste a Dukafy block first'}
            onClick={handleInsert}
          >
            Insert block
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <label className={styles.label} htmlFor="paste-block-json">
          Block JSON
        </label>
        <textarea
          id="paste-block-json"
          className={styles.input}
          value={text}
          spellCheck={false}
          placeholder={'{\n  "dukafyExport": "block",\n  ...\n}'}
          onChange={(event) => setText(event.currentTarget.value)}
        />

        {parsed.error && <p className={styles.error} role="alert">{parsed.error}</p>}

        {parsed.block && (
          <div className={styles.preview} data-testid="paste-block-preview">
            <p className={styles.previewTitle}>{parsed.block.block.name}</p>
            <dl className={styles.stats}>
              {summary.map(([label, value]) => (
                <div key={label} className={styles.stat}>
                  <dt className={styles.statLabel}>{label}</dt>
                  <dd className={styles.statValue}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Dialog>
  )
}
