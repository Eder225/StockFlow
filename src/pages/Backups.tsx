import { useEffect, useState } from 'react'
import { Save, FolderOpen, RotateCcw, Database, AlertTriangle } from 'lucide-react'

interface BackupFile {
  file_path: string
  trigger_type: string
  created_at: string
  size: number
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manuelle',
  auto_close: 'Fermeture',
  auto_hourly: 'Horaires',
  auto_movement_threshold: 'Mouvements',
}

export default function Backups() {
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [status, setStatus] = useState<{ movementCount: number; lastBackupTime: string | null; backupFolder: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [restoreFile, setRestoreFile] = useState<BackupFile | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [restoring, setRestoring] = useState(false)

  const load = async () => {
    setLoading(true)
    const [b, s] = await Promise.all([
      window.electronAPI.backups.list(),
      window.electronAPI.backups.getStatus(),
    ])
    setBackups(b as BackupFile[])
    setStatus(s as { movementCount: number; lastBackupTime: string | null; backupFolder: string })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleBackup = async () => {
    setError(''); setSuccess(''); setSaving(true)
    const result = await window.electronAPI.backups.create({ triggerType: 'manual' })
    setSaving(false)
    if (result.success) { setSuccess('Sauvegarde créée avec succès'); load() }
    else setError(result.error || 'Échec de la sauvegarde')
  }

  const handleRestore = async () => {
    if (!restoreFile) return
    setError(''); setRestoring(true)
    const result = await window.electronAPI.backups.restore({ filePath: restoreFile.file_path })
    setRestoring(false)
    if (result.success) {
      setSuccess(`Base restaurée. Une sauvegarde de sécurité a été créée. L'application va redémarrer.`)
      setRestoreFile(null)
      setConfirmText('')
      setTimeout(() => window.location.reload(), 2000)
    } else {
      setError(result.error || 'Échec de la restauration')
    }
  }

  const formatDate = (d: string) => {
    const date = new Date(d.replace(' ', 'T') + 'Z')
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  const fileName = (fp: string) => fp.split('\\').pop()?.split('/').pop() || fp

  return (
    <div>
      <h1 style={styles.pageTitle}>Sauvegardes</h1>

      {error && <div style={styles.msgError}>{error}</div>}
      {success && <div style={styles.msgSuccess}>{success}</div>}

      <div style={{ display: 'flex', gap: 20, alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Nouvelle sauvegarde</h2>
              {status && (
                <span style={{ fontSize: 13, color: 'var(--color-gray-500)' }}>
                  Dernière : {status.lastBackupTime ? formatDate(status.lastBackupTime) : 'Jamais'}
                  {status.movementCount >= 10 && (
                    <span style={{ color: 'var(--color-warning)', marginLeft: 8 }}>({status.movementCount} mouv. depuis)</span>
                  )}
                </span>
              )}
            </div>
            <button style={styles.backupBtn} onClick={handleBackup} disabled={saving}>
              <Save size={20} />
              {saving ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
            </button>
            <button style={styles.folderBtn} onClick={() => window.electronAPI.backups.openFolder()}>
              <FolderOpen size={16} /> Ouvrir le dossier de sauvegardes
            </button>
          </div>

          <div style={styles.card}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sauvegardes existantes</h2>
            {loading ? (
              <p style={{ color: 'var(--color-gray-400)' }}>Chargement…</p>
            ) : backups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-gray-400)' }}>
                <Database size={40} style={{ marginBottom: 8 }} />
                <p>Aucune sauvegarde</p>
              </div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Fichier</th>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Type</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Taille</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.file_path}>
                        <td style={styles.td}>{fileName(b.file_path)}</td>
                        <td style={styles.td}>{formatDate(b.created_at)}</td>
                        <td style={styles.td}>{TRIGGER_LABELS[b.trigger_type] || b.trigger_type}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{formatSize(b.size)}</td>
                        <td style={styles.td}>
                          <button style={styles.restoreBtn} onClick={() => setRestoreFile(b)}>
                            <RotateCcw size={14} /> Restaurer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {restoreFile && (
          <div style={styles.restorePanel}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--color-danger)' }}>
              <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Restauration
            </h3>

            <div style={styles.warningBox}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Attention :</p>
              <p>La restauration remplacera toutes les données actuelles par celles de cette sauvegarde.</p>
              <p>Toutes les opérations effectuées après le <strong>{formatDate(restoreFile.created_at)}</strong> seront définitivement perdues.</p>
              <p style={{ fontWeight: 600, marginTop: 8 }}>Cette action est irréversible.</p>
            </div>

            <p style={{ marginTop: 16, marginBottom: 8, fontSize: 13, color: 'var(--color-gray-600)' }}>
              Tapez <strong>RESTAURER</strong> pour confirmer :
            </p>
            <input
              style={styles.input}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTAURER"
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                style={{ flex: 1, padding: '10px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 14 }}
                onClick={() => { setRestoreFile(null); setConfirmText('') }}
              >
                Annuler
              </button>
              <button
                style={{
                  flex: 1, padding: '10px', border: 'none', borderRadius: 'var(--radius)',
                  background: confirmText === 'RESTAURER' ? 'var(--color-danger)' : 'var(--color-gray-300)',
                  color: '#fff', fontSize: 14, fontWeight: 600,
                }}
                disabled={confirmText !== 'RESTAURER' || restoring}
                onClick={handleRestore}
              >
                {restoring ? 'Restauration…' : 'Confirmer la restauration'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--color-gray-900)', marginBottom: 20 },
  msgError: { padding: '10px 14px', background: '#fef2f2', color: 'var(--color-danger)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 },
  msgSuccess: { padding: '10px 14px', background: '#f0fdf4', color: 'var(--color-success)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 },
  card: { background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 20, marginBottom: 16 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  backupBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
    padding: '14px', background: 'var(--color-primary)', color: '#fff', border: 'none',
    borderRadius: 'var(--radius)', fontSize: 16, fontWeight: 600, marginBottom: 10,
  },
  folderBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
    padding: '10px', background: '#fff', color: 'var(--color-gray-600)', border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)', fontSize: 14,
  },
  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--color-gray-100)', color: 'var(--color-gray-700)', fontSize: 13 },
  restoreBtn: { background: 'none', border: 'none', fontSize: 13, color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' },
  restorePanel: {
    width: 380, flexShrink: 0, background: '#fff', borderRadius: 'var(--radius)',
    border: '2px solid var(--color-danger)', padding: 20, position: 'sticky', top: 84,
  },
  warningBox: {
    padding: '12px 14px', background: '#fef2f2', borderRadius: 'var(--radius)',
    fontSize: 13, color: 'var(--color-gray-700)', lineHeight: 1.5,
  },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, outline: 'none', textAlign: 'center' as const, fontWeight: 600 },
}
