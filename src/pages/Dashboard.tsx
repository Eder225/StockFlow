import { useEffect, useState } from 'react'
import { Package, TrendingUp, ShoppingCart, Wrench, AlertTriangle, BarChart3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const dashMonthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function formatDashMonth(m: string) {
  const [y, mm] = m.split('-')
  return `${dashMonthNames[parseInt(mm, 10) - 1] || mm} ${y}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null)

  const load = () => {
    window.electronAPI.dashboard.getStats().then(setStats)
    window.electronAPI.dashboard.getAlerts().then(setAlerts)
  }

  useEffect(() => { load() }, [])

  const maxMonthlyTotal = stats ? Math.max(...stats.monthlySales.map((m) => m.total), 1) : 1

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-gray-900)' }}>
          Tableau de bord
        </h1>
      </div>

      <div style={styles.grid}>
        <button style={styles.card} onClick={() => navigate('/app/products')}>
          <div style={styles.cardIcon}>
            <Package size={24} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div style={styles.cardContent}>
            <span style={styles.cardValue}>{stats?.productCount ?? '…'}</span>
            <span style={styles.cardLabel}>Produits en stock</span>
          </div>
        </button>

        <button style={styles.card} onClick={() => navigate('/app/products')}>
          <div style={{ ...styles.cardIcon, background: '#f0fdf4' }}>
            <TrendingUp size={24} style={{ color: 'var(--color-success)' }} />
          </div>
          <div style={styles.cardContent}>
            <span style={styles.cardValue}>{stats ? `${stats.stockValue.toLocaleString()} FCFA` : '…'}</span>
            <span style={styles.cardLabel}>Valeur du stock</span>
          </div>
        </button>

        <button style={styles.card} onClick={() => navigate('/app/sales')}>
          <div style={{ ...styles.cardIcon, background: '#fef3c7' }}>
            <ShoppingCart size={24} style={{ color: 'var(--color-warning)' }} />
          </div>
          <div style={styles.cardContent}>
            <span style={styles.cardValue}>{stats?.todaySalesCount ?? '…'}</span>
            <span style={styles.cardLabel}>Ventes aujourd'hui</span>
          </div>
        </button>

        <button style={styles.card} onClick={() => navigate('/app/repairs')}>
          <div style={{ ...styles.cardIcon, background: '#f3e8ff' }}>
            <Wrench size={24} style={{ color: '#9333ea' }} />
          </div>
          <div style={styles.cardContent}>
            <span style={styles.cardValue}>{stats?.inProgressRepairs ?? '…'}</span>
            <span style={styles.cardLabel}>Réparations en cours</span>
          </div>
        </button>
      </div>

      <div style={styles.sectionGrid}>
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <BarChart3 size={16} style={{ color: 'var(--color-primary)' }} />
            <span style={styles.sectionTitle}>Ventes mensuelles</span>
            <button style={styles.seeAll} onClick={() => navigate('/app/reports')}>Voir rapports →</button>
          </div>
          {!stats ? (
            <div style={styles.loading}>Chargement…</div>
          ) : stats.monthlySales.length === 0 ? (
            <div style={styles.emptyState}>
              <p>Aucune vente</p>
            </div>
          ) : (
            <div style={styles.chart}>
              {[...stats.monthlySales].reverse().map((m) => (
                <div key={m.month} style={styles.chartCol}>
                  <span style={styles.chartValue}>{m.total.toLocaleString()} FCFA</span>
                  <div style={{ ...styles.chartBar, height: `${Math.max((m.total / maxMonthlyTotal) * 100, 4)}%` }} />
                  <span style={styles.chartLabel}>{formatDashMonth(m.month)}</span>
                  <span style={styles.chartSub}>({m.count} vente{m.count > 1 ? 's' : ''})</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
            <span style={styles.sectionTitle}>Produits à réapprovisionner</span>
            <button style={styles.seeAll} onClick={() => navigate('/app/products')}>Voir tout →</button>
          </div>
          {!alerts ? (
            <div style={styles.loading}>Chargement…</div>
          ) : alerts.lowStockProducts.length === 0 ? (
            <div style={styles.emptyState}>
              <Package size={32} style={{ color: 'var(--color-gray-300)' }} />
              <p>Tout est en stock !</p>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Produit</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>Stock</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Prix vente</th>
                </tr>
              </thead>
              <tbody>
                {alerts.lowStockProducts.map((p) => (
                  <tr key={p.id}>
                    <td style={styles.td}>{p.name}</td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={{ ...styles.stockBadge, background: p.quantity === 0 ? '#fef2f2' : '#fffbeb', color: p.quantity === 0 ? 'var(--color-danger)' : '#d97706' }}>
                        {p.quantity === 0 ? 'Rupture' : p.quantity}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{p.sale_price.toLocaleString()} FCFA</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 },
  card: { background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 20, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left', width: '100%' },
  cardIcon: { width: 48, height: 48, borderRadius: 'var(--radius)', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardContent: { display: 'flex', flexDirection: 'column' },
  cardValue: { fontSize: 22, fontWeight: 700, color: 'var(--color-gray-900)' },
  cardLabel: { fontSize: 13, color: 'var(--color-gray-500)', marginTop: 2 },
  sectionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
  section: { background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 20, display: 'flex', flexDirection: 'column' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-gray-800)', flex: 1 },
  seeAll: { background: 'none', border: 'none', fontSize: 12, color: 'var(--color-primary)', cursor: 'pointer' },
  loading: { padding: 20, textAlign: 'center', color: 'var(--color-gray-400)', fontSize: 13 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 0', color: 'var(--color-gray-400)', fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-gray-200)' },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)', fontSize: 13 },
  stockBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 },
  chart: { display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, paddingTop: 20 },
  chartCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  chartValue: { fontSize: 10, color: 'var(--color-gray-500)', whiteSpace: 'nowrap' },
  chartBar: { width: '100%', maxWidth: 40, background: 'var(--color-primary)', borderRadius: '4px 4px 0 0', minHeight: 4, transition: 'height 0.3s' },
  chartLabel: { fontSize: 10, fontWeight: 500, color: 'var(--color-gray-600)', marginTop: 4, whiteSpace: 'nowrap' },
  chartSub: { fontSize: 10, color: 'var(--color-gray-400)' },
}
