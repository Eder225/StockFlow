import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, ShoppingCart, Wrench, Package, AlertTriangle, X } from 'lucide-react'

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function formatMonth(m: string) {
  const [y, mm] = m.split('-')
  return `${monthNames[parseInt(mm, 10) - 1]} ${y}`
}

type DetailKey = 'monthRevenue' | 'monthSales' | 'repairRevenue' | 'totalRepairRevenue' | 'stockValue' | 'totalRevenue' | 'totalSales' | 'monthProfit' | 'totalProfit'

function DetailModal({ data, detailKey, onClose }: { data: ReportsData; detailKey: DetailKey; onClose: () => void }) {
  const labels: Record<string, string> = { pending: 'En attente', in_progress: 'En cours', completed: 'Terminée', delivered: 'Livrée', cancelled: 'Annulée' }
  const monthLabel = formatMonth(data.selectedMonth)

  const content = () => {
    switch (detailKey) {
      case 'monthRevenue':
      case 'totalRevenue': {
        const isMonth = detailKey === 'monthRevenue'
        const total = isMonth ? data.monthRevenue : data.totalRevenue
        const breakdown = isMonth ? data.monthPaymentBreakdown : data.paymentBreakdown
        return (
          <div>
            <p style={modalStyles.total}>{total.toLocaleString()} FCFA</p>
            <p style={modalStyles.sub}>{isMonth ? `Revenu ${monthLabel}` : 'Revenu total (ventes)'}</p>
            <div style={{ height: 1, background: 'var(--color-gray-200)', margin: '16px 0' }} />
            <p style={modalStyles.sectionTitle}>Moyens de paiement</p>
            {breakdown.length === 0 ? (
              <p style={modalStyles.empty}>Aucune donnée</p>
            ) : (
              breakdown.map((p) => {
                const pct = total > 0 ? Math.round((p.total / total) * 100) : 0
                return (
                  <div key={p.payment_method} style={{ marginBottom: 12 }}>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>{p.payment_method === 'cash' ? 'Espèces' : 'Mobile Money'}</span>
                      <span style={modalStyles.value}>{p.total.toLocaleString()} FCFA</span>
                    </div>
                    <div style={modalStyles.progressBg}>
                      <div style={{ ...modalStyles.progressBar, width: `${pct}%` }} />
                    </div>
                    <span style={modalStyles.pct}>{pct}% ({p.count} vente{p.count > 1 ? 's' : ''})</span>
                  </div>
                )
              })
            )}
          </div>
        )
      }
      case 'monthSales':
      case 'totalSales': {
        const isMonth = detailKey === 'monthSales'
        const count = isMonth ? data.monthSales : data.totalSales
        return (
          <div>
            <p style={modalStyles.total}>{count}</p>
            <p style={modalStyles.sub}>{isMonth ? `Ventes ${monthLabel}` : 'Ventes totales'}</p>
            <div style={{ height: 1, background: 'var(--color-gray-200)', margin: '16px 0' }} />
            <p style={modalStyles.sectionTitle}>Évolution mensuelle</p>
            {data.monthlySales.length === 0 ? (
              <p style={modalStyles.empty}>Aucune vente</p>
            ) : (
              data.monthlySales.map((m) => (
                <div key={m.month} style={modalStyles.row}>
                  <span style={modalStyles.label}>{formatMonth(m.month)}</span>
                  <span style={modalStyles.value}>{m.count} vente{m.count > 1 ? 's' : ''} — {m.total.toLocaleString()} FCFA</span>
                </div>
              ))
            )}
          </div>
        )
      }
      case 'repairRevenue':
      case 'totalRepairRevenue': {
        const isMonth = detailKey === 'repairRevenue'
        const total = isMonth ? data.monthRepairRevenue : data.totalRepairRevenue
        return (
          <div>
            <p style={modalStyles.total}>{total.toLocaleString()} FCFA</p>
            <p style={modalStyles.sub}>{isMonth ? `Revenu réparations — ${monthLabel}` : 'Revenu réparations total'}</p>
            <div style={{ height: 1, background: 'var(--color-gray-200)', margin: '16px 0' }} />
            <p style={modalStyles.sectionTitle}>Réparations par statut</p>
            {data.repairsByStatus.length === 0 ? (
              <p style={modalStyles.empty}>Aucune réparation</p>
            ) : (
              data.repairsByStatus.map((r) => {
                const total = data.repairsByStatus.reduce((s, x) => s + x.count, 0)
                const pct = Math.round((r.count / total) * 100)
                return (
                  <div key={r.status} style={{ marginBottom: 12 }}>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>{labels[r.status] || r.status}</span>
                      <span style={modalStyles.value}>{r.count}</span>
                    </div>
                    <div style={modalStyles.progressBg}>
                      <div style={{ ...modalStyles.progressBar, width: `${pct}%`, background: r.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-primary)' }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )
      }
        case 'stockValue':
        return (
          <div>
            <p style={modalStyles.total}>{data.stockValue.toLocaleString()} FCFA</p>
            <p style={modalStyles.sub}>Valeur du stock</p>
            <div style={{ height: 1, background: 'var(--color-gray-200)', margin: '16px 0' }} />
            <div style={modalStyles.alertRow}>
              <div style={modalStyles.alertBox}>
                <span style={{ ...modalStyles.alertCount, color: 'var(--color-danger)' }}>{data.outOfStock}</span>
                <span style={modalStyles.alertLabel}>En rupture</span>
              </div>
              <div style={modalStyles.alertBox}>
                <span style={{ ...modalStyles.alertCount, color: 'var(--color-warning)' }}>{data.lowStock}</span>
                <span style={modalStyles.alertLabel}>Stock ≤ 2</span>
              </div>
            </div>
          </div>
        )
      case 'monthProfit':
      case 'totalProfit': {
        const isMonth = detailKey === 'monthProfit'
        const profit = isMonth ? data.monthProfit : data.totalProfit
        const rows = isMonth ? data.monthProfitByProduct : data.profitByProduct
        return (
          <div>
            <p style={{ ...modalStyles.total, color: 'var(--color-success)' }}>{profit.toLocaleString()} FCFA</p>
            <p style={modalStyles.sub}>{isMonth ? `Bénéfice ${monthLabel} (ventes + réparations)` : 'Bénéfice total (ventes + réparations)'}</p>
            <div style={{ height: 1, background: 'var(--color-gray-200)', margin: '16px 0' }} />
            <p style={modalStyles.sectionTitle}>Bénéfice par article (ventes + réparations)</p>
            {rows.length === 0 ? (
              <p style={modalStyles.empty}>Aucune donnée</p>
            ) : (
              rows.map((p) => {
                const margin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0
                return (
                  <div key={p.name} style={{ marginBottom: 12 }}>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>{p.name}</span>
                      <span style={{ ...modalStyles.value, color: 'var(--color-success)' }}>+{p.profit.toLocaleString()} FCFA</span>
                    </div>
                    <div style={modalStyles.progressBg}>
                      <div style={{ ...modalStyles.progressBar, width: `${margin}%`, background: 'var(--color-success)' }} />
                    </div>
                    <span style={modalStyles.pct}>{p.qty} unité{p.qty > 1 ? 's' : ''} · marge {margin}%</span>
                  </div>
                )
              })
            )}
          </div>
        )
      }
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={modalStyles.closeBtn} onClick={onClose}><X size={20} /></button>
        {content()}
      </div>
    </div>
  )
}

export default function Reports() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [detailKey, setDetailKey] = useState<DetailKey | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    window.electronAPI.reports.getData({ month: selectedMonth }).then(setData)
  }, [selectedMonth])

  const monthOptions = data
    ? Array.from(new Set([...data.availableMonths, ...data.monthlySales.map((m) => m.month), selectedMonth])).sort().reverse()
    : [selectedMonth]

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={{ ...styles.pageTitle, marginBottom: 0 }}>
          <BarChart3 size={24} /> Rapports
        </h1>
        <select
          style={styles.monthSelect}
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          title="Choisir le mois"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </select>
      </div>

      {!data ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-gray-400)' }}>Chargement…</div>
      ) : (
        <>
          <h2 style={styles.blockTitle}>Depuis le début</h2>
          <div style={styles.grid}>
            <button style={styles.card} onClick={() => setDetailKey('totalRevenue')}>
              <div style={{ ...styles.cardIcon, background: '#f0fdf4' }}>
                <TrendingUp size={22} style={{ color: 'var(--color-success)' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.totalRevenue.toLocaleString()} FCFA</span>
                <span style={styles.cardLabel}>Revenu total (ventes)</span>
              </div>
            </button>
            <button style={styles.card} onClick={() => setDetailKey('totalRepairRevenue')}>
              <div style={{ ...styles.cardIcon, background: '#f3e8ff' }}>
                <Wrench size={22} style={{ color: '#9333ea' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.totalRepairRevenue.toLocaleString()} FCFA</span>
                <span style={styles.cardLabel}>Revenu réparations total</span>
              </div>
            </button>
            <button style={styles.card} onClick={() => setDetailKey('totalProfit')}>
              <div style={{ ...styles.cardIcon, background: '#ecfdf5' }}>
                <TrendingUp size={22} style={{ color: 'var(--color-success)' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.totalProfit.toLocaleString()} FCFA</span>
                <span style={styles.cardLabel}>Bénéfice total (ventes + réparations)</span>
              </div>
            </button>
            <button style={styles.card} onClick={() => setDetailKey('totalSales')}>
              <div style={{ ...styles.cardIcon, background: '#eff6ff' }}>
                <ShoppingCart size={22} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.totalSales}</span>
                <span style={styles.cardLabel}>Ventes totales</span>
              </div>
            </button>
            <button style={styles.card} onClick={() => setDetailKey('stockValue')}>
              <div style={{ ...styles.cardIcon, background: '#fef3c7' }}>
                <Package size={22} style={{ color: 'var(--color-warning)' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.stockValue.toLocaleString()} FCFA</span>
                <span style={styles.cardLabel}>Valeur du stock</span>
              </div>
            </button>
          </div>

          <div style={{ ...styles.section, marginBottom: 20 }}>
              <h2 style={styles.sectionTitle}>Paiements — {formatMonth(data.selectedMonth)}</h2>
              {data.monthPaymentBreakdown.length === 0 ? (
                <p style={styles.empty}>Aucune donnée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.monthPaymentBreakdown.map((p) => {
                    const pct = data.monthRevenue > 0 ? Math.round((p.total / data.monthRevenue) * 100) : 0
                    return (
                      <div key={p.payment_method}>
                        <div style={styles.paymentRow}>
                          <span style={styles.paymentLabel}>{p.payment_method === 'cash' ? 'Espèces' : 'Mobile Money'}</span>
                          <span style={styles.paymentValue}>{p.total.toLocaleString()} FCFA</span>
                        </div>
                        <div style={styles.progressBg}>
                          <div style={{ ...styles.progressBar, width: `${pct}%` }} />
                        </div>
                        <span style={styles.paymentPct}>{pct}% ({p.count} vente{p.count > 1 ? 's' : ''})</span>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>

          <div style={styles.sectionGrid}>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Top 5 produits — {formatMonth(data.selectedMonth)}</h2>
              {data.monthTopProducts.length === 0 ? (
                <p style={styles.empty}>Aucune vente</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Produit</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>Qté</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthTopProducts.map((p, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{p.name}</td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>{p.qty}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{p.total.toLocaleString()} FCFA</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
                <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
                Stock faible
              </h2>
              <div style={styles.stockAlerts}>
                <div style={styles.alertItem}>
                  <span style={{ ...styles.alertValue, color: 'var(--color-danger)' }}>{data.outOfStock}</span>
                  <span style={styles.alertLabel}>En rupture</span>
                </div>
                <div style={styles.alertItem}>
                  <span style={{ ...styles.alertValue, color: 'var(--color-warning)' }}>{data.lowStock}</span>
                  <span style={styles.alertLabel}>Stock ≤ 2</span>
                </div>
              </div>
              <h2 style={{ ...styles.sectionTitle, marginTop: 24 }}>Réparations par statut</h2>
              {data.repairsByStatus.length === 0 ? (
                <p style={styles.empty}>Aucune réparation</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.repairsByStatus.map((r) => {
                    const total = data.repairsByStatus.reduce((s, x) => s + x.count, 0)
                    const pct = Math.round((r.count / total) * 100)
                    const labels: Record<string, string> = { pending: 'En attente', in_progress: 'En cours', completed: 'Terminée', delivered: 'Livrée', cancelled: 'Annulée' }
                    return (
                      <div key={r.status}>
                        <div style={styles.paymentRow}>
                          <span style={styles.paymentLabel}>{labels[r.status] || r.status}</span>
                          <span style={styles.paymentValue}>{r.count}</span>
                        </div>
                        <div style={styles.progressBg}>
                          <div style={{ ...styles.progressBar, width: `${pct}%`, background: r.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-primary)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <h2 style={styles.blockTitle}>Détails — {formatMonth(data.selectedMonth)}</h2>
          <div style={styles.grid}>
            <button style={styles.card} onClick={() => setDetailKey('monthRevenue')}>
              <div style={{ ...styles.cardIcon, background: '#f0fdf4' }}>
                <TrendingUp size={22} style={{ color: 'var(--color-success)' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.monthRevenue.toLocaleString()} FCFA</span>
                <span style={styles.cardLabel}>Revenu {formatMonth(data.selectedMonth)}</span>
              </div>
            </button>
            <button style={styles.card} onClick={() => setDetailKey('monthSales')}>
              <div style={{ ...styles.cardIcon, background: '#eff6ff' }}>
                <ShoppingCart size={22} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.monthSales}</span>
                <span style={styles.cardLabel}>Ventes {formatMonth(data.selectedMonth)}</span>
              </div>
            </button>
            <button style={styles.card} onClick={() => setDetailKey('repairRevenue')}>
              <div style={{ ...styles.cardIcon, background: '#f3e8ff' }}>
                <Wrench size={22} style={{ color: '#9333ea' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.monthRepairRevenue.toLocaleString()} FCFA</span>
                <span style={styles.cardLabel}>Réparations {formatMonth(data.selectedMonth)}</span>
              </div>
            </button>
            <button style={styles.card} onClick={() => setDetailKey('monthProfit')}>
              <div style={{ ...styles.cardIcon, background: '#ecfdf5' }}>
                <TrendingUp size={22} style={{ color: 'var(--color-success)' }} />
              </div>
              <div>
                <span style={styles.cardValue}>{data.monthProfit.toLocaleString()} FCFA</span>
                <span style={styles.cardLabel}>Bénéfice {formatMonth(data.selectedMonth)} (ventes + réparations)</span>
              </div>
            </button>
          </div>

          <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
              <TrendingUp size={16} style={{ color: 'var(--color-success)' }} />
              Bénéfice par article — {formatMonth(data.selectedMonth)} (ventes + réparations)
            </h2>
              {data.monthProfitByProduct.length === 0 ? (
                <p style={styles.empty}>Aucune donnée</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                      <th style={styles.th}>Produit</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>Qté totale</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Revenu</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Bénéfice</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthProfitByProduct.map((p, i) => {
                    const margin = p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0
                    return (
                      <tr key={i}>
                        <td style={styles.td}>{p.name}</td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>{p.qty}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{p.revenue.toLocaleString()} FCFA</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: 'var(--color-success)', fontWeight: 600 }}>+{p.profit.toLocaleString()} FCFA</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{margin}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {detailKey && data && (
        <DetailModal data={data} detailKey={detailKey} onClose={() => setDetailKey(null)} />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--color-gray-900)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' },
  monthSelect: { padding: '8px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--color-white)', fontWeight: 600, color: 'var(--color-gray-700)', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 },
  blockTitle: { fontSize: 16, fontWeight: 700, color: 'var(--color-gray-900)', margin: '8px 0 12px' },
  card: {
    background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)',
    padding: 20, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left', width: '100%',
  },
  cardIcon: { width: 44, height: 44, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardValue: { display: 'block', fontSize: 20, fontWeight: 700, color: 'var(--color-gray-900)' },
  cardLabel: { display: 'block', fontSize: 12, color: 'var(--color-gray-500)', marginTop: 2 },
  sectionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
  section: { background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 20 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-gray-800)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 },
  empty: { color: 'var(--color-gray-400)', fontSize: 13, textAlign: 'center', padding: 20 },
  paymentRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  paymentLabel: { fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)' },
  paymentValue: { fontSize: 14, fontWeight: 600, color: 'var(--color-gray-900)' },
  paymentPct: { fontSize: 11, color: 'var(--color-gray-400)', marginTop: 2 },
  progressBg: { height: 8, background: 'var(--color-gray-100)', borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', background: 'var(--color-primary)', borderRadius: 4, transition: 'width 0.3s', minWidth: 4 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-gray-200)' },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)' },
  stockAlerts: { display: 'flex', gap: 16 },
  alertItem: { flex: 1, textAlign: 'center', padding: '12px 8px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius)' },
  alertValue: { display: 'block', fontSize: 24, fontWeight: 700 },
  alertLabel: { fontSize: 12, color: 'var(--color-gray-500)', marginTop: 2 },
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  },
  modal: {
    background: 'var(--color-white)', borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 420,
    padding: 24, position: 'relative', maxHeight: '80vh', overflow: 'auto',
  },
  closeBtn: {
    position: 'absolute', top: 12, right: 12,
    background: 'none', border: 'none', color: 'var(--color-gray-400)',
    padding: 4, cursor: 'pointer',
  },
  total: { fontSize: 26, fontWeight: 700, color: 'var(--color-gray-900)' },
  sub: { fontSize: 13, color: 'var(--color-gray-500)', marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--color-gray-700)', marginBottom: 12 },
  empty: { fontSize: 13, color: 'var(--color-gray-400)', textAlign: 'center', padding: 16 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)' },
  value: { fontSize: 13, fontWeight: 600, color: 'var(--color-gray-900)' },
  pct: { fontSize: 11, color: 'var(--color-gray-400)', marginTop: 2 },
  progressBg: { height: 8, background: 'var(--color-gray-100)', borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', background: 'var(--color-primary)', borderRadius: 4, transition: 'width 0.3s', minWidth: 4 },
  alertRow: { display: 'flex', gap: 12 },
  alertBox: { flex: 1, textAlign: 'center', padding: '16px 8px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius)' },
  alertCount: { display: 'block', fontSize: 28, fontWeight: 700 },
  alertLabel: { fontSize: 12, color: 'var(--color-gray-500)', marginTop: 4 },
}
