/**
 * CommercePage — `/admin/commerce`.
 *
 * The authenticated Commerce workspace: products, variants, collections, and
 * CSV import (see `docs/architecture/admin-store.md`). Laid out the same way
 * as the AI workspace — a fixed identity + section-nav sidebar via
 * `AdminPageLayout`'s `workspace` mode, with each section owning its own
 * master-detail canvas.
 */
import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { AdminPageLayout } from '@admin/layouts/AdminPageLayout'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { useCommerceData } from './hooks/useCommerceData'
import { CollectionsSection } from './sections/CollectionsSection'
import { ImportSection } from './sections/ImportSection'
import { ProductsSection } from './sections/ProductsSection'
import type { CommerceSection } from './types'
import styles from './CommercePage.module.css'

const SECTION_LABELS: Record<CommerceSection, string> = {
  products: 'Products',
  collections: 'Collections',
  import: 'Import',
}

const SECTION_ICONS = {
  products: PackageSolidIcon,
  collections: BoxStackSolidIcon,
  import: CloudUploadSolidIcon,
} satisfies Record<CommerceSection, typeof PackageSolidIcon>

const SECTIONS: CommerceSection[] = ['products', 'collections', 'import']

export function CommercePage() {
  const [section, setSection] = useState<CommerceSection>('products')
  const data = useCommerceData()

  return (
    <AdminPageLayout workspace="commerce" mode="workspace">
      <div className={styles.workspace}>
        <aside className={styles.workspaceSidebar} aria-label="Commerce workspace">
          <div className={styles.workspaceIdentity}>
            <h1 id="commerce-title">Commerce</h1>
            <p>Products, collections, and imports.</p>
          </div>

          <nav className={styles.workspaceNavigation} aria-label="Commerce sections">
            {SECTIONS.map((item) => {
              const Icon = SECTION_ICONS[item]
              return (
                <Button
                  key={item}
                  type="button"
                  variant={section === item ? 'secondary' : 'ghost'}
                  size="md"
                  align="start"
                  fullWidth
                  active={section === item}
                  onClick={() => setSection(item)}
                  aria-current={section === item ? 'page' : undefined}
                  data-testid={`commerce-nav-${item}`}
                  className={styles.workspaceNavigationButton}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{SECTION_LABELS[item]}</span>
                </Button>
              )
            })}
          </nav>
        </aside>

        <div className={styles.workspaceContent} aria-labelledby="commerce-title">
          {section === 'products' && <ProductsSection data={data} />}
          {section === 'collections' && <CollectionsSection data={data} />}
          {section === 'import' && <ImportSection data={data} />}
        </div>
      </div>
    </AdminPageLayout>
  )
}
