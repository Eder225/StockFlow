import { AlertTriangle, X } from 'lucide-react'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmLabel = 'Confirmer', danger = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <AlertTriangle size={22} style={{ color: danger ? 'var(--color-danger)' : 'var(--color-warning)' }} />
          <h3 style={styles.title}>{title}</h3>
          <button style={styles.closeBtn} onClick={onCancel}><X size={18} /></button>
        </div>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>Annuler</button>
          <button style={{ ...styles.confirmBtn, ...(danger ? styles.confirmDanger : {}) }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--color-gray-900)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--color-gray-400)', padding: 4, cursor: 'pointer' },
  message: { fontSize: 14, color: 'var(--color-gray-600)', lineHeight: 1.5, marginBottom: 20 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: { padding: '8px 18px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 14, color: 'var(--color-gray-700)', cursor: 'pointer' },
  confirmBtn: { padding: '8px 18px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--color-primary)', fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer' },
  confirmDanger: { background: 'var(--color-danger)' },
}
