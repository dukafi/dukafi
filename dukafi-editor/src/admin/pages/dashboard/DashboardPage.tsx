/**
 * DashboardPage — `/admin/dashboard`.
 *
 * The authenticated Dashboard workspace: products, variants, collections, CSV
 * import, and store-wide settings (see `docs/architecture/admin-store.md`).
 * Left sidebar section nav (`AdminPageLayout`'s `workspace` mode, same shell
 * shape as the AI workspace) — each section is a plain, paginated data
 * table; create/edit happens in a `Dialog`, never inline.
 */
import { useParams } from '@admin/lib/routing'
import { FileTextSolidIcon } from 'pixel-art-icons/icons/file-text-solid'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import { Button } from '@ui/components/Button'
import { AdminPageLayout } from '@admin/layouts/AdminPageLayout'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { Settings2SolidIcon } from 'pixel-art-icons/icons/settings-2-solid'
import { ListBoxSolidIcon } from 'pixel-art-icons/icons/list-box-solid'
import { PlugSolidIcon } from 'pixel-art-icons/icons/plug-solid'
import { useCommerceData } from './hooks/useCommerceData'
import { CollectionsSection } from './sections/CollectionsSection'
import { ImportSection } from './sections/ImportSection'
import { OrdersSection } from './sections/OrdersSection'
import { FormsSection } from './sections/FormsSection'
import { PluginsSection } from './sections/PluginsSection'
import { ProductsSection } from './sections/ProductsSection'
import { SettingsSection } from './sections/SettingsSection'
import type { CommerceSection } from './types'
import styles from './DashboardPage.module.css'

const SECTION_LABELS: Record<CommerceSection, string> = {
  products: 'Products',
  collections: 'Collections',
  orders: 'Orders',
  forms: 'Forms',
  plugins: 'Plugins',
  import: 'Import',
  settings: 'Settings',
}

const SECTION_ICONS = {
  products: PackageSolidIcon,
  collections: BoxStackSolidIcon,
  orders: ListBoxSolidIcon,
  forms: FileTextSolidIcon,
  plugins: PlugSolidIcon,
  import: CloudUploadSolidIcon,
  settings: Settings2SolidIcon,
} satisfies Record<CommerceSection, typeof PackageSolidIcon>

const SECTIONS: CommerceSection[] = ['products', 'collections', 'orders', 'forms', 'plugins', 'import', 'settings']

/** `products` is the landing area; anything unrecognised falls back to it. */
export function sectionFromParam(value: string | undefined): CommerceSection {
  return SECTIONS.includes(value as CommerceSection) ? (value as CommerceSection) : 'products'
}

export function DashboardPage() {
  // The area lives in the URL, not in component state: each Commerce area is
  // its own page, so it can be linked to, bookmarked, and reached with the
  // back button. `/admin/dashboard` alone means Products.
  const { dashboardSection } = useParams()
  const section = sectionFromParam(dashboardSection)
  const navigate = useAdminNavigate()
  const data = useCommerceData()

  return (
    <AdminPageLayout workspace="dashboard" mode="workspace">
      <div className={styles.workspace}>
        <aside className={styles.workspaceSidebar} aria-label="Dashboard workspace">
          <div className={styles.workspaceIdentity}>
            <h1 id="dashboard-title">Dashboard</h1>
            <p>Products, collections, and imports.</p>
          </div>

          <nav className={styles.workspaceNavigation} aria-label="Dashboard sections">
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
                  onClick={() => navigate(`/admin/dashboard/${item}`)}
                  aria-current={section === item ? 'page' : undefined}
                  data-testid={`dashboard-nav-${item}`}
                  className={styles.workspaceNavigationButton}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{SECTION_LABELS[item]}</span>
                </Button>
              )
            })}
          </nav>
        </aside>

        <div className={styles.workspaceContent} aria-labelledby="dashboard-title">
          {section === 'products' && <ProductsSection data={data} />}
          {section === 'orders' && <OrdersSection data={data} />}
          {section === 'forms' && <FormsSection />}
          {section === 'plugins' && <PluginsSection data={data} />}
          {section === 'collections' && <CollectionsSection data={data} />}
          {section === 'import' && <ImportSection data={data} />}
          {section === 'settings' && <SettingsSection />}
        </div>
      </div>
    </AdminPageLayout>
  )
}
