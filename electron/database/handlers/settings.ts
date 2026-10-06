import { ipcMain, shell } from 'electron'
import fs from 'fs'
import { getDb } from '../db'
import { hashPassword, verifyPassword, needsHashUpgrade } from '../crypto'
import { createBackup, getBackupFolder, listBackups, restoreBackup, getStockMovementCountSinceLastBackup, getLastBackupTime } from '../backup'
import { MIN_PASSWORD_LEN, validateString } from '../validators'
import { now } from './common'

export function registerSettingsHandlers() {
  // ── Settings: get user info ──
  ipcMain.handle('settings:getUser', () => {
    const user = getDb().prepare('SELECT id, shop_name, secret_question, backup_folder_path, created_at, updated_at FROM users WHERE id = 1').get() as Record<string, unknown> | undefined
    return user || null
  })

  // ── Settings: update password ──
  // Second password oracle (login has its own): shares the lockout so one
  // cannot be used to bypass the other.
  let pwdAttempts = 0
  let pwdLockedUntil = 0

  ipcMain.handle('settings:updatePassword', (_event, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    const time = Date.now()
    if (time < pwdLockedUntil) {
      const remaining = Math.ceil((pwdLockedUntil - time) / 1000)
      return { success: false, error: `Trop de tentatives. Réessayez dans ${remaining} s.` }
    }

    const db = getDb()
    const user = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as { password_hash: string } | undefined
    if (!user) return { success: false, error: 'Aucun utilisateur' }

    if (!verifyPassword(currentPassword, user.password_hash)) {
      pwdAttempts++
      if (pwdAttempts >= 5) {
        pwdLockedUntil = Date.now() + 30000
        pwdAttempts = 0
      }
      return { success: false, error: 'Mot de passe actuel incorrect' }
    }
    pwdAttempts = 0
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LEN) return { success: false, error: `Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD_LEN} caractères` }

    const timestamp = now()
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = 1').run(hashPassword(newPassword), timestamp)
      if (needsHashUpgrade(user.password_hash)) {
        db.prepare(`INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('settings_changed', 'settings', 1, 'Mot de passe mis à niveau (scrypt)', ?)`).run(timestamp)
      } else {
        db.prepare(`INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('settings_changed', 'settings', 1, 'Mot de passe modifié', ?)`).run(timestamp)
      }
    })()
    return { success: true }
  })

  // ── Settings: update secret question ──
  ipcMain.handle('settings:updateSecretQuestion', (_event, { question, answer, password }: { question: string; answer: string; password: string }) => {
    const db = getDb()
    if (!question) return { success: false, error: 'La question est obligatoire' }
    if (answer.trim().length < 2) return { success: false, error: 'La réponse doit faire au moins 2 caractères' }
    if (!password) return { success: false, error: 'Mot de passe requis' }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as { password_hash: string } | undefined
    if (!user || !verifyPassword(password, user.password_hash)) {
      return { success: false, error: 'Mot de passe incorrect' }
    }

    const timestamp = now()
    db.transaction(() => {
      db.prepare('UPDATE users SET secret_question = ?, secret_answer_hash = ?, updated_at = ? WHERE id = 1')
        .run(question, hashPassword(answer.trim().toLowerCase()), timestamp)
      db.prepare(`INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('settings_changed', 'settings', 1, 'Question secrète modifiée', ?)`).run(timestamp)
    })()
    return { success: true }
  })

  // ── Settings: update shop name ──
  ipcMain.handle('settings:updateShopName', (_event, { shopName }: { shopName: string }) => {
    const db = getDb()
    const err = validateString(shopName, 'Le nom de la boutique', 100)
    if (err) return { success: false, error: err }
    const timestamp = now()
    db.transaction(() => {
      db.prepare('UPDATE users SET shop_name = ?, updated_at = ? WHERE id = 1').run(shopName.trim(), timestamp)
      db.prepare(`INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('settings_changed', 'settings', 1, 'Nom de boutique modifié', ?)`).run(timestamp)
    })()
    return { success: true }
  })

  // ── Settings: update backup folder ──
  ipcMain.handle('settings:updateBackupFolder', (_event, { folderPath }: { folderPath: string }) => {
    const db = getDb()
    const timestamp = now()
    db.transaction(() => {
      db.prepare('UPDATE users SET backup_folder_path = ?, updated_at = ? WHERE id = 1').run(folderPath, timestamp)
      db.prepare(`INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('settings_changed', 'settings', 1, 'Dossier de sauvegarde modifié', ?)`).run(timestamp)
    })()
    return { success: true }
  })

  // ── Backups ──
  ipcMain.handle('backups:create', (_event, { triggerType }: { triggerType: 'manual' | 'auto_close' | 'auto_hourly' | 'auto_movement_threshold' }) => {
    return createBackup(triggerType)
  })

  ipcMain.handle('backups:list', () => listBackups())

  ipcMain.handle('backups:restore', async (_event, { filePath }: { filePath: string }) => await restoreBackup(filePath))

  ipcMain.handle('backups:openFolder', () => {
    const folder = getBackupFolder()
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
    shell.openPath(folder)
    return { success: true }
  })

  ipcMain.handle('backups:getStatus', () => ({
    movementCount: getStockMovementCountSinceLastBackup(),
    lastBackupTime: getLastBackupTime(),
    backupFolder: getBackupFolder(),
  }))

  // ── History: list ──
  ipcMain.handle('history:list', (_event, filters: { operation_type?: string; dateFrom?: string; dateTo?: string } = {}) => {
    let sql = 'SELECT * FROM history_log WHERE 1=1'
    const params: unknown[] = []
    if (filters.operation_type) { sql += ' AND operation_type = ?'; params.push(filters.operation_type) }
    if (filters.dateFrom) { sql += ' AND created_at >= ?'; params.push(filters.dateFrom) }
    if (filters.dateTo) { sql += ' AND created_at <= ?'; params.push(filters.dateTo) }
    sql += ' ORDER BY created_at DESC'
    return getDb().prepare(sql).all(...params)
  })
}
