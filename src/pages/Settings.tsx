import { useEffect, useState } from 'react'
import { Save, Lock, HelpCircle, FolderOpen, Plus, Pencil, Trash2 } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'

export default function Settings() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [activeSection, setActiveSection] = useState('password')

  useEffect(() => {
    window.electronAPI.settings.getUser().then(setUser)
  }, [])

  const sections = [
    { id: 'password', label: 'Mot de passe', icon: Lock },
    { id: 'secret', label: 'Question secrète', icon: HelpCircle },
    { id: 'shop', label: 'Boutique', icon: Save },
    { id: 'backup-folder', label: 'Dossier sauvegardes', icon: FolderOpen },
    { id: 'categories', label: 'Catégories & Marques', icon: Plus },
  ]

  return (
    <div>
      <h1 style={styles.pageTitle}>Paramètres</h1>

      <div style={styles.layout}>
        <nav style={styles.nav}>
          {sections.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                style={{ ...styles.navItem, ...(activeSection === s.id ? styles.navItemActive : {}) }}
                onClick={() => setActiveSection(s.id)}
              >
                <Icon size={18} />
                <span>{s.label}</span>
              </button>
            )
          })}
        </nav>

        <div style={styles.content}>
          {activeSection === 'password' && <ChangePassword />}
          {activeSection === 'secret' && <SecretQuestion />}
          {activeSection === 'shop' && <ShopName user={user} />}
          {activeSection === 'backup-folder' && <BackupFolder user={user} />}
          {activeSection === 'categories' && <ManageLists />}
        </div>
      </div>
    </div>
  )
}

