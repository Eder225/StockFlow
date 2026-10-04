import { useEffect, useState } from 'react'
import { X, RefreshCw } from 'lucide-react'

interface Props {
  product?: Product | null
  categories: Category[]
  brands: Brand[]
  onSave: (data: {
    id?: number
    name: string
    category_id: number
    brand_id: number
    model: string
    purchase_price: number
    sale_price: number
    initial_quantity: number
  }) => Promise<void>
  onClose: () => void
}

export default function ProductForm({ product, categories, brands, onSave, onClose }: Props) {
  const isEditing = !!product

  const [categoryId, setCategoryId] = useState(product?.category_id ?? -1)
  const [brandId, setBrandId] = useState(product?.brand_id ?? -1)
  const [model, setModel] = useState(product?.model ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [purchasePrice, setPurchasePrice] = useState(product?.purchase_price?.toString() ?? '')
  const [salePrice, setSalePrice] = useState(product?.sale_price?.toString() ?? '')
  const [initialQuantity, setInitialQuantity] = useState('')
  const [nameManuallyEdited, setNameManuallyEdited] = useState(!!product)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const catName = categories.find((c) => c.id === categoryId)?.name ?? ''
  const brandName = brands.find((b) => b.id === brandId)?.name ?? ''

  const generatedName = `${catName} ${brandName} ${model}`.trim()

  useEffect(() => {
    if (!nameManuallyEdited) {
      setName(generatedName)
    }
  }, [generatedName, nameManuallyEdited])

  const handleNameChange = (value: string) => {
    setNameManuallyEdited(true)
    setName(value)
  }

  const handleRegenerate = () => {
    setNameManuallyEdited(false)
    setName(generatedName)
  }

  const handleSubmit = async () => {
    setError('')

    if (categoryId <= 0) { setError('Veuillez sélectionner une catégorie'); return }
    if (brandId < 0) { setError('Veuillez sélectionner une marque'); return }
    if (!model.trim()) { setError('Le modèle ne peut pas être vide'); return }
    if (model.trim().length > 100) { setError('Le modèle ne doit pas dépasser 100 caractères'); return }
    if (!name.trim()) { setError('Le nom ne peut pas être vide'); return }
    if (name.trim().length > 150) { setError('Le nom ne doit pas dépasser 150 caractères'); return }

    const pp = parseInt(purchasePrice, 10)
    if (isNaN(pp) || pp < 0) { setError('Le prix d\'achat doit être un entier ≥ 0'); return }

    const sp = parseInt(salePrice, 10)
    if (isNaN(sp) || sp < 0) { setError('Le prix de vente doit être un entier ≥ 0'); return }

    if (!isEditing) {
      const iq = parseInt(initialQuantity, 10)
      if (isNaN(iq) || iq < 0) { setError('La quantité initiale doit être un entier ≥ 0'); return }
    }

    setSaving(true)
    try {
      await onSave({
        id: product?.id,
        name: name.trim(),
        category_id: categoryId,
        brand_id: brandId,
        model: model.trim(),
        purchase_price: pp,
        sale_price: sp,
        initial_quantity: isEditing ? 0 : parseInt(initialQuantity, 10),
      })
      onClose()
    } catch {
      setError('Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{isEditing ? 'Modifier le produit' : 'Ajouter un produit'}</h2>
          <button style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.grid}>
          <div>
            <label style={styles.label}>Catégorie</label>
            <select style={styles.input} value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
              <option value={-1} disabled>Sélectionner une catégorie</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>Marque</label>
            <select style={styles.input} value={brandId} onChange={(e) => setBrandId(Number(e.target.value))}>
              <option value={-1} disabled>Sélectionner une marque</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value={0}>Autre</option>
            </select>
          </div>
        </div>

        <label style={styles.label}>Modèle</label>
        <input style={styles.input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex: Galaxy A15" />

        <label style={styles.label}>Nom</label>
        <div style={styles.nameRow}>
          <input
            style={{ ...styles.input, flex: 1 }}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
          {nameManuallyEdited && (
            <button style={styles.regenerateBtn} onClick={handleRegenerate} title="Régénérer le nom">
              <RefreshCw size={16} />
            </button>
          )}
        </div>

        <div style={styles.grid}>
          <div>
            <label style={styles.label}>Prix d'achat (FCFA)</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
          </div>
          <div>
            <label style={styles.label}>Prix de vente (FCFA)</label>
            <input
              style={{
                ...styles.input,
                ...(salePrice && purchasePrice && Number(salePrice) < Number(purchasePrice)
                  ? { borderColor: 'var(--color-warning)' }
                  : {}),
              }}
              type="number"
              min={0}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
            {salePrice && purchasePrice && Number(salePrice) < Number(purchasePrice) && (
              <span style={styles.warning}>Prix de vente inférieur au prix d'achat</span>
            )}
          </div>
        </div>

        {!isEditing && (
          <div>
            <label style={styles.label}>Quantité initiale</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              value={initialQuantity}
              onChange={(e) => setInitialQuantity(e.target.value)}
              placeholder="0"
            />
          </div>
        )}

        <div style={styles.actions}>
          <button style={styles.btnSecondary} onClick={onClose}>Annuler</button>
          <button style={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Enregistrement…' : isEditing ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: 'var(--color-white)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg)',
    width: '100%',
    maxWidth: 520,
    padding: 24,
    maxHeight: '90vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-gray-400)',
    padding: 4,
  },
  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    color: 'var(--color-danger)',
    borderRadius: 'var(--radius)',
    fontSize: 13,
    marginBottom: 16,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-gray-700)',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)',
    fontSize: 14,
    color: 'var(--color-gray-900)',
    outline: 'none',
    background: 'var(--color-white)',
  },
  nameRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  regenerateBtn: {
    background: 'var(--color-gray-100)',
    border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)',
    padding: '9px 10px',
    color: 'var(--color-gray-500)',
    display: 'flex',
  },
  warning: {
    fontSize: 12,
    color: 'var(--color-warning)',
    marginTop: 2,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 24,
  },
  btnSecondary: {
    padding: '9px 18px',
    background: 'var(--color-white)',
    color: 'var(--color-gray-700)',
    border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)',
    fontSize: 14,
    fontWeight: 500,
  },
  btnPrimary: {
    padding: '9px 18px',
    background: 'var(--color-primary)',
    color: 'var(--color-white)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: 14,
    fontWeight: 600,
  },
}
