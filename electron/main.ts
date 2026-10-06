import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import { randomBytes } from 'crypto'
import { initDatabase, closeDatabase, getDb, isFirstLaunch } from './database/db'
import { registerHandlers } from './database/handlers'
import { hashPassword, verifyPassword, needsHashUpgrade } from './database/crypto'
import { MIN_PASSWORD_LEN } from './database/validators'
import { createBackup, getStockMovementCountSinceLastBackup } from './database/backup'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null
let backupInterval: ReturnType<typeof setInterval> | null = null
let thresholdInterval: ReturnType<typeof setInterval> | null = null

// Two windows would each hold an in-memory sql.js copy of the same file and
// overwrite each other on persist: keep a single instance only.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'StockFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  const wc = mainWindow.webContents

  // No new window, no target="_blank", no window.open().
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))

  // The app is a single local page: any navigation away from it is refused.
  const isAppUrl = (url: string) =>
    url.startsWith('file://') ||
    (!!process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL))

  wc.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      logger.warn(`Blocked navigation to ${url}`)
    }
  })

  wc.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      logger.warn(`Blocked redirect to ${url}`)
    }
  })

  // Deny everything except our own local resources. Skipped in dev, where the
  // renderer legitimately talks to the Vite dev server (http + HMR websocket).
  if (!process.env.VITE_DEV_SERVER_URL) {
    wc.session.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url
      const allowed = url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')
      if (!allowed) logger.warn(`Blocked request to ${url}`)
      callback({ cancel: !allowed })
    })
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function tryAutoBackup(triggerType: 'auto_close' | 'auto_hourly' | 'auto_movement_threshold') {
  const result = createBackup(triggerType)
  if (!result.success && mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('backup:error', result.error) } catch {}
  }
}

function startAutoBackupTimer() {
  // Hourly backup
  backupInterval = setInterval(() => {
    tryAutoBackup('auto_hourly')
  }, 60 * 60 * 1000)

  // Check movement threshold every 30s
  thresholdInterval = setInterval(() => {
    try {
      const count = getStockMovementCountSinceLastBackup()
      if (count >= 50) {
        tryAutoBackup('auto_movement_threshold')
      }
    } catch (err) {
      logger.error('Movement threshold check failed', err)
    }
  }, 30000)
}

function stopAutoBackupTimer() {
  if (backupInterval) { clearInterval(backupInterval); backupInterval = null }
  if (thresholdInterval) { clearInterval(thresholdInterval); thresholdInterval = null }
}

