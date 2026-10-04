import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Package, Archive, RotateCcw, TrendingUp, AlertTriangle } from 'lucide-react'
import ProductForm from '../components/ProductForm'
import StockAdjustModal from '../components/StockAdjustModal'
import ConfirmModal from '../components/ConfirmModal'

const PAGE_SIZE = 50

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get('filter') === 'lowstock')

  const loadData = async () => {
    const [p, c, b] = await Promise.all([
      window.electronAPI.products.list({ showArchived }),
      window.electronAPI.categories.list(),
      window.electronAPI.brands.list(),
    ])
    setProducts(p as Product[])
    setCategories(c as Category[])
    setBrands(b as Brand[])
    setLoading(false)
  }

  useEffect(() => {
    setPage(0)
    loadData()
  }, [showArchived])

  useEffect(() => { setPage(0) }, [search, sortKey, sortDir])

  useEffect(() => {
    setLowStockOnly(searchParams.get('filter') === 'lowstock')
  }, [searchParams])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = products
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.category_name.toLowerCase().includes(q) ||
        p.brand_name.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      const aVal = (a as any)[sortKey] ?? ''
      const bVal = (b as any)[sortKey] ?? ''
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal))
      return sortDir === 'asc' ? cmp : -cmp
    })
    if (lowStockOnly) {
      list = list.filter((p) => p.quantity <= 2)
    }
    return list
  }, [products, search, sortKey, sortDir, lowStockOnly])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleCreate = async (data: any) => {
    const result = await window.electronAPI.products.create(data)
    if (!result.success) throw new Error('Échec de la création')
    await loadData()
  }

  const handleUpdate = async (data: any) => {
    const result = await window.electronAPI.products.update(data)
    if (!result.success) throw new Error(result.error || 'Échec de la modification')
    await loadData()
  }

  const handleArchive = async (product: Product) => {
    setConfirmArchive(product)
  }

  const handleRestore = async (product: Product) => {
    await window.electronAPI.products.restore({ id: product.id })
    await loadData()
  }

  const handleAdjustStock = async (data: { product_id: number; movement_type: 'in' | 'out'; quantity: number; justification?: string }) => {
    const result = await window.electronAPI.products.adjustStock(data)
    if (result.success) {
      setAdjustProduct(null)
      await loadData()
    }
    return result
  }

  const sortArrow = (key: string) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-gray-400)' }}>Chargement…</div>
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Produits</h1>
        <button style={styles.addBtn} onClick={() => setShowForm(true)}>
          <Plus size={18} /> Ajouter un produit
        </button>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.searchBox}>
          <Search size={16} style={{ color: 'var(--color-gray-400)' }} />
          <input
            style={styles.searchInput}
            placeholder="Rechercher un produit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          style={{ ...styles.archivedToggle, ...(showArchived ? styles.archivedToggleActive : {}) }}
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive size={16} />
          {showArchived ? 'Produits actifs' : 'Produits archivés'}
        </button>
        <button
          style={{ ...styles.archivedToggle, ...(lowStockOnly ? styles.archivedToggleActive : {}) }}
          onClick={() => {
            if (lowStockOnly) {
              searchParams.delete('filter')
              setSearchParams(searchParams)
            } else {
              setSearchParams({ filter: 'lowstock' })
            }
          }}
        >
          <AlertTriangle size={16} />
          Stock faible
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={styles.empty}>
          <Package size={48} style={{ color: 'var(--color-gray-300)' }} />
          <p>Aucun produit trouvé</p>
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => handleSort('name')}>Nom{sortArrow('name')}</th>
                <th style={styles.th} onClick={() => handleSort('category_name')}>Catégorie{sortArrow('category_name')}</th>
                <th style={styles.th} onClick={() => handleSort('brand_name')}>Marque{sortArrow('brand_name')}</th>
                <th style={styles.th} onClick={() => handleSort('model')}>Modèle{sortArrow('model')}</th>
                <th style={{ ...styles.th, textAlign: 'right' }} onClick={() => handleSort('purchase_price')}>Prix achat{sortArrow('purchase_price')}</th>
                <th style={{ ...styles.th, textAlign: 'right' }} onClick={() => handleSort('sale_price')}>Prix vente{sortArrow('sale_price')}</th>
                <th style={{ ...styles.th, textAlign: 'center' }} onClick={() => handleSort('quantity')}>Stock{sortArrow('quantity')}</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((p) => (
                <tr key={p.id} style={p.quantity <= 2 ? styles.rowWarning : {}}>
                  <td style={styles.td}>{p.name}</td>
                  <td style={styles.td}>{p.category_name}</td>
                  <td style={styles.td}>{p.brand_name}</td>
                  <td style={styles.td}>{p.model}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{p.purchase_price.toLocaleString()} FCFA</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{p.sale_price.toLocaleString()} FCFA</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span style={{
                      ...styles.stockBadge,
                      ...(p.quantity <= 2 ? styles.stockLow : {}),
                      ...(p.quantity === 0 ? styles.stockOut : {}),
                    }}>
                      {p.quantity}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      {!showArchived && (
                        <>
                          <button style={styles.actionBtn} onClick={() => { setEditProduct(p); setShowForm(true) }} title="Modifier">📝</button>
                          <button style={styles.actionBtn} onClick={() => setAdjustProduct(p)} title="Ajuster le stock"><TrendingUp size={16} /></button>
                          <button style={styles.actionBtn} onClick={() => handleArchive(p)} title="Archiver"><Archive size={16} /></button>
                        </>
                      )}
                      {showArchived && (
                        <button style={styles.actionBtn} onClick={() => handleRestore(p)} title="Restaurer"><RotateCcw size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > PAGE_SIZE && (
            <div style={styles.pagination}>
              <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>← Précédent</button>
              <span style={styles.pageInfo}>Page {page + 1} / {Math.ceil(filtered.length / PAGE_SIZE)} ({filtered.length} produits)</span>
              <button style={styles.pageBtn} disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(page + 1)}>Suivant →</button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <ProductForm
          product={editProduct}
          categories={categories}
          brands={brands}
          onSave={editProduct ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditProduct(null) }}
        />
      )}

      {adjustProduct && (
        <StockAdjustModal
          product={adjustProduct}
          onSave={handleAdjustStock}
          onClose={() => setAdjustProduct(null)}
        />
      )}

      {confirmArchive && (
        <ConfirmModal
          title="Archiver le produit"
          message={`Le produit "${confirmArchive.name}" sera archivé et n'apparaîtra plus dans les nouvelles ventes ou réparations.`}
          confirmLabel="Archiver"
          danger
          onConfirm={async () => {
            await window.electronAPI.products.archive({ id: confirmArchive.id })
            setConfirmArchive(null)
            await loadData()
          }}
          onCancel={() => setConfirmArchive(null)}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--color-gray-900)',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 18px',
    background: 'var(--color-primary)',
    color: 'var(--color-white)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: 14,
    fontWeight: 600,
  },
  toolbar: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--color-white)',
    border: '1px solid var(--color-gray-200)',
    borderRadius: 'var(--radius)',
    padding: '8px 14px',
    flex: 1,
    maxWidth: 320,
  },
  searchInput: {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: 14,
    color: 'var(--color-gray-700)',
    width: '100%',
  },
  archivedToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: 'var(--color-white)',
    border: '1px solid var(--color-gray-200)',
    borderRadius: 'var(--radius)',
    fontSize: 13,
    color: 'var(--color-gray-600)',
  },
  archivedToggleActive: {
    background: 'var(--color-primary-light)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary)',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 60,
    color: 'var(--color-gray-400)',
  },
  tableWrap: {
    background: 'var(--color-white)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-gray-200)',
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    padding: '12px 14px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-gray-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--color-gray-200)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '11px 14px',
    borderBottom: '1px solid var(--color-gray-100)',
    color: 'var(--color-gray-700)',
  },
  rowWarning: {
    background: 'var(--color-warning-light)',
  },
  stockBadge: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    background: 'var(--color-gray-100)',
    color: 'var(--color-gray-700)',
  },
  stockLow: {
    background: '#fef3c7',
    color: '#92400e',
  },
  stockOut: {
    background: '#fef2f2',
    color: 'var(--color-danger)',
  },
  actions: {
    display: 'flex',
    gap: 4,
  },
  actionBtn: {
    background: 'none',
    border: '1px solid transparent',
    borderRadius: 6,
    padding: '4px 6px',
    color: 'var(--color-gray-500)',
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
  },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '12px 16px', borderTop: '1px solid var(--color-gray-200)' },
  pageBtn: { padding: '6px 14px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: 'var(--color-white)', fontSize: 13, color: 'var(--color-gray-700)', cursor: 'pointer' },
  pageInfo: { fontSize: 13, color: 'var(--color-gray-500)' },
}
