import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'

const JUSTIFICATIONS_OUT = [
  'Casse / Produit défectueux',
  'Erreur d\'inventaire',
]

const JUSTIFICATIONS_IN = [
  'Retour client',
  'Complément d\'inventaire',
]

interface Props {
  product: Product
  onSave: (data: { product_id: number; movement_type: 'in' | 'out'; quantity: number; justification?: string }) => Promise<{ success: boolean; error?: string }>
  onClose: () => void
}

export default function StockAdjustModal({ product, onSave, onClose }: Props) {
  const [type, setType] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState('')
  const [justification, setJustification] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setError('')

    const q = parseInt(quantity, 10)
    if (isNaN(q) || q <= 0) { setError('La quantité doit être un entier > 0'); return }
    if (type === 'out' && q > product.quantity) {
      setError(`Stock insuffisant. Stock actuel : ${product.quantity}.`)
      return
    }
    if (!justification) { setError('Veuillez sélectionner une justification'); return }

    setSaving(true)
    const result = await onSave({
      product_id: product.id,
      movement_type: type,
      quantity: q,
      justification,
    })
    setSaving(false)

    if (result.success) {
      onClose()
    } else {
      setError(result.error || 'Erreur lors de l\'ajustement')
    }
  }

  const justifications = type === 'in' ? JUSTIFICATIONS_IN : JUSTIFICATIONS_OUT

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Ajuster le stock</h2>
          <button style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <p style={styles.productName}>{product.name}</p>
        <p style={styles.currentStock}>Stock actuel : <strong>{product.quantity}</strong></p>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.typeRow}>
          <button
            style={{ ...styles.typeBtn, ...(type === 'in' ? styles.typeBtnActiveIn : styles.typeBtnActiveOut) }}
            onClick={() => { setType('in'); setJustification('') }}
          >
            <Plus size={18} /> Entrée
          </button>
          <button
            style={{ ...styles.typeBtn, ...(type === 'out' ? styles.typeBtnActiveOut : styles.typeBtnActiveIn) }}
            onClick={() => { setType('out'); setJustification('') }}
          >
            <Minus size={18} /> Sortie
          </button>
        </div>

        <label style={styles.label}>Quantité</label>
        <input
          style={styles.input}
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Ex: 5"
        />

        <label style={styles.label}>Justification *</label>
        <div style={styles.justifRow}>
          {justifications.map((j) => (
            <button
              key={j}
              style={{ ...styles.justifBtn, ...(justification === j ? styles.justifBtnActive : {}) }}
              onClick={() => setJustification(j)}
            >
              {j}
            </button>
          ))}
        </div>

        <div style={styles.actions}>
          <button style={styles.btnSecondary} onClick={onClose}>Annuler</button>
          <button
            style={{ ...styles.btnPrimary, background: type === 'in' ? 'var(--color-success)' : 'var(--color-primary)' }}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Ajustement…' : 'Valider'}
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
    maxWidth: 420,
    padding: 24,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  productName: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-gray-800)',
  },
  currentStock: {
    fontSize: 13,
    color: 'var(--color-gray-500)',
    marginTop: 4,
    marginBottom: 16,
  },
  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    color: 'var(--color-danger)',
    borderRadius: 'var(--radius)',
    fontSize: 13,
    marginBottom: 12,
  },
  typeRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
  },
  typeBtn: {
    flex: 1,
    padding: '10px',
    border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)',
    background: 'var(--color-white)',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-gray-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  typeBtnActiveIn: {
    background: '#f0fdf4',
    borderColor: 'var(--color-success)',
    color: 'var(--color-success)',
    fontWeight: 600,
  },
  typeBtnActiveOut: {
    background: '#eff6ff',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary)',
    fontWeight: 600,
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
  },
  justifRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  justifBtn: {
    padding: '10px 14px',
    border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)',
    background: 'var(--color-white)',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-gray-600)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  justifBtnActive: {
    background: 'var(--color-primary-light)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary)',
    fontWeight: 600,
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
    color: 'var(--color-white)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: 14,
    fontWeight: 600,
  },
}
