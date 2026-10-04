import { useEffect, useMemo, useState } from 'react'
import { History, Filter, ChevronDown, ChevronRight } from 'lucide-react'

const monthNamesFull = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function monthKeyOf(createdAt: string): string {
  return createdAt.slice(0, 7)
}

function formatMonthLabel(m: string): string {
  const [y, mm] = m.split('-')
  const idx = parseInt(mm, 10) - 1
  return `${monthNamesFull[idx] || mm} ${y}`
}

const operationLabels: Record<string, string> = {
  sale_created: 'Vente',
  sale_cancelled: 'Annulation vente',
  sale_updated: 'Vente modifiée',
  sale_deleted: 'Vente supprimée',
  repair_created: 'Réparation',
  repair_updated: 'Réparation modifiée',
  repair_status_changed: 'Changement statut réparation',
  repair_cancelled: 'Annulation réparation',
  repair_deleted: 'Réparation supprimée',
  product_created: 'Produit créé',
  product_updated: 'Produit modifié',
  product_deleted: 'Produit archivé',
  stock_adjusted: 'Mouvement de stock',
  backup_created: 'Sauvegarde créée',
  backup_restored: 'Sauvegarde restaurée',
  settings_changed: 'Paramètres modifiés',
}

const operationColors: Record<string, { bg: string; color: string }> = {
  sale_created: { bg: '#f0fdf4', color: 'var(--color-success)' },
  sale_cancelled: { bg: '#fef2f2', color: 'var(--color-danger)' },
  sale_updated: { bg: '#fffbeb', color: '#d97706' },
  sale_deleted: { bg: '#fef2f2', color: 'var(--color-danger)' },
  repair_created: { bg: '#eff6ff', color: 'var(--color-primary)' },
  repair_updated: { bg: '#fffbeb', color: '#d97706' },
  repair_status_changed: { bg: '#f5f3ff', color: '#7c3aed' },
  repair_cancelled: { bg: '#fef2f2', color: 'var(--color-danger)' },
  repair_deleted: { bg: '#fef2f2', color: 'var(--color-danger)' },
  product_created: { bg: '#f0fdf4', color: 'var(--color-success)' },
  product_updated: { bg: '#fffbeb', color: '#d97706' },
  product_deleted: { bg: '#fef2f2', color: 'var(--color-danger)' },
  stock_adjusted: { bg: '#f0f9ff', color: '#0284c7' },
  backup_created: { bg: '#fafafa', color: 'var(--color-gray-600)' },
  backup_restored: { bg: '#fafafa', color: 'var(--color-gray-600)' },
  settings_changed: { bg: '#fafafa', color: 'var(--color-gray-600)' },
}

const HISTORY_PAGE_SIZE = 50

