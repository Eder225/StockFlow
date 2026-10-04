import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Lock, Eye, EyeOff, HelpCircle, ArrowLeft, ShieldCheck } from 'lucide-react'

type Page = 'loading' | 'setup' | 'login' | 'forgot' | 'reset'

export default function Login() {
  const navigate = useNavigate()
  const [page, setPage] = useState<Page>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    window.electronAPI.auth.isFirstLaunch().then((first) => {
      setPage(first ? 'setup' : 'login')
    })
  }, [])

  function goToApp() {
    navigate('/app')
  }

  if (page === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <Store size={48} style={{ color: 'var(--color-primary)' }} />
          <h1 style={styles.title}>StockFlow</h1>
          <p style={styles.subtitle}>Chargement…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Store size={48} style={{ color: 'var(--color-primary)', marginBottom: 8 }} />
        <h1 style={styles.title}>StockFlow</h1>
        <p style={styles.subtitle}>Gestion de stock pour boutiques d'accessoires électroniques</p>

        {error && <div style={styles.error}>{error}</div>}

        {page === 'setup' && <SetupForm onComplete={goToApp} onError={setError} />}
        {page === 'login' && <LoginForm onSuccess={goToApp} onForgot={() => setPage('forgot')} onError={setError} />}
        {page === 'forgot' && (
          <ForgotForm
            onBack={() => { setPage('login'); setError('') }}
            onReset={() => setPage('reset')}
            onError={setError}
          />
        )}
        {page === 'reset' && (
          <ResetForm
            onBack={() => { setPage('login'); setError('') }}
            onError={setError}
          />
        )}
      </div>
    </div>
  )
}

