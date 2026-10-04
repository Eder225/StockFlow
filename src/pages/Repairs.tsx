import { Fragment, useEffect, useMemo, useState, useRef } from 'react'
import { Plus, Search, X, Wrench, Trash2, ChevronDown } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'

const repairMonthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function repairMonthLabel(m: string): string {
  const [y, mm] = m.split('-')
  return `${repairMonthNames[parseInt(mm, 10) - 1] || mm} ${y}`
}

type Tab = 'create' | 'list'

export default function Repairs() {
  const [tab, setTab] = useState<Tab>('create')

  return (
    <div>
      <h1 style={styles.pageTitle}>Réparations</h1>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }} onClick={() => setTab('create')}>
          <Wrench size={18} /> Nouvelle réparation
        </button>
        <button style={{ ...styles.tab, ...(tab === 'list' ? styles.tabActive : {}) }} onClick={() => setTab('list')}>
          Liste des réparations
        </button>
      </div>

      {tab === 'create' && <CreateRepair onCreated={() => setTab('list')} />}
      {tab === 'list' && <RepairList />}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  in_progress: 'En cours',
  completed: 'Terminée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

function CreateRepair({ onCreated }: { onCreated: () => void }) {
  const [deviceModel, setDeviceModel] = useState('')
  const [clientName, setClientName] = useState('')
  const [status, setStatus] = useState('pending')
  const [laborCost, setLaborCost] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [parts, setParts] = useState<Array<{ product: Product; quantity: number }>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.length < 1) { setSearchResults([]); setShowResults(false); return }
    searchTimeout.current = setTimeout(async () => {
      const results = await window.electronAPI.products.search({ query: q })
      setSearchResults(results as Product[])
      setShowResults(true)
    }, 200)
  }

  const addPart = (product: Product) => {
    const existing = parts.find((p) => p.product.id === product.id)
    if (existing) {
      if (existing.quantity >= product.quantity) return
      setParts(parts.map((p) => p.product.id === product.id ? { ...p, quantity: p.quantity + 1 } : p))
    } else {
      if (product.quantity < 1) { setError('Stock insuffisant'); return }
      setParts([...parts, { product, quantity: 1 }])
    }
    setSearchQuery('')
    setShowResults(false)
    setError('')
  }

  const updatePartQty = (productId: number, qty: number) => {
    setParts(parts.map((p) => {
      if (p.product.id !== productId) return p
      if (qty > p.product.quantity) { setError(`Stock disponible : ${p.product.quantity}`); return p }
      return { ...p, quantity: Math.max(1, qty) }
    }))
  }

  const removePart = (productId: number) => setParts(parts.filter((p) => p.product.id !== productId))

  const totalParts = parts.reduce((sum, p) => sum + p.product.sale_price * p.quantity, 0)
  const labor = parseInt(laborCost, 10) || 0
  const paid = Math.min(parseInt(amountPaid, 10) || 0, totalParts + labor)
  const totalDue = totalParts + labor
  const remaining = totalDue - paid

  const handleSubmit = async () => {
    setError('')
    if (!deviceModel.trim()) { setError('Le modèle de l\'appareil est obligatoire'); return }

    setSubmitting(true)
    const result = await window.electronAPI.repairs.create({
      client_name: clientName.trim() || undefined,
      device_model: deviceModel.trim(),
      status,
      labor_cost: labor,
      amount_paid: paid,
      parts: parts.map((p) => ({ product_id: p.product.id, quantity: p.quantity })),
    })
    setSubmitting(false)

    if (result.success) {
      onCreated()
    } else {
      setError(result.error || 'Erreur lors de la création')
    }
  }

  return (
    <div style={styles.formLayout}>
      <div style={styles.formSection}>
        <label style={styles.label}>Modèle de l'appareil *</label>
        <input style={styles.input} value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} placeholder="Ex: Samsung A15" />

        <label style={styles.label}>Client (facultatif)</label>
        <input style={styles.input} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nom du client" />

        <label style={styles.label}>Statut</label>
        <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">En attente</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Terminée</option>
        </select>

        <div ref={searchRef} style={{ position: 'relative', marginTop: 8 }}>
          <label style={styles.label}>Pièces utilisées</label>
          <div style={styles.searchRow}>
            <Search size={16} style={{ color: 'var(--color-gray-400)' }} />
            <input style={styles.searchInput} value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Rechercher un produit…" onFocus={() => searchResults.length > 0 && setShowResults(true)} />
          </div>
          {showResults && searchResults.length > 0 && (
            <div style={styles.searchResults}>
              {searchResults.map((p) => (
                <button key={p.id} style={styles.resultItem} onClick={() => addPart(p)}>
                  <div><span style={{ fontWeight: 500 }}>{p.name}</span><span style={styles.resultPrice}>{p.sale_price.toLocaleString()} FCFA</span></div>
                  <span style={styles.resultStock}>Stock: {p.quantity} <Plus size={14} style={{ marginLeft: 6 }} /></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {parts.length > 0 && (
          <div style={styles.partsList}>
            {parts.map((p) => (
              <div key={p.product.id} style={styles.partItem}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{p.product.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-gray-500)' }}>{p.product.sale_price.toLocaleString()} FCFA</span>
                </div>
                <input style={styles.qtyInput} type="number" min={1} max={p.product.quantity} value={p.quantity} onChange={(e) => updatePartQty(p.product.id, parseInt(e.target.value, 10) || 1)} />
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{(p.product.sale_price * p.quantity).toLocaleString()} FCFA</span>
                <button style={styles.removeBtn} onClick={() => removePart(p.product.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.summarySection}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Récapitulatif</h3>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.summaryRow}><span>Total pièces</span><span>{totalParts.toLocaleString()} FCFA</span></div>

        <label style={styles.label}>Main d'œuvre (FCFA)</label>
        <input style={styles.input} type="number" min={0} value={laborCost} onChange={(e) => setLaborCost(e.target.value)} />

        <div style={{ ...styles.summaryRow, fontWeight: 700, fontSize: 16, borderTop: '2px solid var(--color-gray-200)', paddingTop: 12, marginTop: 12 }}>
          <span>Total dû</span><span>{totalDue.toLocaleString()} FCFA</span>
        </div>

        <label style={styles.label}>Montant payé (FCFA)</label>
        <input
          style={styles.input}
          type="number"
          min={0}
          value={amountPaid}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10) || 0
            if (val > totalDue) { setError(`Le montant payé ne peut pas dépasser le total dû (${totalDue.toLocaleString()} FCFA).`); return }
            setError('')
            setAmountPaid(e.target.value)
          }}
        />

        <div style={{ ...styles.summaryRow, background: remaining > 0 ? '#fef3c7' : '#f0fdf4', padding: '10px 14px', borderRadius: 'var(--radius)', marginTop: 12 }}>
          <span style={{ fontWeight: 600 }}>Reste</span>
          <span style={{ fontWeight: 700, fontSize: 18, color: remaining > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
            {remaining.toLocaleString()} FCFA
          </span>
        </div>

        <button style={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Création…' : 'Enregistrer la réparation'}
        </button>
      </div>
    </div>
  )
}

function RepairList() {
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedRepair, setSelectedRepair] = useState<RepairDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [payConfirmRepair, setPayConfirmRepair] = useState<RepairDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const loadRepairs = async () => {
    setLoading(true)
    const list = await window.electronAPI.repairs.list(filterStatus ? { status: filterStatus } : undefined)
    setRepairs(list as Repair[])
    setLoading(false)
  }

  useEffect(() => { loadRepairs() }, [filterStatus])

  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of repairs) set.add(r.created_at.slice(0, 7))
    return Array.from(set).sort().reverse()
  }, [repairs])

  const filteredRepairs = useMemo(() => {
    if (!selectedMonth) return repairs
    return repairs.filter((r) => r.created_at.slice(0, 7) === selectedMonth)
  }, [repairs, selectedMonth])

  const repairGroups = useMemo(() => {
    const map = new Map<string, Repair[]>()
    for (const r of filteredRepairs) {
      const k = r.created_at.slice(0, 7)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filteredRepairs])

  const handleView = async (r: Repair) => {
    const detail = await window.electronAPI.repairs.getById({ id: r.id })
    setSelectedRepair(detail as RepairDetail)
    setEditing(false)
  }

  const handleStatusChange = async (id: number, newStatus: string) => {
    const result = await window.electronAPI.repairs.changeStatus({ id, newStatus })
    if (!result.success) { alert(result.error); return }
    loadRepairs()
    if (selectedRepair?.id === id) handleView(selectedRepair)
  }

  const handleCancel = async (id: number) => {
    setConfirmCancelId(id)
  }

  const formatDate = (d: string) => {
    const date = new Date(d.replace(' ', 'T') + 'Z')
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <div style={styles.filterRow}>
        <select style={styles.filterSelect} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select style={styles.filterSelect} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} title="Filtrer par mois">
          <option value="">Tous les mois</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{repairMonthLabel(m)}</option>
          ))}
        </select>
        {selectedMonth && (
          <span style={styles.monthSummary}>{filteredRepairs.length} réparation{filteredRepairs.length > 1 ? 's' : ''} en {repairMonthLabel(selectedMonth)}</span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-gray-400)' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Appareil</th>
                  <th style={styles.th}>Statut</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Reste</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRepairs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-gray-400)' }}>Aucune réparation</td></tr>
                ) : repairGroups.map(([month, items]) => (
                  <Fragment key={'month-' + month}>
                    <tr>
                      <td colSpan={6} style={styles.monthRow}>{repairMonthLabel(month)} — {items.length} réparation{items.length > 1 ? 's' : ''}</td>
                    </tr>
                    {items.map((r) => (
                      <tr key={r.id} style={{
                        ...(r.status === 'cancelled' ? styles.rowMuted : {}),
                        ...(r.status === 'completed' && r.remaining > 0 ? styles.rowWarning : {}),
                      }}>
                        <td style={styles.td}>{formatDate(r.created_at)}</td>
                        <td style={styles.td}>{r.client_name || '—'}</td>
                        <td style={styles.td}>{r.device_model}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            ...(r.status === 'cancelled' ? styles.badgeCancelled : {}),
                            ...(r.status === 'delivered' ? styles.badgeDelivered : {}),
                            ...(r.status === 'in_progress' ? styles.badgeProgress : {}),
                            ...(r.status === 'completed' ? styles.badgeCompleted : {}),
                          }}>
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: r.remaining > 0 ? 600 : 400 }}>{r.remaining.toLocaleString()} FCFA</td>
                        <td style={styles.td}>
                          <button style={styles.actionBtn} onClick={() => handleView(r)}>Détail</button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {selectedRepair && (
            <div style={styles.detailOverlay} onClick={() => setSelectedRepair(null)}>
              <div style={styles.detailModal} onClick={(e) => e.stopPropagation()}>
                {editing ? (
                  <EditRepairForm
                    repair={selectedRepair}
                    onSaved={() => { setEditing(false); loadRepairs(); selectedRepair && handleView(selectedRepair) }}
                    onCancel={() => setEditing(false)}
                  />
                ) : (
                  <>
                    <div style={styles.detailHeader}>
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>Détails de la réparation #{selectedRepair.id}</h3>
                      <button style={styles.closeBtn} onClick={() => setSelectedRepair(null)}><X size={20} /></button>
                    </div>

                    <div style={styles.detailInfo}>
                      <p><strong>Modèle :</strong> {selectedRepair.device_model}</p>
                      <p><strong>Client :</strong> {selectedRepair.client_name || '—'}</p>
                      <p><strong>Statut :</strong> {STATUS_LABELS[selectedRepair.status]}</p>
                      <p><strong>Date :</strong> {formatDate(selectedRepair.created_at)}</p>
                    </div>

                    {selectedRepair.status !== 'delivered' && selectedRepair.status !== 'cancelled' && (
                      <div style={styles.statusActions}>
                        {selectedRepair.status === 'pending' && (
                          <button style={styles.statusBtn} onClick={() => handleStatusChange(selectedRepair.id, 'in_progress')}>
                            → En cours
                          </button>
                        )}
                        {selectedRepair.status === 'in_progress' && (
                          <button style={styles.statusBtn} onClick={() => handleStatusChange(selectedRepair.id, 'completed')}>
                            → Terminée
                          </button>
                        )}
                        {selectedRepair.status === 'completed' && (
                          <button
                            style={{ ...styles.statusBtn, background: selectedRepair.remaining > 0 ? '#fef3c7' : 'var(--color-success)', color: selectedRepair.remaining > 0 ? '#92400e' : '#fff' }}
                            onClick={() => {
                              if (selectedRepair.remaining > 0) {
                                setPayConfirmRepair(selectedRepair)
                              } else {
                                handleStatusChange(selectedRepair.id, 'delivered')
                              }
                            }}
                          >
                            {selectedRepair.remaining > 0 ? `Reste: ${selectedRepair.remaining} FCFA` : '→ Livrée'}
                          </button>
                        )}
                        <button style={{ ...styles.statusBtn, background: 'var(--color-danger)', color: '#fff' }} onClick={() => handleCancel(selectedRepair.id)}>
                          Annuler
                        </button>
                      </div>
                    )}

                    {selectedRepair.parts.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Pièces utilisées</h4>
                        <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--color-gray-200)', borderRadius: 8 }}>
                          <table style={styles.table}>
                            <thead>
                              <tr>
                                <th style={styles.th}>Pièce</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>Prix</th>
                                <th style={{ ...styles.th, textAlign: 'center' }}>Qté</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedRepair.parts.map((part) => (
                                <tr key={part.id}>
                                  <td style={styles.td}>{part.product_name}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{part.unit_price.toLocaleString()} FCFA</td>
                                  <td style={{ ...styles.td, textAlign: 'center' }}>{part.quantity}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{(part.unit_price * part.quantity).toLocaleString()} FCFA</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div style={{ padding: '12px 0', borderTop: '1px solid var(--color-gray-200)', marginTop: 12 }}>
                      <p style={styles.summaryRow}><span>Main d'œuvre</span><span>{selectedRepair.labor_cost.toLocaleString()} FCFA</span></p>
                      <p style={styles.summaryRow}><span>Total dû</span><span style={{ fontWeight: 700, fontSize: 16 }}>{selectedRepair.total_due.toLocaleString()} FCFA</span></p>
                      <p style={styles.summaryRow}><span>Payé</span><span>{selectedRepair.amount_paid.toLocaleString()} FCFA</span></p>
                      <p style={{ ...styles.summaryRow, fontWeight: 700, color: selectedRepair.remaining > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                        <span>Reste</span><span>{selectedRepair.remaining.toLocaleString()} FCFA</span>
                      </p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {selectedRepair.status !== 'delivered' && selectedRepair.status !== 'cancelled' && (
                          <button style={styles.smallBtn} onClick={() => setEditing(true)}>Modifier</button>
                        )}
                        <button style={{ ...styles.smallBtn, color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={() => setConfirmDeleteId(selectedRepair.id)}>Supprimer</button>
                      </div>
                      <button style={styles.closeButton} onClick={() => setSelectedRepair(null)}>Fermer</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {payConfirmRepair && (
        <div style={styles.payOverlay} onClick={() => setPayConfirmRepair(null)}>
          <div style={styles.payModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Paiement du solde</h3>
            <p style={{ fontSize: 13, color: 'var(--color-gray-600)', marginBottom: 16 }}>
              Réparation #{payConfirmRepair.id} — {payConfirmRepair.device_model}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--color-gray-200)' }}>
              <span style={{ fontSize: 13 }}>Total dû</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{payConfirmRepair.total_due.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: 13 }}>Déjà payé</span>
              <span style={{ fontSize: 13 }}>{payConfirmRepair.amount_paid.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fef3c7', borderRadius: 'var(--radius)', padding: '10px 14px', marginTop: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Reste à payer</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>{payConfirmRepair.remaining.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                style={{ flex: 1, padding: '10px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 14, cursor: 'pointer' }}
                onClick={() => setPayConfirmRepair(null)}
              >
                Annuler
              </button>
              <button
                style={{ flex: 1, padding: '10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                onClick={async () => {
                  const result = await window.electronAPI.repairs.pay({
                    id: payConfirmRepair.id,
                    amount: payConfirmRepair.remaining,
                  })
                  if (result.success) {
                    setPayConfirmRepair(null)
                    loadRepairs()
                    handleView(payConfirmRepair)
                  } else {
                    alert(result.error || 'Erreur lors du paiement')
                  }
                }}
              >
                Confirmer le paiement
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCancelId !== null && (
        <ConfirmModal
          title="Annuler la réparation"
          message="Cette réparation sera annulée et le stock des pièces utilisées sera restauré. Cette action est irréversible."
          confirmLabel="Annuler la réparation"
          danger
          onConfirm={async () => {
            const result = await window.electronAPI.repairs.cancel({ id: confirmCancelId })
            setConfirmCancelId(null)
            if (result.success) { loadRepairs(); setSelectedRepair(null) }
          }}
          onCancel={() => setConfirmCancelId(null)}
        />
      )}

      {confirmDeleteId !== null && (
        <ConfirmModal
          title="Supprimer la réparation"
          message="Cette réparation sera définitivement supprimée et le stock des pièces utilisées sera restauré. Cette action est irréversible."
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            const result = await window.electronAPI.repairs.delete({ id: confirmDeleteId })
            setConfirmDeleteId(null)
            if (result.success) { loadRepairs(); setSelectedRepair(null) }
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

function EditRepairForm({ repair, onSaved, onCancel }: { repair: RepairDetail; onSaved: () => void; onCancel: () => void }) {
  const [deviceModel, setDeviceModel] = useState(repair.device_model)
  const [clientName, setClientName] = useState(repair.client_name || '')
  const [laborCost, setLaborCost] = useState(repair.labor_cost.toString())
  const [amountPaid, setAmountPaid] = useState(repair.amount_paid.toString())
  const [parts, setParts] = useState<Array<{ product: Product; quantity: number }>>([])
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.electronAPI.products.list({ showArchived: false }).then((p) => setProducts(p as Product[]))

    // Load existing parts — single products.list call
    window.electronAPI.products.list({ showArchived: true }).then((prods) => {
      const allProducts = prods as Product[]
      const results = repair.parts.map((part) => {
        const product = allProducts.find((p) => p.id === part.product_id)
        if (product) return { product, quantity: part.quantity }
        return null
      }).filter(Boolean) as Array<{ product: Product; quantity: number }>
      setParts(results)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.length < 1) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(() => {
      const ql = q.toLowerCase()
      setSearchResults(products.filter((p) => p.name.toLowerCase().includes(ql) || p.model.toLowerCase().includes(ql)).slice(0, 10))
      setShowResults(true)
    }, 200)
  }

  const addPart = (product: Product) => {
    const existing = parts.find((p) => p.product.id === product.id)
    if (existing) {
      if (existing.quantity >= product.quantity) return
      setParts(parts.map((p) => p.product.id === product.id ? { ...p, quantity: p.quantity + 1 } : p))
    } else {
      setParts([...parts, { product, quantity: 1 }])
    }
    setSearchQuery('')
    setShowResults(false)
  }

  const updatePartQty = (productId: number, qty: number) => {
    setParts(parts.map((p) => {
      if (p.product.id !== productId) return p
      if (qty > p.product.quantity) { setError(`Stock disponible : ${p.product.quantity}`); return p }
      return { ...p, quantity: Math.max(1, qty) }
    }))
  }

  const removePart = (productId: number) => setParts(parts.filter((p) => p.product.id !== productId))

  const totalParts = parts.reduce((sum, p) => sum + p.product.sale_price * p.quantity, 0)
  const labor = parseInt(laborCost, 10) || 0
  const paid = Math.min(parseInt(amountPaid, 10) || 0, totalParts + labor)
  const totalDue = totalParts + labor
  const remaining = totalDue - paid

  const handleSubmit = async () => {
    setError('')
    if (!deviceModel.trim()) { setError('Le modèle est obligatoire'); return }
    setSubmitting(true)
    const result = await window.electronAPI.repairs.update({
      id: repair.id,
      client_name: clientName.trim() || undefined,
      device_model: deviceModel.trim(),
      labor_cost: labor,
      amount_paid: paid,
      parts: parts.map((p) => ({ product_id: p.product.id, quantity: p.quantity })),
    })
    setSubmitting(false)
    if (result.success) onSaved()
    else setError(result.error || 'Erreur')
  }

  return (
    <div>
      <div style={styles.detailHeader}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Modifier #{repair.id}</h3>
        <button style={styles.closeBtn} onClick={onCancel}>✕</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <label style={styles.label}>Modèle</label>
      <input style={styles.input} value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} />

      <label style={styles.label}>Client</label>
      <input style={styles.input} value={clientName} onChange={(e) => setClientName(e.target.value)} />

      <div ref={searchRef} style={{ position: 'relative' }}>
        <label style={styles.label}>Pièces</label>
        <div style={styles.searchRow}>
          <Search size={16} style={{ color: 'var(--color-gray-400)' }} />
          <input style={styles.searchInput} value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Ajouter une pièce…" onFocus={() => searchResults.length > 0 && setShowResults(true)} />
        </div>
        {showResults && searchResults.length > 0 && (
          <div style={styles.searchResults}>
            {searchResults.map((p) => (
              <button key={p.id} style={styles.resultItem} onClick={() => addPart(p)}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>Stock: {p.quantity}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {parts.map((p) => (
        <div key={p.product.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <span style={{ flex: 1, fontSize: 13 }}>{p.product.name}</span>
          <input style={{ width: 50, padding: '4px 6px', border: '1px solid var(--color-gray-300)', borderRadius: 6, fontSize: 13, textAlign: 'center' }} type="number" min={1} max={p.product.quantity} value={p.quantity} onChange={(e) => updatePartQty(p.product.id, parseInt(e.target.value, 10) || 1)} />
          <button style={styles.removeBtn} onClick={() => removePart(p.product.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      <label style={styles.label}>Main d'œuvre</label>
      <input style={styles.input} type="number" min={0} value={laborCost} onChange={(e) => setLaborCost(e.target.value)} />

      <label style={styles.label}>Montant payé</label>
      <input style={styles.input} type="number" min={0} value={amountPaid} onChange={(e) => {
        const val = parseInt(e.target.value, 10) || 0
        if (val > totalDue) { setError(`Max: ${totalDue.toLocaleString()} FCFA`); return }
        setError(''); setAmountPaid(e.target.value)
      }} />

      <div style={{ marginTop: 12, padding: 10, background: '#f9fafb', borderRadius: 'var(--radius)' }}>
        <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>Total dû</span><span>{totalDue.toLocaleString()} FCFA</span></p>
        <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span>Reste</span><span>{remaining.toLocaleString()} FCFA</span></p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={{ flex: 1, padding: '9px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 14 }} onClick={onCancel}>Annuler</button>
        <button style={{ flex: 1, padding: '9px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 600 }} onClick={handleSubmit} disabled={submitting}>
          {submitting ? '…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--color-gray-900)', marginBottom: 20 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--color-gray-200)' },
  tab: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'none', border: 'none', borderBottom: '2px solid transparent', fontSize: 14, fontWeight: 500, color: 'var(--color-gray-500)', marginBottom: -1 },
  tabActive: { color: 'var(--color-primary)', borderBottomColor: 'var(--color-primary)', fontWeight: 600 },
  formLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' },
  formSection: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)', marginTop: 12, marginBottom: 4 },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--color-gray-900)', outline: 'none' },
  searchRow: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', padding: '9px 12px', background: 'var(--color-white)' },
  searchInput: { border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent' },
  searchResults: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 100, maxHeight: 200, overflow: 'auto', marginTop: 4 },
  resultItem: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: 'none', background: 'transparent', fontSize: 13, borderBottom: '1px solid var(--color-gray-100)', textAlign: 'left', cursor: 'pointer' },
  resultPrice: { display: 'block', fontSize: 12, color: 'var(--color-gray-500)' },
  resultStock: { fontSize: 12, color: 'var(--color-primary)', display: 'flex', alignItems: 'center' },
  partsList: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 },
  partItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)' },
  qtyInput: { width: 50, padding: '4px 6px', border: '1px solid var(--color-gray-300)', borderRadius: 6, fontSize: 13, textAlign: 'center' },
  removeBtn: { background: 'none', border: 'none', color: 'var(--color-gray-400)', padding: 4, display: 'flex' },
  summarySection: { background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 20, position: 'sticky', top: 84 },
  summaryRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 },
  error: { padding: '10px 14px', background: '#fef2f2', color: 'var(--color-danger)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 },
  submitBtn: { width: '100%', padding: '12px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 15, fontWeight: 600, marginTop: 16 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  filterSelect: { padding: '8px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, background: '#fff' },
  monthSummary: { fontSize: 13, fontWeight: 600, color: 'var(--color-gray-700)', background: 'var(--color-gray-100)', padding: '6px 12px', borderRadius: 12 },
  monthRow: { padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--color-gray-700)', background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)' },
  tableWrap: { background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)', fontSize: 13 },
  rowMuted: { opacity: 0.5 },
  rowWarning: { background: '#fef3c7' },
  statusBadge: { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--color-gray-100)', color: 'var(--color-gray-600)' },
  badgeCancelled: { background: '#fef2f2', color: 'var(--color-danger)' },
  badgeDelivered: { background: '#f0fdf4', color: 'var(--color-success)' },
  badgeProgress: { background: '#eff6ff', color: 'var(--color-primary)' },
  badgeCompleted: { background: '#fef3c7', color: '#92400e' },
  actionBtn: { background: 'none', border: 'none', fontSize: 13, color: 'var(--color-primary)', padding: '4px 8px', cursor: 'pointer' },
  detailOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  detailModal: { background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 24, boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 650, display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflowY: 'auto' },
  closeButton: { padding: '8px 18px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 14, color: 'var(--color-gray-700)', cursor: 'pointer' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--color-gray-400)', padding: 4, cursor: 'pointer' },
  detailInfo: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--color-gray-600)' },
  statusActions: { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  statusBtn: { padding: '6px 14px', border: 'none', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, background: 'var(--color-primary)', color: '#fff', cursor: 'pointer' },
  smallBtn: { padding: '4px 10px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 12, background: '#fff', cursor: 'pointer' },
  payOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  payModal: { background: 'var(--color-white)', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 360, padding: 24 },
}
