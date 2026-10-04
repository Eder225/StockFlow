import { useState } from 'react'
import { X, Banknote, CreditCard } from 'lucide-react'

interface SaleEditModalProps {
  sale: SaleDetail
  onSave: (data: {
    id: number; client_name?: string; discount_amount: number
    payment_method: 'cash' | 'mobile_money'; created_at?: string
  }) => Promise<{ success: boolean; error?: string }>
  onClose: () => void
}

export default function SaleEditModal({ sale, onSave, onClose }: SaleEditModalProps) {
  const [clientName, setClientName] = useState(sale.client_name || '')
  const [discount, setDiscount] = useState(String(sale.discount_amount || ''))
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_money'>(sale.payment_method)
  const [saleDate, setSaleDate] = useState(() => {
    const d = new Date(sale.created_at.replace(' ', 'T') + 'Z')
    return d.toISOString().slice(0, 16)
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const discountNum = Math.min(Math.max(0, parseInt(discount, 10) || 0), sale.subtotal)
  const total = sale.subtotal - discountNum

  const handleSubmit = async () => {
    setError('')
    setSaving(true)

    try {
      const isoDate = saleDate ? saleDate.replace('T', ' ') + ':00' : undefined

      const result = await onSave({
        id: sale.id,
        client_name: clientName.trim() || undefined,
        discount_amount: discountNum,
        payment_method: paymentMethod,
        created_at: isoDate,
      })
      setSaving(false)

      if (result.success) {
        onClose()
      } else {
        setError(result.error || 'Erreur lors de la modification')
      }
    } catch (e) {
      setSaving(false)
      setError('Erreur inattendue')
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Modifier la vente #{sale.id}</h3>
          <button style={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>Date de vente</label>
        <input
          style={styles.input}
          type="datetime-local"
          value={saleDate}
          onChange={(e) => setSaleDate(e.target.value)}
        />

        <label style={styles.label}>Client (facultatif)</label>
        <input
          style={styles.input}
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Nom du client"
          maxLength={100}
        />

        <label style={styles.label}>Mode de paiement</label>
        <div style={styles.paymentRow}>
          <button
            style={{ ...styles.paymentBtn, ...(paymentMethod === 'cash' ? styles.paymentBtnActive : {}) }}
            onClick={() => setPaymentMethod('cash')}
          >
            <Banknote size={16} /> Espèces
          </button>
          <button
            style={{ ...styles.paymentBtn, ...(paymentMethod === 'mobile_money' ? styles.paymentBtnActive : {}) }}
            onClick={() => setPaymentMethod('mobile_money')}
          >
            <CreditCard size={16} /> Mobile Money
          </button>
        </div>

        <label style={styles.label}>Remise (FCFA)</label>
        <input
          style={styles.input}
          type="number"
          min={0}
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />

        <div style={styles.summary}>
          <div style={styles.summaryRow}>
            <span>Sous-total</span>
            <span>{sale.subtotal.toLocaleString()} FCFA</span>
          </div>
          {discountNum > 0 && (
            <div style={{ ...styles.summaryRow, color: 'var(--color-danger)' }}>
              <span>Remise</span>
              <span>-{discountNum.toLocaleString()} FCFA</span>
            </div>
          )}
          <div style={{ ...styles.summaryRow, fontWeight: 700, fontSize: 16, borderTop: '1px solid var(--color-gray-200)', paddingTop: 8, marginTop: 4 }}>
            <span>Total</span>
            <span>{total.toLocaleString()} FCFA</span>
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Annuler</button>
          <button style={styles.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
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
    background: '#fff', borderRadius: 12, padding: 24, width: 460, maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--color-gray-900)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--color-gray-400)', padding: 4, cursor: 'pointer' },
  error: {
    padding: '10px 14px', background: '#fef2f2', color: 'var(--color-danger)',
    borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12,
  },
  label: {
    display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)',
    marginTop: 12, marginBottom: 4,
  },
  input: {
    width: '100%', padding: '9px 12px', border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--color-gray-900)', outline: 'none',
  },
  paymentRow: { display: 'flex', gap: 8 },
  paymentBtn: {
    flex: 1, padding: '10px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)',
    background: 'var(--color-white)', fontSize: 13, fontWeight: 500, color: 'var(--color-gray-600)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
  },
  paymentBtnActive: {
    background: 'var(--color-primary-light)', borderColor: 'var(--color-primary)',
    color: 'var(--color-primary)', fontWeight: 600,
  },
  summary: {
    marginTop: 16, padding: '12px 14px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius)',
  },
  summaryRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 14,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  cancelBtn: {
    padding: '8px 18px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)',
    background: '#fff', fontSize: 14, color: 'var(--color-gray-700)', cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 18px', border: 'none', borderRadius: 'var(--radius)',
    background: 'var(--color-primary)', fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer',
  },
}