function SetupForm({ onComplete, onError }: { onComplete: () => void; onError: (msg: string) => void }) {
  const [shopName, setShopName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [question, setQuestion] = useState('')
  const [customQuestion, setCustomQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const predefinedQuestions = [
    'Nom de votre premier animal',
    'Ville de naissance',
    'Nom de votre meilleur ami d\'enfance',
    'Matière préférée à l\'école',
    'Nom de votre premier professeur',
  ]

  const handleSubmit = async () => {
    onError('')
    if (!shopName.trim()) { onError('Le nom de la boutique est obligatoire'); return }
    if (password.length < 6) { onError('Le mot de passe doit faire au moins 6 caractères'); return }
    if (password !== confirm) { onError('Les mots de passe ne correspondent pas'); return }
    const finalQuestion = question === '__custom__' ? customQuestion.trim() : question
    if (!finalQuestion) { onError('Veuillez choisir ou saisir une question secrète'); return }
    if (answer.trim().length < 2) { onError('La réponse doit faire au moins 2 caractères'); return }

    setSubmitting(true)
    const result = await window.electronAPI.auth.setup({
      shopName: shopName.trim(),
      password,
      secretQuestion: finalQuestion,
      secretAnswer: answer.trim(),
    })
    setSubmitting(false)

    if (result.success) onComplete()
  }

  return (
    <div style={styles.formContainer}>
      <h2 style={styles.formTitle}>Configuration initiale</h2>
      <p style={styles.formDesc}>Créez votre compte pour commencer</p>

      <label style={styles.label}>Nom de la boutique</label>
      <input
        style={styles.input}
        value={shopName}
        onChange={(e) => setShopName(e.target.value)}
        placeholder="Ma Boutique"
      />

      <label style={styles.label}>Mot de passe</label>
      <div style={styles.passwordWrap}>
        <input
          style={{ ...styles.input, paddingRight: 40 }}
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 6 caractères"
        />
        <button
          style={styles.togglePassword}
          onClick={() => setShowPassword(!showPassword)}
          tabIndex={-1}
          type="button"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <label style={styles.label}>Confirmer le mot de passe</label>
      <input
        style={styles.input}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Retaper le mot de passe"
      />

      <label style={styles.label}>Question secrète</label>
      <select style={styles.input} value={question} onChange={(e) => setQuestion(e.target.value)}>
        <option value="">Choisir une question…</option>
        {predefinedQuestions.map((q) => (
          <option key={q} value={q}>{q}</option>
        ))}
        <option value="__custom__">Saisir une question personnalisée</option>
      </select>

      {question === '__custom__' && (
        <input
          style={styles.input}
          value={customQuestion}
          onChange={(e) => setCustomQuestion(e.target.value)}
          placeholder="Votre question personnalisée"
        />
      )}

      <label style={styles.label}>Réponse secrète</label>
      <input
        style={styles.input}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Minimum 2 caractères"
      />

      <button style={styles.buttonPrimary} onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Création…' : 'Créer mon compte'}
      </button>
    </div>
  )
}

function LoginForm({ onSuccess, onForgot, onError }: { onSuccess: () => void; onForgot: () => void; onError: (msg: string) => void }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleLogin = async () => {
    onError('')
    if (!password) { onError('Veuillez saisir votre mot de passe'); return }

    setSubmitting(true)
    const result = await window.electronAPI.auth.login({ password })
    setSubmitting(false)

    if (result.success) {
      onSuccess()
    } else {
      onError(result.error || 'Mot de passe incorrect')
    }
  }

  return (
    <div style={styles.formContainer}>
      <h2 style={styles.formTitle}>Connexion</h2>
      <p style={styles.formDesc}>Entrez votre mot de passe pour accéder à StockFlow</p>

      <label style={styles.label}>Mot de passe</label>
      <div style={styles.passwordWrap}>
        <input
          style={{ ...styles.input, paddingRight: 40 }}
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Votre mot de passe"
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <button
          style={styles.togglePassword}
          onClick={() => setShowPassword(!showPassword)}
          tabIndex={-1}
          type="button"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <button style={styles.buttonPrimary} onClick={handleLogin} disabled={submitting}>
        <Lock size={18} />
        {submitting ? 'Connexion…' : 'Se connecter'}
      </button>

      <button style={styles.linkButton} onClick={onForgot}>
        <HelpCircle size={16} />
        Mot de passe oublié ?
      </button>
    </div>
  )
}

function ForgotForm({ onBack, onReset, onError }: { onBack: () => void; onReset: () => void; onError: (msg: string) => void }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lockTimer, setLockTimer] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    window.electronAPI.auth.getSecretQuestion().then((res) => {
      if (!res.success) {
        onError(res.error || 'Aucune question secrète configurée')
        return
      }
      setQuestion(res.question || '')
    })
  }, [onError])

  useEffect(() => {
    if (locked && lockTimer > 0) {
      timerRef.current = setInterval(() => {
        setLockTimer((t) => {
          if (t <= 1) {
            setLocked(false)
            setAttempts(0)
            return 0
          }
          return t - 1
        })
      }, 1000)
    }
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current) }
  }, [locked, lockTimer])

  const handleVerify = async () => {
    onError('')
    if (!answer.trim()) { onError('Veuillez saisir votre réponse'); return }

    setSubmitting(true)
    const result = await window.electronAPI.auth.verifySecretAnswer({ answer: answer.trim() })
    setSubmitting(false)

    if (result.success) {
      onReset()
    } else {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      if (newAttempts >= 5) {
        setLocked(true)
        setLockTimer(30)
      }
      onError('Réponse incorrecte')
    }
  }

  if (locked) {
    return (
      <div style={styles.formContainer}>
        <h2 style={styles.formTitle}>Trop de tentatives</h2>
        <p style={styles.formDesc}>
          Réessayez dans {lockTimer} seconde{lockTimer > 1 ? 's' : ''}
        </p>
        <div style={{ ...styles.progressBar, width: '100%', background: 'var(--color-gray-200)', borderRadius: 4, height: 6, marginTop: 8 }}>
          <div style={{ width: `${((30 - lockTimer) / 30) * 100}%`, background: 'var(--color-primary)', height: 6, borderRadius: 4, transition: 'width 1s linear' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={styles.formContainer}>
      <h2 style={styles.formTitle}>Mot de passe oublié</h2>
      <p style={styles.formDesc}>Répondez à votre question secrète</p>

      <div style={styles.questionBox}>
        <HelpCircle size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{question}</span>
      </div>

      <label style={styles.label}>Votre réponse</label>
      <input
        style={styles.input}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Saisissez votre réponse"
        onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
      />
      <p style={styles.hint}>La vérification est insensible à la casse et aux espaces.</p>

      <button style={styles.buttonPrimary} onClick={handleVerify} disabled={submitting}>
        <ShieldCheck size={18} />
        {submitting ? 'Vérification…' : 'Vérifier'}
      </button>

      <button style={styles.linkButton} onClick={onBack}>
        <ArrowLeft size={16} />
        Retour à la connexion
      </button>
    </div>
  )
}

function ResetForm({ onBack, onError }: { onBack: () => void; onError: (msg: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleReset = async () => {
    onError('')
    if (password.length < 6) { onError('Le mot de passe doit faire au moins 6 caractères'); return }
    if (password !== confirm) { onError('Les mots de passe ne correspondent pas'); return }

    setSubmitting(true)
    await window.electronAPI.auth.resetPassword({ newPassword: password })
    setSubmitting(false)
    setDone(true)
  }

  if (done) {
    return (
      <div style={styles.formContainer}>
        <h2 style={styles.formTitle}>Mot de passe réinitialisé</h2>
        <p style={styles.formDesc}>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
        <button style={styles.buttonPrimary} onClick={onBack}>
          Retour à la connexion
        </button>
      </div>
    )
  }

  return (
    <div style={styles.formContainer}>
      <h2 style={styles.formTitle}>Nouveau mot de passe</h2>
      <p style={styles.formDesc}>Choisissez un nouveau mot de passe</p>

      <label style={styles.label}>Nouveau mot de passe</label>
      <div style={styles.passwordWrap}>
        <input
          style={{ ...styles.input, paddingRight: 40 }}
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 6 caractères"
        />
        <button
          style={styles.togglePassword}
          onClick={() => setShowPassword(!showPassword)}
          tabIndex={-1}
          type="button"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <label style={styles.label}>Confirmer</label>
      <input
        style={styles.input}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Retaper le mot de passe"
      />

      <button style={styles.buttonPrimary} onClick={handleReset} disabled={submitting}>
        {submitting ? 'Enregistrement…' : 'Enregistrer'}
      </button>

      <button style={styles.linkButton} onClick={onBack}>
        <ArrowLeft size={16} />
        Retour à la connexion
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #eff6ff 0%, #f9fafb 100%)',
    padding: 16,
  },
  card: {
    background: 'var(--color-white)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg)',
    padding: '40px 32px',
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--color-gray-900)',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'var(--color-gray-500)',
    textAlign: 'center',
    lineHeight: 1.4,
    marginBottom: 24,
  },
  error: {
    width: '100%',
    padding: '10px 14px',
    background: '#fef2f2',
    color: 'var(--color-danger)',
    borderRadius: 'var(--radius)',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--color-gray-800)',
    marginBottom: 2,
  },
  formDesc: {
    fontSize: 13,
    color: 'var(--color-gray-500)',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-gray-700)',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--color-gray-300)',
    borderRadius: 'var(--radius)',
    fontSize: 14,
    color: 'var(--color-gray-900)',
    background: 'var(--color-white)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  passwordWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  togglePassword: {
    position: 'absolute',
    right: 10,
    background: 'none',
    border: 'none',
    color: 'var(--color-gray-400)',
    display: 'flex',
    alignItems: 'center',
    padding: 4,
  },
  buttonPrimary: {
    width: '100%',
    marginTop: 20,
    padding: '11px 20px',
    background: 'var(--color-primary)',
    color: 'var(--color-white)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: 15,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'background 0.15s',
  },
  linkButton: {
    marginTop: 16,
    background: 'none',
    border: 'none',
    color: 'var(--color-gray-500)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 4,
    width: '100%',
  },
  questionBox: {
    display: 'flex',
    gap: 10,
    padding: '14px 16px',
    background: 'var(--color-primary-light)',
    borderRadius: 'var(--radius)',
    marginBottom: 12,
    fontSize: 14,
    color: 'var(--color-gray-800)',
    alignItems: 'flex-start',
  },
  hint: {
    fontSize: 12,
    color: 'var(--color-gray-400)',
    marginTop: 4,
  },
  progressBar: {
    marginTop: 8,
  },
}
