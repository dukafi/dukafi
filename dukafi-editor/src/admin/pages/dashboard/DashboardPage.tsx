/**
 * DashboardPage — `/admin/dashboard`.
 *
 * The authenticated Dashboard workspace: products, variants, collections, CSV
 * import, and store-wide settings (see `docs/architecture/admin-store.md`).
 * Grouped sidebar (Workspace + Store) — each section is a plain, paginated
 * data table; create/edit happens in a `Dialog`, never inline.
 */
import { useParams } from '@admin/lib/routing'
import { FileTextSolidIcon } from 'pixel-art-icons/icons/file-text-solid'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import { AdminPageLayout } from '@admin/layouts/AdminPageLayout'
import { BoxStackSolidIcon } from 'pixel-art-icons/icons/box-stack-solid'
import { Grid2x22SolidIcon } from 'pixel-art-icons/icons/grid-2x2-2-solid'
import { CloudUploadSolidIcon } from 'pixel-art-icons/icons/cloud-upload-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { Settings2SolidIcon } from 'pixel-art-icons/icons/settings-2-solid'
import { ListBoxSolidIcon } from 'pixel-art-icons/icons/list-box-solid'
import { PlugSolidIcon } from 'pixel-art-icons/icons/plug-solid'
import { useCommerceData } from './hooks/useCommerceData'
import { CommandIcon } from 'pixel-art-icons/icons/command'
import { StarSolidIcon } from 'pixel-art-icons/icons/star-solid'
import { TargetSolidIcon } from 'pixel-art-icons/icons/target-solid'
import { CollectionsSection } from './sections/CollectionsSection'
import { TablesSection } from './sections/TablesSection'
import { ConnectSection } from './sections/ConnectSection'
import { ReviewsSection } from './sections/ReviewsSection'
import { ImportSection } from './sections/ImportSection'
import { OrdersSection } from './sections/OrdersSection'
import { FormsSection } from './sections/FormsSection'
import { PluginsSection } from './sections/PluginsSection'
import { DiscountsSection } from './sections/DiscountsSection'
import { ProductsSection } from './sections/ProductsSection'
import { SettingsSection } from './sections/SettingsSection'
import { ThemesSection } from './sections/ThemesSection'
import { LaunchChecklist } from './sections/LaunchChecklist'
import { AdminAppSidebar, type AdminAppSidebarItem } from '@admin/shared/AdminAppSidebar'
import { useAdminUi } from '@admin/state/adminUi'
import type { CommerceSection } from './types'
import styles from './DashboardPage.module.css'

const SECTION_LABELS: Record<CommerceSection, string> = {
  products: 'Products',
  collections: 'Collections',
  tables: 'Tables',
  orders: 'Orders',
  discounts: 'Discounts',
  forms: 'Forms',
  plugins: 'Plugins',
  import: 'Import',
  reviews: 'Reviews',
  connect: 'Connect',
  themes: 'Themes',
  settings: 'Settings',
}

const SECTION_ICONS = {
  products: PackageSolidIcon,
  collections: BoxStackSolidIcon,
  tables: Grid2x22SolidIcon,
  orders: ListBoxSolidIcon,
  discounts: TargetSolidIcon,
  forms: FileTextSolidIcon,
  plugins: PlugSolidIcon,
  import: CloudUploadSolidIcon,
  reviews: StarSolidIcon,
  connect: CommandIcon,
  themes: Grid2x22SolidIcon,
  settings: Settings2SolidIcon,
} satisfies Record<CommerceSection, typeof PackageSolidIcon>

const SECTIONS: CommerceSection[] = ['products', 'collections', 'tables', 'orders', 'discounts', 'forms', 'themes', 'plugins', 'import', 'reviews', 'connect', 'settings']

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
  const siteName = useAdminUi((s) => s.siteName)

  const storeItems: AdminAppSidebarItem[] = SECTIONS.map((item) => ({
    id: item,
    label: SECTION_LABELS[item],
    icon: SECTION_ICONS[item],
    href: `/admin/dashboard/${item}`,
    active: section === item,
    testId: `dashboard-nav-${item}`,
  }))

  return (
    <AdminPageLayout workspace="dashboard" mode="workspace">
      <div className={styles.workspace}>
        <aside className={styles.workspaceSidebar} aria-label="Dashboard workspace">
          <AdminAppSidebar
            workspace="dashboard"
            brand={siteName}
            groups={[{ id: 'store', label: 'Store', items: storeItems }]}
          />
        </aside>

        <div className={styles.workspaceContent} aria-labelledby="dashboard-title">
          <h1 id="dashboard-title" className={styles.visuallyHidden}>{SECTION_LABELS[section]}</h1>
          {section === 'products' && <LaunchChecklist data={data} navigate={navigate} />}
          {section === 'products' && <ProductsSection data={data} />}
          {section === 'orders' && <OrdersSection data={data} />}
          {section === 'discounts' && <DiscountsSection data={data} />}
          {section === 'forms' && <FormsSection />}
          {section === 'plugins' && <PluginsSection data={data} />}
          {section === 'collections' && <CollectionsSection data={data} />}
          {section === 'tables' && <TablesSection />}
          {section === 'import' && <ImportSection data={data} />}
          {section === 'reviews' && <ReviewsSection data={data} />}
          {section === 'connect' && <ConnectSection />}
          {section === 'themes' && <ThemesSection />}
          {section === 'settings' && <SettingsSection />}
        </div>
      </div>
    </AdminPageLayout>
  )
}
