import { HeadingIcon } from 'pixel-art-icons/icons/heading'
import type { ImportFontToken } from '@core/siteImport'
import styles from './AnalyzeStep.module.css'

interface FontTokenRowsProps {
  tokens: ImportFontToken[]
}

export function FontTokenRows({ tokens }: FontTokenRowsProps) {
  return (
    <>
      {tokens.map((token) => (
        <div className={styles.listRow} key={token.variable}>
          <span className={styles.listIcon}>
            <HeadingIcon size={14} />
          </span>
          <div className={styles.info}>
            <span className={styles.title}>{token.name}</span>
            <span className={styles.meta}>--{token.variable}</span>
          </div>
        </div>
      ))}
    </>
  )
}