function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setError(''); setSuccess('')
    if (!current) { setError('Saisissez le mot de passe actuel'); return }
    if (newPwd.length < 6) { setError('Minimum 6 caractères'); return }
    if (newPwd !== confirm) { setError('Les mots de passe ne correspondent pas'); return }

    setSaving(true)
    const result = await window.electronAPI.settings.updatePassword({ currentPassword: current, newPassword: newPwd })
    setSaving(false)
    if (result.success) { setSuccess('Mot de passe modifié'); setCurrent(''); setNewPwd(''); setConfirm('') }
    else setError(result.error || 'Erreur')
  }

  return (
    <Section title="Modifier le mot de passe" icon={Lock}>
      {error && <div style={styles.msgError}>{error}</div>}
      {success && <div style={styles.msgSuccess}>{success}</div>}
      <label style={styles.label}>Mot de passe actuel</label>
      <input style={styles.input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <label style={styles.label}>Nouveau mot de passe</label>
      <input style={styles.input} type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Minimum 6 caractères" />
      <label style={styles.label}>Confirmation</label>
      <input style={styles.input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <button style={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
    </Section>
  )
}

function SecretQuestion() {
  const [question, setQuestion] = useState('')
  const [customQuestion, setCustomQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const predefinedQuestions = [
    'Nom de votre premier animal',
    'Ville de naissance',
    'Nom de votre meilleur ami d\'enfance',
    'Matière préférée à l\'école',
    'Nom de votre premier professeur',
  ]

  useEffect(() => {
    window.electronAPI.settings.getUser().then((u) => {
      if (u?.secret_question) {
        if (predefinedQuestions.includes(u.secret_question)) setQuestion(u.secret_question)
        else { setQuestion('__custom__'); setCustomQuestion(u.secret_question) }
      }
    })
  }, [])

  const handleSubmit = async () => {
    setError(''); setSuccess('')
    if (!password) { setError('Veuillez saisir votre mot de passe actuel'); return }
    const q = question === '__custom__' ? customQuestion.trim() : question
    if (!q) { setError('Choisissez ou saisissez une question'); return }
    if (answer.trim().length < 2) { setError('La réponse doit faire au moins 2 caractères'); return }
    setSaving(true)
    const result = await window.electronAPI.settings.updateSecretQuestion({ question: q, answer: answer.trim(), password })
    setSaving(false)
    if (result.success) { setSuccess('Question secrète mise à jour'); setPassword('') }
    else setError(result.error || 'Erreur')
  }

  return (
    <Section title="Configurer la question secrète" icon={HelpCircle}>
      {error && <div style={styles.msgError}>{error}</div>}
      {success && <div style={styles.msgSuccess}>{success}</div>}
      <label style={styles.label}>Question secrète</label>
      <select style={styles.input} value={question} onChange={(e) => setQuestion(e.target.value)}>
        <option value="">Choisir une question…</option>
        {predefinedQuestions.map((q) => <option key={q} value={q}>{q}</option>)}
        <option value="__custom__">Saisir une question personnalisée</option>
      </select>
      {question === '__custom__' && <input style={styles.input} value={customQuestion} onChange={(e) => setCustomQuestion(e.target.value)} placeholder="Votre question" />}
      <label style={styles.label}>Réponse</label>
      <input style={styles.input} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Minimum 2 caractères" />
      <label style={styles.label}>Mot de passe actuel</label>
      <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Requis pour modifier" />
      <button style={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
    </Section>
  )
}

function ShopName({ user }: { user: UserInfo | null }) {
  const [name, setName] = useState(user?.shop_name || '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) setName(user.shop_name) }, [user])

  const handleSubmit = async () => {
    setError(''); setSuccess('')
    if (!name.trim()) { setError('Le nom est obligatoire'); return }
    setSaving(true)
    const result = await window.electronAPI.settings.updateShopName({ shopName: name.trim() })
    setSaving(false)
    if (result.success) setSuccess('Nom mis à jour')
    else setError(result.error || 'Erreur')
  }

  return (
    <Section title="Nom de la boutique" icon={Save}>
      {error && <div style={styles.msgError}>{error}</div>}
      {success && <div style={styles.msgSuccess}>{success}</div>}
      <label style={styles.label}>Nom</label>
      <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
      <button style={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
    </Section>
  )
}

function BackupFolder({ user }: { user: UserInfo | null }) {
  const [folder, setFolder] = useState(user?.backup_folder_path || '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { if (user) setFolder(user.backup_folder_path) }, [user])

  const handlePick = async () => {
    const result = await window.electronAPI.settings.pickFolder()
    if (result.success && result.path) {
      setFolder(result.path)
      await window.electronAPI.settings.updateBackupFolder({ folderPath: result.path })
      setSuccess('Dossier de sauvegarde mis à jour')
    } else if (result.error && result.error !== 'Aucun dossier sélectionné') {
      setError(result.error)
    }
  }

  return (
    <Section title="Dossier de sauvegardes" icon={FolderOpen}>
      {error && <div style={styles.msgError}>{error}</div>}
      {success && <div style={styles.msgSuccess}>{success}</div>}
      <p style={styles.currentPath}>{folder || 'Aucun dossier configuré'}</p>
      <button style={styles.btnPrimary} onClick={handlePick}>Choisir un dossier</button>
    </Section>
  )
}

function ManageLists() {
  const [tab, setTab] = useState<'categories' | 'brands'>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const load = async () => {
    setCategories(await window.electronAPI.categories.list() as Category[])
    setBrands(await window.electronAPI.brands.list() as Brand[])
  }
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    setError('')
    if (!newName.trim()) { setError('Le nom est obligatoire'); return }
    const fn = tab === 'categories' ? window.electronAPI.categories.create : window.electronAPI.brands.create
    const result = await fn({ name: newName.trim() })
    if (result.success) { setNewName(''); load() } else setError(result.error || 'Erreur')
  }

  const handleEdit = async (id: number) => {
    setError('')
    if (!editName.trim()) { setError('Le nom est obligatoire'); return }
    const fn = tab === 'categories' ? window.electronAPI.categories.update : window.electronAPI.brands.update
    const result = await fn({ id, name: editName.trim() })
    if (result.success) { setEditId(null); load() } else setError(result.error || 'Erreur')
  }

  const handleDelete = async (id: number) => {
    setError('')
    setConfirmDeleteId(id)
  }

  const items = tab === 'categories' ? categories : brands

  return (
    <Section title="Catégories et Marques" icon={Plus}>
      <div style={styles.subTabs}>
        <button style={{ ...styles.subTab, ...(tab === 'categories' ? styles.subTabActive : {}) }} onClick={() => setTab('categories')}>Catégories</button>
        <button style={{ ...styles.subTab, ...(tab === 'brands' ? styles.subTabActive : {}) }} onClick={() => setTab('brands')}>Marques</button>
      </div>

      {error && <div style={styles.msgError}>{error}</div>}

      <div style={styles.addRow}>
        <input style={{ ...styles.input, flex: 1 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Nouvelle ${tab === 'categories' ? 'catégorie' : 'marque'}…`} />
        <button style={styles.btnPrimary} onClick={handleAdd}><Plus size={16} /> Ajouter</button>
      </div>

      <div style={styles.listItems}>
        {items.map((item) => (
          <div key={item.id} style={styles.listItem}>
            {editId === item.id ? (
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                <input style={{ ...styles.input, flex: 1 }} value={editName} onChange={(e) => setEditName(e.target.value)} />
                <button style={styles.smallBtn} onClick={() => handleEdit(item.id)}>OK</button>
                <button style={styles.smallBtn} onClick={() => setEditId(null)}>✕</button>
              </div>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14 }}>{item.name}</span>
                {item.is_predefined === 1 && <span style={styles.predefinedBadge}>Prédéfinie</span>}
                <button style={styles.iconBtn} onClick={() => { setEditId(item.id); setEditName(item.name) }}><Pencil size={15} /></button>
                <button style={styles.iconBtn} onClick={() => handleDelete(item.id)}><Trash2 size={15} /></button>
              </>
            )}
          </div>
        ))}
      </div>

      {confirmDeleteId !== null && (
        <ConfirmModal
          title="Supprimer"
          message={`Supprimer ${tab === 'categories' ? 'cette catégorie' : 'cette marque'} ?`}
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            const fn = tab === 'categories' ? window.electronAPI.categories.delete : window.electronAPI.brands.delete
            const result = await fn({ id: confirmDeleteId })
            setConfirmDeleteId(null)
            if (result.success) load()
            else setError(result.error || 'Erreur')
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </Section>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}><Icon size={20} /> {title}</h2>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: 'var(--color-gray-900)', marginBottom: 20 },
  layout: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' },
  nav: { background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 8, display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 84 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', background: 'transparent', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--color-gray-600)', textAlign: 'left', width: '100%', fontWeight: 500 },
  navItemActive: { background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 600 },
  content: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: { background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-200)', padding: 24 },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: 'var(--color-gray-800)', marginBottom: 20 },
  sectionBody: { maxWidth: 480 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-gray-700)', marginTop: 12, marginBottom: 4 },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--color-gray-900)', outline: 'none' },
  btnPrimary: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 600, marginTop: 16 },
  msgError: { padding: '10px 14px', background: '#fef2f2', color: 'var(--color-danger)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 },
  msgSuccess: { padding: '10px 14px', background: '#f0fdf4', color: 'var(--color-success)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 },
  currentPath: { padding: '10px 14px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--color-gray-600)', wordBreak: 'break-all' },
  subTabs: { display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--color-gray-200)' },
  subTab: { padding: '8px 16px', border: 'none', background: 'none', borderBottom: '2px solid transparent', fontSize: 14, fontWeight: 500, color: 'var(--color-gray-500)', marginBottom: -1 },
  subTabActive: { color: 'var(--color-primary)', borderBottomColor: 'var(--color-primary)', fontWeight: 600 },
  addRow: { display: 'flex', gap: 8, marginBottom: 16 },
  listItems: { display: 'flex', flexDirection: 'column', gap: 4 },
  listItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--color-gray-100)' },
  predefinedBadge: { fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 500 },
  iconBtn: { background: 'none', border: 'none', color: 'var(--color-gray-400)', padding: 4, display: 'flex' },
  smallBtn: { padding: '6px 12px', border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius)', background: '#fff', fontSize: 13 },
}
