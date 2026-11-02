// Admin space (A1–A4): two tabs — the lutin studio and the sales. Owns the
// tab selection and the inventory shared by both tabs: the studio feeds it
// (each saved lutin joins it), the sales form consumes it.

import { useState } from 'react'
import { SalesTab } from './admin/SalesTab'
import { StudioTab } from './admin/StudioTab'
import { useAdminInventory } from './admin/useAdminInventory'
import { ADMIN_TEXT, PAGE_TEXT } from '../ui/strings'
import './admin/admin.css'

type AdminTab = 'studio' | 'sales'

const STUDIO_TAB_ID = 'admin-tab-studio'
const SALES_TAB_ID = 'admin-tab-sales'
const STUDIO_PANEL_ID = 'admin-panel-studio'
const SALES_PANEL_ID = 'admin-panel-sales'

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('studio')
  const inventory = useAdminInventory()

  return (
    <section className="page">
      <h1>{PAGE_TEXT.admin.title}</h1>
      <p className="page-intro">{PAGE_TEXT.admin.intro}</p>
      <div className="admin-tabs" role="tablist" aria-label={ADMIN_TEXT.tabsLabel}>
        <button
          type="button"
          id={STUDIO_TAB_ID}
          role="tab"
          aria-selected={tab === 'studio'}
          aria-controls={STUDIO_PANEL_ID}
          className={`admin-tab${tab === 'studio' ? ' is-active' : ''}`}
          onClick={() => setTab('studio')}
        >
          {ADMIN_TEXT.studioTab}
        </button>
        <button
          type="button"
          id={SALES_TAB_ID}
          role="tab"
          aria-selected={tab === 'sales'}
          aria-controls={SALES_PANEL_ID}
          className={`admin-tab${tab === 'sales' ? ' is-active' : ''}`}
          onClick={() => setTab('sales')}
        >
          {ADMIN_TEXT.salesTab}
        </button>
      </div>
      <div
        role="tabpanel"
        id={tab === 'studio' ? STUDIO_PANEL_ID : SALES_PANEL_ID}
        aria-labelledby={tab === 'studio' ? STUDIO_TAB_ID : SALES_TAB_ID}
      >
        {tab === 'studio' ? (
          <StudioTab onLutinCreated={inventory.reload} />
        ) : (
          <SalesTab inventory={inventory} />
        )}
      </div>
    </section>
  )
}
