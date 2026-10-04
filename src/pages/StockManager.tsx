import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import ProductDetailModal from '../components/ProductDetailModal'

type ViewMode = 'category' | 'brand'

export default function StockManager() {
  const [viewMode, setViewMode] = useState<ViewMode>('category')
  const [categoryData, setCategoryData] = useState<StockByCategoryItem[]>([])
  const [brandData, setBrandData] = useState<StockByBrandItem[]>([])
  const [viewProducts, setViewProducts] = useState<{ item: StockByCategoryItem | StockByBrandItem; products: (StockCategoryDetail | StockBrandDetail)[] } | null>(null)
  const [filterValue, setFilterValue] = useState<string>('all')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  useEffect(() => {
    window.electronAPI.stock.byCategory().then(setCategoryData)
    window.electronAPI.stock.byBrand().then(setBrandData)
  }, [])

  const data = viewMode === 'category' ? categoryData : brandData

  const filteredData = data.filter(item => {
    const name = viewMode === 'category'
      ? (item as StockByCategoryItem).category_name
      : (item as StockByBrandItem).brand_name
    if (filterValue !== 'all' && name !== filterValue) return false
    if (lowStockOnly && item.total_quantity > 2) return false
    return true
  })

  const totalProducts = filteredData.reduce((s, d) => s + d.product_count, 0)
  const totalQuantity = filteredData.reduce((s, d) => s + d.total_quantity, 0)
  const totalValue = filteredData.reduce((s, d) => s + d.total_value, 0)

  const getItemName = (item: StockByCategoryItem | StockByBrandItem) =>
    viewMode === 'category'
      ? (item as StockByCategoryItem).category_name
      : (item as StockByBrandItem).brand_name

  const getItemId = (item: StockByCategoryItem | StockByBrandItem) =>
    viewMode === 'category'
      ? (item as StockByCategoryItem).category_id
      : (item as StockByBrandItem).brand_id

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    setFilterValue('all')
    setViewProducts(null)
  }

  const names = [...new Set(data.map(d =>
    viewMode === 'category'
      ? (d as StockByCategoryItem).category_name
      : (d as StockByBrandItem).brand_name
  ))]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-gray-900)' }}>
          Gestion des stocks
        </h1>
      </div>

      <div style={styles.viewToggle}>
        <button
          style={{ ...styles.toggleBtn, ...(viewMode === 'category' ? styles.toggleBtnActive : {}) }}
          onClick={() => handleViewModeChange('category')}
        >
          Par catégorie
        </button>
        <button
          style={{ ...styles.toggleBtn, ...(viewMode === 'brand' ? styles.toggleBtnActive : {}) }}
          onClick={() => handleViewModeChange('brand')}
        >
          Par marque
        </button>
      </div>

      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryValue}>{totalProducts}</span>
          <span style={styles.summaryLabel}>Produits</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryValue}>{totalQuantity}</span>
          <span style={styles.summaryLabel}>Unités en stock</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryValue}>{totalValue.toLocaleString()} FCFA</span>
          <span style={styles.summaryLabel}>Valeur du stock</span>
        </div>
      </div>

      <div style={styles.filtersRow}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>
            {viewMode === 'category' ? 'Catégorie' : 'Marque'}
          </label>
          <div style={styles.selectWrapper}>
            <select
              style={styles.select}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
            >
              <option value="all">
                {viewMode === 'category' ? 'Toutes les catégories' : 'Toutes les marques'}
              </option>
              {names.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <ChevronDown size={16} style={styles.selectIcon} />
          </div>
        </div>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
            style={styles.checkbox}
          />
          Stock faible uniquement (≤ 2)
        </label>
      </div>

      <div style={styles.tableSection}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>{viewMode === 'category' ? 'Catégorie' : 'Marque'}</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Quantité</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Valeur</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Nb produits</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item) => {
              const id = getItemId(item)
              const name = getItemName(item)
              return (
                <tr key={id}>
                  <td style={styles.td}>
                    <span style={{ fontWeight: 500 }}>{name}</span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span style={{
                      ...styles.stockBadge,
                      background: item.total_quantity <= 2 ? '#fef2f2' : item.total_quantity <= 5 ? '#fffbeb' : '#f0fdf4',
                      color: item.total_quantity <= 2 ? 'var(--color-danger)' : item.total_quantity <= 5 ? 'var(--color-warning)' : 'var(--color-success)',
                    }}>
                      {item.total_quantity}
                    </span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{item.total_value.toLocaleString()} FCFA</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>{item.product_count}</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <button
                      style={styles.viewBtn}
                      onClick={async () => {
                        const id = getItemId(item)
                        if (viewMode === 'category') {
                          const products = await window.electronAPI.stock.categoryDetail(id)
                          setViewProducts({ item, products })
                        } else {
                          const products = await window.electronAPI.stock.brandDetail(id)
                          setViewProducts({ item, products })
                        }
                      }}
                    >
                      Voir
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {viewProducts && (
        <ProductDetailModal
          item={viewProducts.item}
          products={viewProducts.products}
          viewMode={viewMode}
          onClose={() => setViewProducts(null)}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  viewToggle: { display: 'flex', gap: 4, marginBottom: 20, background: 'var(--color-gray-100)', borderRadius: 'var(--radius)', padding: 4, width: 'fit-content' },
  toggleBtn: {
    padding: '8px 16px', borderRadius: 'calc(var(--radius) - 2px)', border: 'none',
    background: 'transparent', fontSize: 13, fontWeight: 500, color: 'var(--color-gray-500)',
    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
  },
  toggleBtnActive: {
    background: 'var(--color-white)', color: 'var(--color-gray-900)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 },
  summaryCard: {
    background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)',
    padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  summaryValue: { fontSize: 24, fontWeight: 700, color: 'var(--color-gray-900)' },
  summaryLabel: { fontSize: 13, color: 'var(--color-gray-500)' },
  filtersRow: { display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  filterLabel: { fontSize: 12, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  selectWrapper: { position: 'relative' },
  select: {
    appearance: 'none', background: 'var(--color-white)', border: '1px solid var(--color-gray-200)',
    borderRadius: 'var(--radius)', padding: '8px 32px 8px 12px', fontSize: 14, color: 'var(--color-gray-700)',
    cursor: 'pointer', minWidth: 200,
  },
  selectIcon: { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-gray-400)', pointerEvents: 'none' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--color-gray-700)', cursor: 'pointer' },
  checkbox: { width: 16, height: 16, accentColor: 'var(--color-primary)' },
  tableSection: {
    background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)',
    padding: 20, marginBottom: 20,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--color-gray-200)',
  },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)' },
  stockBadge: { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 },
  viewBtn: {
    background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)',
    borderRadius: 'var(--radius)', padding: '4px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
}