export default function HistoryPage() {
  const [logs, setLogs] = useState<HistoryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)

  const loadHistory = async () => {
    setLoading(true)
    const filters: { operation_type?: string; dateFrom?: string; dateTo?: string } = {}
    if (filterType) filters.operation_type = filterType
    if (dateFrom) filters.dateFrom = dateFrom + ' 00:00:00'
    if (dateTo) filters.dateTo = dateTo + ' 23:59:59'
    const list = await window.electronAPI.history.list(Object.keys(filters).length > 0 ? filters : undefined)
    setLogs(list as HistoryLog[])
    setPage(0)
    setCollapsed(new Set())
    setLoading(false)
  }

  useEffect(() => { loadHistory() }, [filterType, dateFrom, dateTo])

  const formatDate = (d: string) => {
    const date = new Date(d.replace(' ', 'T') + 'Z')
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const log of logs) set.add(monthKeyOf(log.created_at))
    return Array.from(set).sort().reverse()
  }, [logs])

  const filteredLogs = useMemo(() => {
    if (!selectedMonth) return logs
    return logs.filter((l) => monthKeyOf(l.created_at) === selectedMonth)
  }, [logs, selectedMonth])

  const pageSlice = filteredLogs.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE)

  const groups = useMemo(() => {
    const map = new Map<string, HistoryLog[]>()
    for (const log of pageSlice) {
      const k = monthKeyOf(log.created_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(log)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [pageSlice])

  const toggleMonth = (m: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  return (
    <div>
      <h1 style={styles.pageTitle}>
        <History size={24} /> Historique
      </h1>

      <div style={styles.filterBar}>
        <Filter size={16} style={{ color: 'var(--color-gray-400)' }} />
        <select style={styles.filterSelect} value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(0) }}>
          <option value="">Tous les types</option>
          {Object.entries(operationLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          style={styles.filterSelect}
          value={selectedMonth}
          onChange={(e) => { setSelectedMonth(e.target.value); setPage(0); setCollapsed(new Set()) }}
          title="Filtrer par mois"
        >
          <option value="">Tous les mois</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
        <input
          style={styles.filterInput}
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
          placeholder="Date début"
        />
        <span style={{ color: 'var(--color-gray-400)' }}>—</span>
        <input
          style={styles.filterInput}
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
          placeholder="Date fin"
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-gray-400)' }}>Chargement…</div>
      ) : filteredLogs.length === 0 ? (
        <div style={styles.tableWrap}>
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-gray-400)' }}>Aucune opération enregistrée</div>
        </div>
      ) : (
        <div>
          {groups.map(([month, items]) => {
            const key = month + '-' + page
            const closed = collapsed.has(key)
            return (
              <div key={key} style={styles.monthGroup}>
                <button style={styles.monthHeader} onClick={() => toggleMonth(key)}>
                  {closed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  <span style={styles.monthTitle}>{formatMonthLabel(month)}</span>
                  <span style={styles.monthCount}>{items.length} entrée{items.length > 1 ? 's' : ''}</span>
                </button>
                {!closed && (
                  <div style={styles.tableWrap}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Date / Heure</th>
                          <th style={styles.th}>Type</th>
                          <th style={styles.th}>Détail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((log) => {
                          const colors = operationColors[log.operation_type] || { bg: '#fafafa', color: 'var(--color-gray-600)' }
                          return (
                            <tr key={log.id}>
                              <td style={styles.td}>{formatDate(log.created_at)}</td>
                              <td style={styles.td}>
                                <span style={{ ...styles.badge, background: colors.bg, color: colors.color }}>
                                  {operationLabels[log.operation_type] || log.operation_type}
                                </span>
                              </td>
                              <td style={styles.td}>{log.description}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
          {filteredLogs.length > HISTORY_PAGE_SIZE && (
            <div style={styles.pagination}>
              <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>← Précédent</button>
              <span style={styles.pageInfo}>Page {page + 1} / {Math.ceil(filteredLogs.length / HISTORY_PAGE_SIZE)} ({filteredLogs.length} entrées{selectedMonth ? ` — ${formatMonthLabel(selectedMonth)}` : ''})</span>
              <button style={styles.pageBtn} disabled={(page + 1) * HISTORY_PAGE_SIZE >= filteredLogs.length} onClick={() => setPage(page + 1)}>Suivant →</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--color-gray-900)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 },
  filterBar: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px',
    background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)',
    flexWrap: 'wrap',
  },
  monthGroup: { marginBottom: 16 },
  monthHeader: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    background: 'var(--color-white)', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius)',
    padding: '10px 14px', marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
    color: 'var(--color-gray-800)', fontWeight: 600,
  },
  monthTitle: { flex: 1, textAlign: 'left' },
  monthCount: { fontSize: 12, fontWeight: 500, color: 'var(--color-gray-500)', background: 'var(--color-gray-100)', padding: '2px 10px', borderRadius: 12 },
  filterSelect: { padding: '8px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--color-white)', minWidth: 200 },
  filterInput: { padding: '8px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--color-white)' },
  tableWrap: { background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)', fontSize: 13 },
  badge: { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '12px 16px', borderTop: '1px solid var(--color-gray-200)' },
  pageBtn: { padding: '6px 14px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: 'var(--color-white)', fontSize: 13, color: 'var(--color-gray-700)', cursor: 'pointer' },
  pageInfo: { fontSize: 13, color: 'var(--color-gray-500)' },
}
