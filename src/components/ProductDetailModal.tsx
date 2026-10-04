import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'

interface ProductDetailModalProps {
  item: StockByCategoryItem | StockByBrandItem
  products: (StockCategoryDetail | StockBrandDetail)[]
  viewMode: 'category' | 'brand'
  onClose: () => void
}

export default function ProductDetailModal({ item, products, viewMode, onClose }: ProductDetailModalProps) {
  const [profitLoss, setProfitLoss] = useState<ProductProfitLoss[]>([])

  const getName = () =>
    viewMode === 'category'
      ? (item as StockByCategoryItem).category_name
      : (item as StockByBrandItem).brand_name

  useEffect(() => {
    const id = viewMode === 'category'
      ? (item as StockByCategoryItem).category_id
      : (item as StockByBrandItem).brand_id
    const fetch = viewMode === 'category'
      ? window.electronAPI.stock.profitLossByCategory
      : window.electronAPI.stock.profitLossByBrand
    fetch(id).then(setProfitLoss)
  }, [item, viewMode])

  const getPL = (productId: number) => profitLoss.find(p => p.product_id === productId)

  const totalQuantity = products.reduce((s, p) => s + p.quantity, 0)
  const totalValue = products.reduce((s, p) => s + p.quantity * p.sale_price, 0)
  const totalPurchaseValue = products.reduce((s, p) => s + p.quantity * p.purchase_price, 0)
  const totalMargin = totalValue - totalPurchaseValue
  const totalSold = profitLoss.reduce((s, p) => s + p.sold_qty, 0)
  const totalDiscount = profitLoss.reduce((s, p) => s + p.discount, 0)
  const totalRevenue = profitLoss.reduce((s, p) => s + p.revenue, 0)
  const totalProfit = profitLoss.reduce((s, p) => s + p.profit, 0)
  const totalRepairQty = profitLoss.reduce((s, p) => s + p.repair_qty, 0)
  const totalRepairProfit = profitLoss.reduce((s, p) => s + p.repair_profit, 0)
  const totalLaborRevenue = profitLoss.reduce((s, p) => s + p.labor_revenue, 0)
  const totalRealizedProfit = totalProfit + totalRepairProfit + totalLaborRevenue
  const outOfStock = products.filter(p => p.quantity === 0).length
  const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= 2).length

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <Package size={22} style={{ color: 'var(--color-primary)' }} />
          <h3 style={styles.title}>{getName()}</h3>
        </div>

        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryValue}>{products.length}</span>
            <span style={styles.summaryLabel}>Produits</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryValue}>{totalQuantity}</span>
            <span style={styles.summaryLabel}>En stock</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={{ ...styles.summaryValue, color: totalRealizedProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {totalRealizedProfit.toLocaleString()} FCFA
            </span>
            <span style={styles.summaryLabel}>Bénéfice total</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryValue}>{totalSold}</span>
            <span style={styles.summaryLabel}>Unités vendues</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryValue}>{totalRepairQty}</span>
            <span style={styles.summaryLabel}>Pièces réparation</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryValue}>{totalRevenue.toLocaleString()} FCFA</span>
            <span style={styles.summaryLabel}>Revenu net</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={{ ...styles.summaryValue, color: 'var(--color-danger)' }}>
              -{totalDiscount.toLocaleString()} FCFA
            </span>
            <span style={styles.summaryLabel}>Remises</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryValue}>{totalLaborRevenue.toLocaleString()} FCFA</span>
            <span style={styles.summaryLabel}>Main d'œuvre</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={{ ...styles.summaryValue, color: totalMargin >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              {totalMargin.toLocaleString()} FCFA
            </span>
            <span style={styles.summaryLabel}>Marge stock</span>
          </div>
        </div>

        {(outOfStock > 0 || lowStock > 0) && (
          <div style={styles.alertRow}>
            {outOfStock > 0 && (
              <span style={{ ...styles.alertBadge, background: '#fef2f2', color: 'var(--color-danger)' }}>
                {outOfStock} en rupture
              </span>
            )}
            {lowStock > 0 && (
              <span style={{ ...styles.alertBadge, background: '#fffbeb', color: 'var(--color-warning)' }}>
                {lowStock} stock faible
              </span>
            )}
          </div>
        )}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Nom</th>
                {viewMode === 'category' ? (
                  <th style={styles.th}>Marque</th>
                ) : (
                  <th style={styles.th}>Catégorie</th>
                )}
                <th style={styles.th}>Modèle</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Stock</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Prix achat</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Prix vente</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Vendus</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Bénéf. ventes</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Répara.</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Bénéf. répara.</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Main d'œuvre</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Remises</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Total bénéf.</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const pl = getPL(p.id)
                const stockBg = p.quantity === 0 ? '#fef2f2' : p.quantity <= 2 ? '#fffbeb' : '#f0fdf4'
                const stockColor = p.quantity === 0 ? 'var(--color-danger)' : p.quantity <= 2 ? 'var(--color-warning)' : 'var(--color-success)'
                const saleProfit = pl?.profit ?? 0
                const repairProfit = pl?.repair_profit ?? 0
                const laborRev = pl?.labor_revenue ?? 0
                const totalBenefit = saleProfit + repairProfit + laborRev

                return (
                  <tr key={p.id} style={p.quantity === 0 ? { background: '#fef2f2' } : undefined}>
                    <td style={styles.td}>{p.name}</td>
                    <td style={styles.td}>
                      {viewMode === 'category'
                        ? (p as StockCategoryDetail).brand_name
                        : (p as StockBrandDetail).category_name
                      }
                    </td>
                    <td style={styles.td}>{p.model}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={{ ...styles.stockBadge, background: stockBg, color: stockColor }}>
                        {p.quantity}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{p.purchase_price.toLocaleString()} FCFA</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{p.sale_price.toLocaleString()} FCFA</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{pl?.sold_qty ?? 0}</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: saleProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
                      {saleProfit.toLocaleString()} FCFA
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{pl?.repair_qty ?? 0}</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: repairProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
                      {repairProfit.toLocaleString()} FCFA
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: laborRev > 0 ? 'var(--color-primary)' : 'var(--color-gray-400)' }}>
                      {laborRev.toLocaleString()} FCFA
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: (pl?.discount ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-gray-400)' }}>
                      {(pl?.discount ?? 0) > 0 ? `-${(pl?.discount ?? 0).toLocaleString()} FCFA` : '—'}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: totalBenefit >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                      {totalBenefit.toLocaleString()} FCFA
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.actions}>
          <button style={styles.closeButton} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 12, padding: 24, width: 1100, maxWidth: '97vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexShrink: 0,
  },
  title: {
    flex: 1, fontSize: 18, fontWeight: 600, color: 'var(--color-gray-900)',
  },
  summaryGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 8, marginBottom: 16, flexShrink: 0,
  },
  summaryCard: {
    background: 'var(--color-gray-50)', borderRadius: 8, padding: '10px 4px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    textAlign: 'center',
  },
  summaryValue: { fontSize: 13, fontWeight: 700, color: 'var(--color-gray-900)' },
  summaryLabel: { fontSize: 9, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.02em' },
  alertRow: {
    display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0,
  },
  alertBadge: {
    display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600,
  },
  tableWrap: {
    flex: 1, overflow: 'auto', border: '1px solid var(--color-gray-200)', borderRadius: 8,
    marginBottom: 16,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--color-gray-200)', background: 'var(--color-gray-50)',
    position: 'sticky', top: 0,
    zIndex: 10,
  },
  td: { padding: '9px 12px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)' },
  stockBadge: { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 },
  actions: {
    display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
  },
  closeButton: {
    padding: '8px 18px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)',
    background: '#fff', fontSize: 14, color: 'var(--color-gray-700)', cursor: 'pointer',
  },
}
