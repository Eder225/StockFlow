import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase, getDb, isFirstLaunch } from './database/db'
import { registerHandlers } from './database/handlers'
import { hashPassword, verifyPassword, needsHashUpgrade } from './database/crypto'
import { createBackup, getStockMovementCountSinceLastBackup } from './database/backup'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null
let backupInterval: ReturnType<typeof setInterval> | null = null

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
    },
  })

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
  setInterval(() => {
    const count = getStockMovementCountSinceLastBackup()
    if (count >= 50) {
      tryAutoBackup('auto_movement_threshold')
    }
  }, 30000)
}

function registerIpcHandlers() {
  ipcMain.handle('auth:isFirstLaunch', () => isFirstLaunch())

  ipcMain.handle('auth:setup', (_event, { shopName, password, secretQuestion, secretAnswer }: {
    shopName: string; password: string; secretQuestion: string; secretAnswer: string
  }) => {
    const db = getDb()
    const timenow = new Date().toISOString().replace('T', ' ').slice(0, 19)
    db.prepare(`UPDATE users SET shop_name = ?, password_hash = ?, secret_question = ?, secret_answer_hash = ?, updated_at = ? WHERE id = 1`)
      .run(shopName, hashPassword(password), secretQuestion, hashPassword(secretAnswer.trim().toLowerCase()), timenow)
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

  ipcMain.handle('auth:verifySecretAnswer', (_event, { answer }: { answer: string }) => {
    const user = getDb().prepare('SELECT secret_answer_hash FROM users WHERE id = 1').get() as { secret_answer_hash: string } | undefined
    if (!user) return { success: false, error: 'Aucun utilisateur configuré' }
    const normalized = answer.trim().toLowerCase()
    if (verifyPassword(normalized, user.secret_answer_hash)) {
      if (needsHashUpgrade(user.secret_answer_hash)) {
        const timenow = new Date().toISOString().replace('T', ' ').slice(0, 19)
        getDb().prepare('UPDATE users SET secret_answer_hash = ?, updated_at = ? WHERE id = 1')
          .run(hashPassword(normalized), timenow)
      }
      return { success: true }
    }
    return { success: false, error: 'Réponse incorrecte' }
  })

  ipcMain.handle('auth:resetPassword', (_event, { newPassword }: { newPassword: string }) => {
    const timenow = new Date().toISOString().replace('T', ' ').slice(0, 19)
    getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = 1')
      .run(hashPassword(newPassword), timenow)
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
  if (backupInterval) clearInterval(backupInterval)
  try { getDb().persist() } catch {}
  tryAutoBackup('auto_close')
  closeDatabase()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