function registerIpcHandlers() {
  ipcMain.handle('auth:isFirstLaunch', () => isFirstLaunch())

  // Setup is only allowed once: afterwards the credentials can only be changed
  // through settings:updatePassword / settings:updateSecretQuestion (which both
  // require the current password).
  ipcMain.handle('auth:setup', (_event, { shopName, password, secretQuestion, secretAnswer }: {
    shopName: string; password: string; secretQuestion: string; secretAnswer: string
  }) => {
    if (!isFirstLaunch()) {
      return { success: false, error: 'La configuration initiale a déjà été effectuée' }
    }
    if (!shopName || typeof shopName !== 'string' || !shopName.trim()) {
      return { success: false, error: 'Nom de boutique invalide' }
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
      return { success: false, error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LEN} caractères` }
    }
    if (typeof secretQuestion !== 'string' || !secretQuestion.trim()) {
      return { success: false, error: 'Question secrète invalide' }
    }
    if (typeof secretAnswer !== 'string' || secretAnswer.trim().length < 2) {
      return { success: false, error: 'La réponse secrète est trop courte' }
    }

    const db = getDb()
    const timenow = new Date().toISOString().replace('T', ' ').slice(0, 19)
    db.prepare(`UPDATE users SET shop_name = ?, password_hash = ?, secret_question = ?, secret_answer_hash = ?, updated_at = ? WHERE id = 1`)
      .run(shopName.trim(), hashPassword(password), secretQuestion.trim(), hashPassword(secretAnswer.trim().toLowerCase()), timenow)
    return { success: true }
  })

  let loginAttempts = 0
  let loginLockedUntil = 0

  ipcMain.handle('auth:login', (_event, { password }: { password: string }) => {
    const now = Date.now()
    if (now < loginLockedUntil) {
      const remaining = Math.ceil((loginLockedUntil - now) / 1000)
      return { success: false, error: `Trop de tentatives. Réessayez dans ${remaining} s.` }
    }
    if (typeof password !== 'string') return { success: false, error: 'Mot de passe incorrect' }

    const db = getDb()
    const user = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as { password_hash: string } | undefined
    if (!user) return { success: false, error: 'Aucun utilisateur configuré' }

    if (verifyPassword(password, user.password_hash)) {
      loginAttempts = 0
      if (needsHashUpgrade(user.password_hash)) {
        const timenow = new Date().toISOString().replace('T', ' ').slice(0, 19)
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = 1')
          .run(hashPassword(password), timenow)
      }
      return { success: true }
    }

    loginAttempts++
    if (loginAttempts >= 5) {
      loginLockedUntil = Date.now() + 30000
      loginAttempts = 0
    }
    return { success: false, error: 'Mot de passe incorrect' }
  })

  ipcMain.handle('auth:getSecretQuestion', () => {
    const user = getDb().prepare('SELECT secret_question FROM users WHERE id = 1').get() as { secret_question: string } | undefined
    if (!user || !user.secret_question) return { success: false, error: 'Aucune question secrète configurée' }
    return { success: true, question: user.secret_question }
  })

  // Rate limit for the secret answer, enforced in the main process (the UI lock
  // alone can be bypassed by talking to IPC directly).
  let secretAttempts = 0
  let secretLockedUntil = 0
  // One-time token proving the secret answer was verified; required by resetPassword.
  let resetToken: string | null = null
  let resetTokenExpiresAt = 0

  const clearResetToken = () => { resetToken = null; resetTokenExpiresAt = 0 }

  ipcMain.handle('auth:verifySecretAnswer', (_event, { answer }: { answer: string }) => {
    const now = Date.now()
    if (now < secretLockedUntil) {
      const remaining = Math.ceil((secretLockedUntil - now) / 1000)
      return { success: false, error: `Trop de tentatives. Réessayez dans ${remaining} s.` }
    }
    if (typeof answer !== 'string') return { success: false, error: 'Réponse incorrecte' }

    const user = getDb().prepare('SELECT secret_answer_hash FROM users WHERE id = 1').get() as { secret_answer_hash: string } | undefined
    if (!user) return { success: false, error: 'Aucun utilisateur configuré' }
    const normalized = answer.trim().toLowerCase()

    if (!verifyPassword(normalized, user.secret_answer_hash)) {
      secretAttempts++
      if (secretAttempts >= 5) {
        secretLockedUntil = Date.now() + 30000
        secretAttempts = 0
      }
      return { success: false, error: 'Réponse incorrecte' }
    }

    secretAttempts = 0
    if (needsHashUpgrade(user.secret_answer_hash)) {
      const timenow = new Date().toISOString().replace('T', ' ').slice(0, 19)
      getDb().prepare('UPDATE users SET secret_answer_hash = ?, updated_at = ? WHERE id = 1')
        .run(hashPassword(normalized), timenow)
    }

    resetToken = randomBytes(32).toString('hex')
    resetTokenExpiresAt = Date.now() + 5 * 60 * 1000
    return { success: true, resetToken }
  })

  ipcMain.handle('auth:resetPassword', (_event, { newPassword, token }: { newPassword: string; token?: string }) => {
    const now = Date.now()
    if (!resetToken || now > resetTokenExpiresAt) {
      clearResetToken()
      return { success: false, error: 'Session de réinitialisation expirée, recommencez' }
    }
    if (typeof token !== 'string' || token !== resetToken) {
      return { success: false, error: 'Jeton de réinitialisation invalide' }
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LEN) {
      return { success: false, error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LEN} caractères` }
    }

    clearResetToken()
    const timenow = new Date().toISOString().replace('T', ' ').slice(0, 19)
    getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = 1')
      .run(hashPassword(newPassword), timenow)
    logger.info('Password reset through secret question')
    return { success: true }
  })

  ipcMain.handle('settings:pickFolder', async () => {
    if (!mainWindow) return { success: false, error: 'Fenêtre non disponible' }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choisir le dossier de sauvegarde',
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, error: 'Aucun dossier sélectionné' }
    return { success: true, path: result.filePaths[0] }
  })
}

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason : String(reason))
})

app.whenReady().then(async () => {
  logger.info('Application started')
  try {
    await initDatabase()
    logger.info('Database initialized')
  } catch (err) {
    logger.error('Failed to initialize database', err)
    throw err
  }
  registerIpcHandlers()
  registerHandlers()
  Menu.setApplicationMenu(null)
  createWindow()
  startAutoBackupTimer()
  logger.info('Application ready')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopAutoBackupTimer()
  try { getDb().persist() } catch {}
  tryAutoBackup('auto_close')
  closeDatabase()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
