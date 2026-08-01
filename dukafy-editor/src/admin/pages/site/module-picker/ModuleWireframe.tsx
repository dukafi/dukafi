import type { CSSProperties } from 'react'
import type { WireNode } from './moduleWireframes'
import styles from './ModuleWireframe.module.css'

interface ModuleWireframeProps {
  node: WireNode
}

export function ModuleWireframe({ node }: ModuleWireframeProps) {
  return (
    <div className={styles.frame} aria-hidden="true">
      <WireNodeView node={node} />
    </div>
  )
}

function WireNodeView({ node }: ModuleWireframeProps) {
  if (node.kind === 'lines') {
    return (
      <div className={nodeClassName(node)} style={wireStyle(node)}>
        {Array.from({ length: Math.max(1, node.count ?? 1) }, (_, index) => (
          <span key={index} className={styles.line} />
        ))}
      </div>
    )
  }

  if (node.kind === 'gap') {
    return <span className={nodeClassName(node)} style={wireStyle(node)} />
  }

  return (
    <div className={nodeClassName(node)} style={wireStyle(node)}>
      {node.kind === 'field' && node.caret ? <span className={styles.caret} /> : null}
      {node.kind === 'image' && node.play ? <span className={styles.play} /> : null}
      {node.children?.map((child, index) => (
        <WireNodeView key={`${child.kind}-${index}`} node={child} />
      ))}
    </div>
  )
}

function nodeClassName(node: WireNode): string {
  const names = [styles.node, kindClassByKind[node.kind]]
  if (node.align) names.push(alignClassByAlign[node.align])
  if (node.avatar) names.push(styles.avatar)
  if (node.bar) names.push(styles.bar)
  if (node.big) names.push(styles.big)
  if (node.card) names.push(styles.card)
  if (node.center) names.push(styles.center)
  if (node.code) names.push(styles.code)
  if (node.dashed) names.push(styles.dashed)
  if (node.link) names.push(styles.link)
  if (node.logo) names.push(styles.logo)
  if (node.message) names.push(styles.message)
  if (node.mono) names.push(styles.mono)
  if (node.solid) names.push(styles.solid)
  if (node.tip) names.push(styles.tip)
  if (node.vertical) names.push(styles.vertical)
  return names.join(' ')
}

const kindClassByKind: Record<WireNode['kind'], string> = {
  box: styles.kindBox,
  button: styles.kindButton,
  check: styles.kindCheck,
  col: styles.kindCol,
  dot: styles.kindDot,
  field: styles.kindField,
  gap: styles.kindGap,
  icon: styles.kindIcon,
  image: styles.kindImage,
  lines: styles.kindLines,
  pill: styles.kindPill,
  radio: styles.kindRadio,
  row: styles.kindRow,
  rule: styles.kindRule,
}

const alignClassByAlign: Record<NonNullable<WireNode['align']>, string> = {
  center: styles.alignCenter,
  end: styles.alignEnd,
  start: styles.alignStart,
}

function wireStyle(node: WireNode): CSSProperties {
  const style: Record<string, string> = {}
  if (node.width != null) style['--wire-w'] = `${node.width}%`
  if (node.height != null) style['--wire-h'] = `${node.height}px`
  if (node.flex != null) style['--wire-flex'] = String(node.flex)
  if (node.gap != null) style['--wire-gap'] = `${node.gap}px`
  if (node.pad != null) style['--wire-pad'] = `${node.pad}px`
  return style as CSSProperties
}
