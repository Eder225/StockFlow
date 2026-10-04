import { Fragment, useEffect, useMemo, useState, useRef } from 'react'
import { Plus, Trash2, Search, X, ShoppingCart, CreditCard, Banknote, ChevronDown, Pencil } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import SaleEditModal from '../components/SaleEditModal'

const saleMonthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function saleMonthLabel(m: string): string {
  const [y, mm] = m.split('-')
  return `${saleMonthNames[parseInt(mm, 10) - 1] || mm} ${y}`
}

type Tab = 'create' | 'history'

interface CartItem {
  product: Product
  quantity: number
}

export default function Sales() {
  const [tab, setTab] = useState<Tab>('create')

  return (
    <div>
      <h1 style={styles.pageTitle}>Ventes</h1>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }}
          onClick={() => setTab('create')}
        >
          <ShoppingCart size={18} /> Nouvelle vente
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }}
          onClick={() => setTab('history')}
        >
          Historique
        </button>
      </div>

      {tab === 'create' && <CreateSale />}
      {tab === 'history' && <SaleHistory />}
    </div>
  )
}

function CreateSale() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [showResults, setShowResults] = useState(false)
  const [clientName, setClientName] = useState('')
  const [discount, setDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_money'>('cash')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
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

  const addToCart = (product: Product) => {
    setError('')
    setSuccess('')
    const existing = cart.find((c) => c.product.id === product.id)
    if (existing) {
      if (existing.quantity >= product.quantity) {
        setError(`Stock disponible : ${product.quantity}`)
        return
      }
      setCart(cart.map((c) =>
        c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
      ))
    } else {
      if (product.quantity < 1) {
        setError('Stock insuffisant')
        return
      }
      setCart([...cart, { product, quantity: 1 }])
    }
    setSearchQuery('')
    setShowResults(false)
  }

  const updateQuantity = (productId: number, quantity: number) => {
    setError('')
    setCart(cart.map((c) => {
      if (c.product.id !== productId) return c
      if (quantity > c.product.quantity) {
        setError(`Stock disponible : ${c.product.quantity}`)
        return c
      }
      return { ...c, quantity: Math.max(1, quantity) }
    }))
  }

  const removeItem = (productId: number) => {
    setCart(cart.filter((c) => c.product.id !== productId))
  }

  const subtotal = cart.reduce((sum, c) => sum + c.product.sale_price * c.quantity, 0)
  const discountNum = Math.min(Math.max(0, parseInt(discount, 10) || 0), subtotal)
  const total = subtotal - discountNum

  const handleValidate = async () => {
    setError('')
    setSuccess('')

    if (cart.length === 0) { setError('Le panier est vide'); return }
    if (!paymentMethod) { setError('Sélectionnez un mode de paiement'); return }

    setSubmitting(true)
    const result = await window.electronAPI.sales.create({
      client_name: clientName.trim() || undefined,
      discount_amount: discountNum,
      payment_method: paymentMethod,
      items: cart.map((c) => ({ product_id: c.product.id, quantity: c.quantity })),
    })
    setSubmitting(false)

    if (result.success) {
      setSuccess(`Vente enregistrée #${result.saleId} — ${result.total?.toLocaleString()} FCFA`)
      setCart([])
      setClientName('')
      setDiscount('')
      setPaymentMethod('cash')
    } else {
      setError(result.error || 'Erreur lors de la validation')
    }
  }

  return (
    <div style={styles.saleLayout}>
      <div style={styles.leftPanel}>
        <div ref={searchRef} style={{ position: 'relative' }}>
          <label style={styles.label}>Client (facultatif)</label>
          <input
            style={styles.input}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Nom du client"
            maxLength={100}
          />

          <label style={styles.label}>Rechercher un produit</label>
          <div style={styles.searchRow}>
            <Search size={16} style={{ color: 'var(--color-gray-400)' }} />
            <input
              style={styles.searchInput}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Tapez le nom, la marque ou le modèle…"
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
            />
          </div>

          {showResults && searchResults.length > 0 && (
            <div style={styles.searchResults}>
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  style={styles.resultItem}
                  onClick={() => addToCart(p)}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span style={styles.resultPrice}>{p.sale_price.toLocaleString()} FCFA</span>
                  </div>
                  <span style={styles.resultStock}>
                    Stock: {p.quantity}
                    <Plus size={14} style={{ marginLeft: 8 }} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.paymentSection}>
          <label style={styles.label}>Mode de paiement</label>
          <div style={styles.paymentRow}>
            <button
              style={{ ...styles.paymentBtn, ...(paymentMethod === 'cash' ? styles.paymentBtnActive : {}) }}
              onClick={() => setPaymentMethod('cash')}
            >
              <Banknote size={18} /> Espèces
            </button>
            <button
              style={{ ...styles.paymentBtn, ...(paymentMethod === 'mobile_money' ? styles.paymentBtnActive : {}) }}
              onClick={() => setPaymentMethod('mobile_money')}
            >
              <CreditCard size={18} /> Mobile Money
            </button>
          </div>
        </div>
      </div>

      <div style={styles.rightPanel}>
        <h3 style={styles.cartTitle}>
          <ShoppingCart size={18} /> Panier ({cart.length})
        </h3>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {cart.length === 0 ? (
          <div style={styles.emptyCart}>
            <ShoppingCart size={40} style={{ color: 'var(--color-gray-300)' }} />
            <p>Panier vide</p>
            <p style={{ fontSize: 13, color: 'var(--color-gray-400)' }}>Recherchez un produit pour commencer</p>
          </div>
        ) : (
          <div style={styles.cartItems}>
            {cart.map((c) => (
              <div key={c.product.id} style={styles.cartItem}>
                <div style={styles.cartItemInfo}>
                  <span style={styles.cartItemName}>{c.product.name}</span>
                  <span style={styles.cartItemPrice}>{c.product.sale_price.toLocaleString()} FCFA</span>
                </div>
                <div style={styles.cartItemActions}>
                  <input
                    style={styles.qtyInput}
                    type="number"
                    min={1}
                    max={c.product.quantity}
                    value={c.quantity}
                    onChange={(e) => updateQuantity(c.product.id, parseInt(e.target.value, 10) || 1)}
                  />
                  <span style={styles.cartItemSubtotal}>
                    {(c.product.sale_price * c.quantity).toLocaleString()} FCFA
                  </span>
                  <button style={styles.removeBtn} onClick={() => removeItem(c.product.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <>
            <div style={styles.discountRow}>
              <span style={styles.discountLabel}>Remise (FCFA)</span>
              <input
                style={styles.discountInput}
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div style={styles.totalRow}>
              <span>Sous-total</span>
              <span>{subtotal.toLocaleString()} FCFA</span>
            </div>
            {discountNum > 0 && (
              <div style={{ ...styles.totalRow, color: 'var(--color-danger)' }}>
                <span>Remise</span>
                <span>-{discountNum.toLocaleString()} FCFA</span>
              </div>
            )}
            <div style={{ ...styles.totalRow, fontWeight: 700, fontSize: 18, borderTop: '2px solid var(--color-gray-200)', paddingTop: 12, marginTop: 8 }}>
              <span>Total</span>
              <span>{total.toLocaleString()} FCFA</span>
            </div>

            <button style={styles.validateBtn} onClick={handleValidate} disabled={submitting}>
              {submitting ? 'Validation…' : 'Valider la vente'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const SALE_PAGE_SIZE = 30

function SaleHistory() {
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [page, setPage] = useState(0)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [editSale, setEditSale] = useState<SaleDetail | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const loadSales = async () => {
    setLoading(true)
    const list = await window.electronAPI.sales.list(filterStatus ? { status: filterStatus } : undefined)
    setSales(list as Sale[])
    setLoading(false)
  }

  useEffect(() => { loadSales(); setPage(0) }, [filterStatus])

  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of sales) set.add(s.created_at.slice(0, 7))
    return Array.from(set).sort().reverse()
  }, [sales])

  const filteredSales = useMemo(() => {
    if (!selectedMonth) return sales
    return sales.filter((s) => s.created_at.slice(0, 7) === selectedMonth)
  }, [sales, selectedMonth])

  const monthTotal = useMemo(() => {
    return filteredSales.filter((s) => s.status === 'validated').reduce((sum, s) => sum + s.total, 0)
  }, [filteredSales])

  const salePageSlice = filteredSales.slice(page * SALE_PAGE_SIZE, (page + 1) * SALE_PAGE_SIZE)

  const saleGroups = useMemo(() => {
    const map = new Map<string, Sale[]>()
    for (const s of salePageSlice) {
      const k = s.created_at.slice(0, 7)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(s)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [salePageSlice])

  const handleView = async (sale: Sale) => {
    const detail = await window.electronAPI.sales.getById({ id: sale.id })
    setSelectedSale(detail as SaleDetail)
  }

  const handleEdit = async (sale: Sale) => {
    const detail = await window.electronAPI.sales.getById({ id: sale.id })
    setEditSale(detail as SaleDetail)
  }

  const handleDelete = async (id: number) => {
    setConfirmDeleteId(id)
  }

  const handleSaveEdit = async (data: {
    id: number; client_name?: string; discount_amount: number
    payment_method: 'cash' | 'mobile_money'; created_at?: string
  }) => {
    const result = await window.electronAPI.sales.update(data)
    if (result.success) {
      setEditSale(null)
      setSuccessMsg('Vente modifiée avec succès')
      setTimeout(() => setSuccessMsg(''), 3000)
      await loadSales()
      if (selectedSale?.id === data.id) {
        const updated = await window.electronAPI.sales.getById({ id: data.id })
        setSelectedSale(updated as SaleDetail)
      }
    }
    return result
  }

  const formatDate = (d: string) => {
    const date = new Date(d.replace(' ', 'T') + 'Z')
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      {successMsg && <div style={styles.successMsg}>{successMsg}</div>}

      <div style={styles.filterRow}>
        <select style={styles.filterSelect} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }}>
          <option value="">Tous les statuts</option>
          <option value="validated">Validées</option>
          <option value="cancelled">Annulées</option>
        </select>
        <select style={styles.filterSelect} value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setPage(0) }} title="Filtrer par mois">
          <option value="">Tous les mois</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{saleMonthLabel(m)}</option>
          ))}
        </select>
        {selectedMonth && (
          <span style={styles.monthSummary}>{filteredSales.length} vente{filteredSales.length > 1 ? 's' : ''} — {monthTotal.toLocaleString()} FCFA en {saleMonthLabel(selectedMonth)}</span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-gray-400)' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'block' }}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Client</th>
                  <th style={styles.th}>Articles</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
                  <th style={styles.th}>Paiement</th>
                  <th style={styles.th}>Statut</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-gray-400)' }}>Aucune vente</td></tr>
                ) : saleGroups.map(([month, items]) => (
                  <Fragment key={'month-' + month}>
                    <tr>
                      <td colSpan={7} style={styles.monthRow}>{saleMonthLabel(month)} — {items.length} vente{items.length > 1 ? 's' : ''}</td>
                    </tr>
                    {items.map((s) => (
                      <tr key={s.id} style={s.status === 'cancelled' ? styles.rowCancelled : {}}>
                        <td style={styles.td}>{formatDate(s.created_at)}</td>
                        <td style={styles.td}>{s.client_name || '—'}</td>
                        <td style={styles.td}>{s.item_count}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{s.total.toLocaleString()} FCFA</td>
                        <td style={styles.td}>{s.payment_method === 'cash' ? 'Espèces' : 'Mobile Money'}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            ...(s.status === 'cancelled' ? styles.statusCancelled : styles.statusValidated),
                          }}>
                            {s.status === 'cancelled' ? 'Annulée' : 'Validée'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <button style={styles.actionBtn} onClick={() => handleView(s)}>Détail</button>
                          {s.status === 'validated' && (
                            <>
                              <button style={styles.actionBtn} onClick={() => handleEdit(s)}>
                                <Pencil size={13} /> Modifier
                              </button>
                              <button style={{ ...styles.actionBtn, color: 'var(--color-danger)' }} onClick={() => handleDelete(s.id)}>
                                <Trash2 size={13} /> Supprimer
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {filteredSales.length > SALE_PAGE_SIZE && (
              <div style={styles.pagination}>
                <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>← Précédent</button>
                <span style={styles.pageInfo}>Page {page + 1} / {Math.ceil(filteredSales.length / SALE_PAGE_SIZE)} ({filteredSales.length} ventes{selectedMonth ? ` — ${saleMonthLabel(selectedMonth)}` : ''})</span>
                <button style={styles.pageBtn} disabled={(page + 1) * SALE_PAGE_SIZE >= filteredSales.length} onClick={() => setPage(page + 1)}>Suivant →</button>
              </div>
            )}
          </div>

          {selectedSale && (
            <div style={styles.detailOverlay} onClick={() => setSelectedSale(null)}>
              <div style={styles.detailModal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.detailHeader}>
                  <h3 style={{ fontSize: 18, fontWeight: 700 }}>Détails de la vente #{selectedSale.id}</h3>
                  <button style={styles.closeBtn} onClick={() => setSelectedSale(null)}><X size={20} /></button>
                </div>
                <div style={styles.detailInfo}>
                  <p><strong>Date :</strong> {formatDate(selectedSale.created_at)}</p>
                  <p><strong>Client :</strong> {selectedSale.client_name || '—'}</p>
                  <p><strong>Paiement :</strong> {selectedSale.payment_method === 'cash' ? 'Espèces' : 'Mobile Money'}</p>
                  <p><strong>Statut :</strong> <span style={{ fontWeight: 600, color: selectedSale.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-success)' }}>{selectedSale.status === 'cancelled' ? 'Annulée' : 'Validée'}</span></p>
                </div>
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--color-gray-200)', borderRadius: 8, marginTop: 12 }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Produit</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Prix unitaire</th>
                        <th style={{ ...styles.th, textAlign: 'center' }}>Qté</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Sous-total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items.map((item) => (
                        <tr key={item.id}>
                          <td style={styles.td}>{item.product_name}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{item.unit_price.toLocaleString()} FCFA</td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{item.subtotal.toLocaleString()} FCFA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '12px 0 0 0', borderTop: '1px solid var(--color-gray-200)', marginTop: 12 }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '4px 0' }}>
                    <span>Sous-total</span><span>{selectedSale.subtotal.toLocaleString()} FCFA</span>
                  </p>
                  {selectedSale.discount_amount > 0 && (
                    <p style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-danger)', fontSize: 14, margin: '4px 0' }}>
                      <span>Remise</span><span>-{selectedSale.discount_amount.toLocaleString()} FCFA</span>
                    </p>
                  )}
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 17, marginTop: 8 }}>
                    <span>Total</span><span>{selectedSale.total.toLocaleString()} FCFA</span>
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button style={styles.closeButton} onClick={() => setSelectedSale(null)}>Fermer</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {confirmDeleteId !== null && (
        <ConfirmModal
          title="Supprimer la vente"
          message="Cette vente sera définitivement supprimée. Le stock sera restauré si la vente était validée. Cette action est irréversible."
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            const result = await window.electronAPI.sales.delete({ id: confirmDeleteId })
            setConfirmDeleteId(null)
            if (result.success) {
              setSuccessMsg('Vente supprimée avec succès')
              setTimeout(() => setSuccessMsg(''), 3000)
              loadSales()
              if (selectedSale?.id === confirmDeleteId) setSelectedSale(null)
            }
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {editSale && (
        <SaleEditModal
          sale={editSale}
          onSave={handleSaveEdit}
          onClose={() => setEditSale(null)}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  successMsg: {
    padding: '10px 14px', background: '#f0fdf4', color: 'var(--color-success)',
    borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 16,
  },
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--color-gray-900)', marginBottom: 20 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--color-gray-200)' },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'none',
    border: 'none', borderBottom: '2px solid transparent', fontSize: 14, fontWeight: 500, color: 'var(--color-gray-500)',
    marginBottom: -1,
  },
  tabActive: { color: 'var(--color-primary)', borderBottomColor: 'var(--color-primary)', fontWeight: 600 },
  saleLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' },
  leftPanel: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)', marginTop: 12, marginBottom: 4 },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--color-gray-900)', outline: 'none' },
  searchRow: {
    display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)', padding: '9px 12px', background: 'var(--color-white)',
  },
  searchInput: { border: 'none', outline: 'none', flex: 1, fontSize: 14, background: 'transparent' },
  searchResults: {
    position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-white)',
    border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
    zIndex: 100, maxHeight: 240, overflow: 'auto', marginTop: 4,
  },
  resultItem: {
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', border: 'none', background: 'transparent', fontSize: 13,
    borderBottom: '1px solid var(--color-gray-100)', textAlign: 'left', cursor: 'pointer',
  },
  resultPrice: { display: 'block', fontSize: 12, color: 'var(--color-gray-500)' },
  resultStock: { fontSize: 12, color: 'var(--color-primary)', display: 'flex', alignItems: 'center' },
  paymentSection: { marginTop: 8 },
  paymentRow: { display: 'flex', gap: 8 },
  paymentBtn: {
    flex: 1, padding: '10px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)',
    background: 'var(--color-white)', fontSize: 14, fontWeight: 500, color: 'var(--color-gray-600)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  paymentBtnActive: { background: 'var(--color-primary-light)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', fontWeight: 600 },
  rightPanel: {
    background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)',
    padding: 20, position: 'sticky', top: 84, maxHeight: 'calc(100vh - 140px)', overflow: 'auto',
  },
  cartTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, marginBottom: 12 },
  error: { padding: '10px 14px', background: '#fef2f2', color: 'var(--color-danger)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 },
  success: { padding: '10px 14px', background: '#f0fdf4', color: 'var(--color-success)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 },
  emptyCart: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 0', color: 'var(--color-gray-400)' },
  cartItems: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  cartItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius)',
    border: '1px solid var(--color-gray-200)',
  },
  cartItemInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  cartItemName: { fontSize: 13, fontWeight: 500 },
  cartItemPrice: { fontSize: 12, color: 'var(--color-gray-500)' },
  cartItemActions: { display: 'flex', alignItems: 'center', gap: 8 },
  qtyInput: { width: 50, padding: '4px 6px', border: '1px solid var(--color-gray-300)', borderRadius: 6, fontSize: 13, textAlign: 'center' },
  cartItemSubtotal: { fontSize: 14, fontWeight: 600, minWidth: 80, textAlign: 'right' },
  removeBtn: { background: 'none', border: 'none', color: 'var(--color-gray-400)', padding: 4, display: 'flex' },
  discountRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  discountLabel: { fontSize: 14, color: 'var(--color-gray-600)' },
  discountInput: { width: 100, padding: '6px 10px', border: '1px solid var(--color-gray-300)', borderRadius: 6, fontSize: 14, textAlign: 'right' },
  totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 14 },
  validateBtn: {
    width: '100%', padding: '12px', background: 'var(--color-primary)', color: 'var(--color-white)',
    border: 'none', borderRadius: 'var(--radius)', fontSize: 15, fontWeight: 600, marginTop: 16,
  },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  filterSelect: { padding: '8px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--color-white)' },
  monthSummary: { fontSize: 13, fontWeight: 600, color: 'var(--color-gray-700)', background: 'var(--color-gray-100)', padding: '6px 12px', borderRadius: 12 },
  monthRow: { padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--color-gray-700)', background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)' },
  tableWrap: { background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)', fontSize: 13 },
  rowCancelled: { opacity: 0.6 },
  statusBadge: { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  statusValidated: { background: '#f0fdf4', color: 'var(--color-success)' },
  statusCancelled: { background: '#fef2f2', color: 'var(--color-danger)' },
  actionBtn: { background: 'none', border: 'none', fontSize: 13, color: 'var(--color-primary)', padding: '4px 8px', cursor: 'pointer' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '12px 16px', borderTop: '1px solid var(--color-gray-200)' },
  pageBtn: { padding: '6px 14px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: 'var(--color-white)', fontSize: 13, color: 'var(--color-gray-700)', cursor: 'pointer' },
  pageInfo: { fontSize: 13, color: 'var(--color-gray-500)' },
  detailOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
  },
  detailModal: {
    background: 'var(--color-white)', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)',
    padding: 24, boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 650, display: 'flex', flexDirection: 'column',
    maxHeight: '90vh', overflowY: 'auto',
  },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--color-gray-400)', padding: 4, cursor: 'pointer' },
  detailInfo: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'var(--color-gray-600)', background: 'var(--color-gray-50)', padding: 12, borderRadius: 8 },
  closeButton: {
    padding: '8px 18px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)',
    background: '#fff', fontSize: 14, color: 'var(--color-gray-700)', cursor: 'pointer',
  },
}
