import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDb, initDatabase } from './db'

let cachedDbPath: string | null = null

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function getDbPath(): string {
  if (!cachedDbPath) {
    cachedDbPath = path.join(app.getPath('userData'), 'stockflow.db')
  }
  return cachedDbPath
}

function getDefaultBackupDir(): string {
  return path.join(app.getPath('documents'), 'StockFlow', 'Backups')
}

export function getBackupFolder(): string {
  const user = getDb().prepare('SELECT backup_folder_path FROM users WHERE id = 1').get() as { backup_folder_path: string } | undefined
  return (user?.backup_folder_path?.trim()) || getDefaultBackupDir()
}

export function createBackup(triggerType: 'manual' | 'auto_close' | 'auto_hourly' | 'auto_movement_threshold'): { success: boolean; error?: string; filePath?: string } {
  try {
    const dbDir = getBackupFolder()
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

    const timestamp = now().replace(/[-: ]/g, '_')
    const fileName = `stockflow_backup_${timestamp}.db`
    const filePath = path.join(dbDir, fileName)

    try {
      fs.accessSync(dbDir, fs.constants.W_OK)
    } catch {
      return { success: false, error: 'Le dossier de destination n\'est pas accessible en écriture' }
    }

    const srcDb = getDb()
    srcDb.backup(filePath)

    const time = now()
    const info = getDb().prepare(`INSERT INTO backups (file_path, trigger_type, created_at) VALUES (?, ?, ?)`)
      .run(filePath, trigger_type, time)

    getDb().prepare(`INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
      VALUES ('backup_created', 'backup', ?, ?, ?)`)
      .run(info.lastInsertRowid, `Sauvegarde créée - ${triggerType.replace('_', ' ')}`, time)

    // Rotation : ne garder que les 20 backups les plus récents
    const allBackups = getDb().prepare(
      `SELECT id, file_path FROM backups ORDER BY created_at DESC`
    ).all() as Array<{ id: number; file_path: string }>
    if (allBackups.length > 20) {
      const toDelete = allBackups.slice(20)
      for (const b of toDelete) {
        try { fs.unlinkSync(b.file_path) } catch { /* fichier peut déjà être supprimé */ }
        getDb().prepare('DELETE FROM backups WHERE id = ?').run(b.id)
      }
    }

    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export function listBackups(): Array<{ file_path: string; trigger_type: string; created_at: string; size: number }> {
  const folder = getBackupFolder()
  if (!fs.existsSync(folder)) return []

  const files = fs.readdirSync(folder)
    .filter((f) => f.endsWith('.db') && f.startsWith('stockflow_backup_'))
    .map((f) => {
      const fp = path.join(folder, f)
      try {
        const stat = fs.statSync(fp)
        return {
          file_path: fp,
          trigger_type: '',
          created_at: stat.birthtime.toISOString().replace('T', ' ').slice(0, 19),
          size: stat.size,
        }
      } catch { return null }
    })
    .filter(Boolean) as Array<{ file_path: string; trigger_type: string; created_at: string; size: number }>

  const records = getDb().prepare('SELECT file_path, trigger_type, created_at FROM backups ORDER BY created_at DESC').all() as Array<{
    file_path: string; trigger_type: string; created_at: string
  }>
  const recordMap = new Map(records.map((r) => [r.file_path, r]))

  return files.map((f) => ({
    ...f,
    trigger_type: recordMap.get(f.file_path)?.trigger_type || 'manual',
    created_at: recordMap.get(f.file_path)?.created_at || f.created_at,
  })).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function restoreBackup(filePath: string): Promise<{ success: boolean; error?: string; safetyBackup?: string }> {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: 'Fichier de sauvegarde introuvable' }

    const dbPath = getDbPath()
    const backupDir = getBackupFolder()
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

    // Create safety backup of current state
    const safetyTimestamp = now().replace(/[-: ]/g, '_')
    const safetyPath = path.join(backupDir, `pre_restore_safety_${safetyTimestamp}.db`)

    const db = getDb()
    db.backup(safetyPath)

    // Close current connection
    db.close()

    // Replace db file with backup
    fs.copyFileSync(filePath, dbPath)

    // Reinitialize database connection
    await initDatabase()

    // Log the restore in the restored DB
    const time = now()
    getDb().prepare(`INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
      VALUES ('backup_restored', 'backup', 0, ?, ?)`)
      .run(`Base restaurée depuis ${path.basename(filePath)}`, time)

    return { success: true, safetyBackup: safetyPath }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export function getStockMovementCountSinceLastBackup(): number {
  const lastBackup = getDb().prepare('SELECT MAX(created_at) AS last_time FROM backups').get() as { last_time: string | null }
  if (!lastBackup?.last_time) return 999

  const count = getDb().prepare(
    'SELECT COUNT(*) AS c FROM stock_movements WHERE created_at > ?'
  ).get(lastBackup.last_time) as { c: number }

  return count.c
}

export function getLastBackupTime(): string | null {
  const row = getDb().prepare('SELECT MAX(created_at) AS t FROM backups').get() as { t: string | null }
  return row?.t || null
}
