import path from 'path'
import fs from 'fs'
import { app, dialog } from 'electron'
import { SqliteWrapper, createSqliteWrapper } from './sqlite-wrapper'
import { logger } from '../logger'

let db: SqliteWrapper | null = null
const SCHEMA_VERSION = 4

export function getDb(): SqliteWrapper {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export async function initDatabase(): Promise<SqliteWrapper> {
  const dbPath = path.join(app.getPath('userData'), 'stockflow.db')
  const existedBefore = fs.existsSync(dbPath)
  const open = await createSqliteWrapper(dbPath)
  db = open.wrapper

  if (open.corruption) {
    logger.error(`Database file was unreadable and has been preserved at ${open.corruption.renamedTo}: ${open.corruption.error}`)
    dialog.showErrorBox(
      'Base de données corrompue',
      `Le fichier de base de données était illisible.\n\n` +
      `L'ancien fichier a été conservé sous le nom :\n${open.corruption.renamedTo}\n\n` +
      `StockFlow a démarré avec une base vide. Restaurez une sauvegarde depuis Paramètres › Sauvegardes.`
    )
  }

  db.pragma('foreign_keys = ON')

  createTables()
  if (existedBefore && !open.corruption) {
    runMigrations()
  } else {
    // Fresh install (or fresh file after corruption): schema is already at the current version.
    setSchemaVersion(SCHEMA_VERSION)
  }
  seedIfNeeded()

  db.persist()
  return db
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function setSchemaVersion(version: number) {
  // schema_version has no primary key: clear it so exactly one row remains.
  db!.prepare('DELETE FROM schema_version').run()
  db!.prepare('INSERT INTO schema_version (version, updated_at) VALUES (?, ?)')
    .run(version, now())
}

function getSchemaVersion(): number {
  try {
    const row = db!.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get() as { v: number } | undefined
    return row?.v ?? 0
  } catch {
    return 0
  }
}

const HISTORY_LOG_OPERATIONS = [
  'sale_created', 'sale_cancelled', 'sale_updated', 'sale_deleted',
  'repair_created', 'repair_updated', 'repair_status_changed', 'repair_cancelled', 'repair_deleted',
  'product_created', 'product_updated', 'product_deleted',
  'stock_adjusted', 'backup_created', 'backup_restored', 'settings_changed',
].map((o) => `'${o}'`).join(', ')

function recreateHistoryLog() {
  const oldIndexes = db!.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'history_log' AND sql IS NOT NULL`
  ).all() as Array<{ sql: string }>

  db!.exec(`CREATE TABLE history_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type  TEXT    NOT NULL CHECK (operation_type IN (${HISTORY_LOG_OPERATIONS})),
    entity_type     TEXT    NOT NULL CHECK (entity_type IN ('product', 'sale', 'repair', 'backup', 'settings')),
    entity_id       INTEGER,
    description     TEXT    NOT NULL,
    created_at      TEXT    NOT NULL
  )`)
  db!.exec(`INSERT INTO history_log_new SELECT id, operation_type, entity_type, entity_id, description, created_at FROM history_log`)
  db!.exec(`DROP TABLE history_log`)
  db!.exec(`ALTER TABLE history_log_new RENAME TO history_log`)
  // Dropping the table dropped its indexes with it.
  for (const idx of oldIndexes) db!.exec(idx.sql)
}

function runMigrations() {
  const currentVersion = getSchemaVersion()
  if (currentVersion >= SCHEMA_VERSION) return

  logger.info(`Schema migration: ${currentVersion} → ${SCHEMA_VERSION}`)

  // Each migration runs in its own transaction: on failure the schema is left
  // untouched and the version is not bumped, so the migration retries next launch.
  const migrate = db!.transaction((step: () => void) => step())
  let version = currentVersion
  // V2 already recreates history_log with the current CHECK constraint.
  let historyLogReady = false

  try {
    if (version < 1) {
      migrate(() => setSchemaVersion(1))
      version = 1
    }

    if (version < 2) {
      logger.info('Migration V2: recreating history_log and stock_movements with new CHECK constraints')
      migrate(() => {
        recreateHistoryLog()

        const oldCols = db!.prepare('PRAGMA table_info(stock_movements)').all() as Array<{ name: string }>
        const keepJustification = oldCols.some((c) => c.name === 'justification')
        const selectCols = [
          'id', 'product_id', 'movement_type', 'quantity', 'reason',
          'reference_type', 'reference_id', 'stock_before', 'stock_after',
          ...(keepJustification ? ['justification'] : []),
          'created_at',
        ].join(', ')
        const newJustification = keepJustification ? ', justification' : ''

        db!.exec(`CREATE TABLE stock_movements_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id      INTEGER NOT NULL REFERENCES products(id),
          movement_type   TEXT    NOT NULL CHECK (movement_type IN ('in', 'out')),
          quantity        INTEGER NOT NULL CHECK (quantity > 0),
          reason          TEXT    NOT NULL CHECK (reason IN ('initial_stock', 'manual_adjustment', 'sale', 'sale_cancellation', 'sale_deletion', 'repair_part', 'repair_cancellation', 'repair_deletion')),
          reference_type  TEXT    CHECK (reference_type IN ('sale', 'repair')),
          reference_id    INTEGER,
          stock_before    INTEGER NOT NULL CHECK (stock_before >= 0),
          stock_after     INTEGER NOT NULL CHECK (stock_after >= 0),${newJustification}
          created_at      TEXT    NOT NULL
        )`)
        db!.exec(`INSERT INTO stock_movements_new (${selectCols}) SELECT ${selectCols} FROM stock_movements`)
        db!.exec(`DROP TABLE stock_movements`)
        db!.exec(`ALTER TABLE stock_movements_new RENAME TO stock_movements`)
        setSchemaVersion(2)
      })
      version = 2
      historyLogReady = true
      logger.info('Migration V2: done')
    }

    if (version < 3) {
      logger.info('Migration V3: adding justification column to stock_movements')
      migrate(() => {
        const cols = db!.prepare('PRAGMA table_info(stock_movements)').all() as Array<{ name: string }>
        if (!cols.some((c) => c.name === 'justification')) {
          db!.exec(`ALTER TABLE stock_movements ADD COLUMN justification TEXT`)
        }
        setSchemaVersion(3)
      })
      version = 3
      logger.info('Migration V3: done')
    }

    if (version < 4 && !historyLogReady) {
      // V4: history_log CHECK constraint did not allow 'repair_updated'
      // (SQLite cannot alter a CHECK constraint: table recreation required).
      logger.info('Migration V4: recreating history_log to allow repair_updated')
      migrate(() => {
        recreateHistoryLog()
        setSchemaVersion(4)
      })
      version = 4
      logger.info('Migration V4: done')
    } else if (version < 4 && historyLogReady) {
      // history_log already recreated by V2: only bump the version.
      migrate(() => setSchemaVersion(4))
      version = 4
    }
  } catch (e) {
    // The failed step rolled back; the previous schema is still usable.
    const err = e as Error
    logger.error(`Schema migration failed at version ${getSchemaVersion()}: ${err.message}`)
    dialog.showErrorBox(
      'Migration de la base de données impossible',
      `La base de données n'a pas pu être migrée :\n${err.message}\n\n` +
      `L'ancien schéma est conservé : l'application démarre, mais certaines fonctionnalités peuvent échouer.\n` +
      `Une nouvelle tentative sera faite au prochain lancement. En cas de problème, restaurez une sauvegarde.`
    )
    return
  }

  const final = getSchemaVersion()
  if (final < SCHEMA_VERSION) {
    logger.error(`Schema migration incomplete: version is ${final}, expected ${SCHEMA_VERSION}`)
  }
}

function createTables() {
  const schema = `
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_name       TEXT    NOT NULL DEFAULT '',
      password_hash   TEXT    NOT NULL DEFAULT '',
      secret_question TEXT    NOT NULL DEFAULT '',
      secret_answer_hash TEXT NOT NULL DEFAULT '',
      backup_folder_path  TEXT NOT NULL DEFAULT '',
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL UNIQUE,
      is_predefined   INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brands (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL UNIQUE,
      is_predefined   INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      category_id     INTEGER NOT NULL REFERENCES categories(id),
      brand_id        INTEGER NOT NULL REFERENCES brands(id),
      model           TEXT    NOT NULL,
      purchase_price  INTEGER NOT NULL CHECK (purchase_price >= 0),
      sale_price      INTEGER NOT NULL CHECK (sale_price >= 0),
      quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      is_deleted      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id      INTEGER NOT NULL REFERENCES products(id),
      movement_type   TEXT    NOT NULL CHECK (movement_type IN ('in', 'out')),
      quantity        INTEGER NOT NULL CHECK (quantity > 0),
      reason          TEXT    NOT NULL CHECK (reason IN ('initial_stock', 'manual_adjustment', 'sale', 'sale_cancellation', 'sale_deletion', 'repair_part', 'repair_cancellation', 'repair_deletion')),
      reference_type  TEXT    CHECK (reference_type IN ('sale', 'repair')),
      reference_id    INTEGER,
      stock_before    INTEGER NOT NULL,
      stock_after     INTEGER NOT NULL,
      justification   TEXT,
      created_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name     TEXT,
      discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
      payment_method  TEXT    NOT NULL CHECK (payment_method IN ('cash', 'mobile_money')),
      subtotal        INTEGER NOT NULL CHECK (subtotal >= 0),
      total           INTEGER NOT NULL CHECK (total >= 0),
      status          TEXT    NOT NULL DEFAULT 'validated' CHECK (status IN ('validated', 'cancelled')),
      created_at      TEXT    NOT NULL,
      cancelled_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id         INTEGER NOT NULL REFERENCES sales(id),
      product_id      INTEGER NOT NULL REFERENCES products(id),
      unit_price      INTEGER NOT NULL CHECK (unit_price >= 0),
      quantity        INTEGER NOT NULL CHECK (quantity > 0),
      subtotal        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repairs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name     TEXT,
      device_model    TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delivered', 'cancelled')),
      labor_cost      INTEGER NOT NULL DEFAULT 0 CHECK (labor_cost >= 0),
      amount_paid     INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      total_due       INTEGER NOT NULL DEFAULT 0,
      remaining       INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL,
      delivered_at    TEXT,
      cancelled_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS repair_parts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      repair_id       INTEGER NOT NULL REFERENCES repairs(id),
      product_id      INTEGER NOT NULL REFERENCES products(id),
      unit_price      INTEGER NOT NULL CHECK (unit_price >= 0),
      quantity        INTEGER NOT NULL CHECK (quantity > 0)
    );

    CREATE TABLE IF NOT EXISTS history_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type  TEXT    NOT NULL CHECK (operation_type IN ('sale_created', 'sale_cancelled', 'sale_updated', 'sale_deleted', 'repair_created', 'repair_updated', 'repair_status_changed', 'repair_cancelled', 'repair_deleted', 'product_created', 'product_updated', 'product_deleted', 'stock_adjusted', 'backup_created', 'backup_restored', 'settings_changed')),
      entity_type     TEXT    NOT NULL CHECK (entity_type IN ('product', 'sale', 'repair', 'backup', 'settings')),
      entity_id       INTEGER,
      description     TEXT    NOT NULL,
      created_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path       TEXT    NOT NULL,
      trigger_type    TEXT    NOT NULL CHECK (trigger_type IN ('manual', 'auto_close', 'auto_hourly', 'auto_movement_threshold')),
      created_at      TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
    CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
    CREATE INDEX IF NOT EXISTS idx_repairs_created_at ON repairs(created_at);
    CREATE INDEX IF NOT EXISTS idx_repair_parts_repair_id ON repair_parts(repair_id);
    CREATE INDEX IF NOT EXISTS idx_history_log_operation_type ON history_log(operation_type);
    CREATE INDEX IF NOT EXISTS idx_history_log_created_at ON history_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_history_log_entity ON history_log(entity_type, entity_id);
  `

  db!.exec(schema)
}

function seedIfNeeded() {
  const count = db!.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number } | undefined

  if (count && count.count > 0) return

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  const categories = [
    'Écran', 'Batterie', 'Chargeur', 'Coque', 'Câble',
    'Carte mémoire', 'Kit mains-libres', 'Protection verre',
    'Support', 'Adaptateur', 'Casque', 'Connecteur',
  ]

  const brands = [
    'Samsung', 'Apple', 'Xiaomi', 'Huawei', 'Oppo',
    'Vivo', 'Realme', 'Tecno', 'Infinix', 'Nokia',
    'Sony', 'LG', 'Motorola', 'OnePlus', 'Google',
  ]

  const transaction = db!.transaction(() => {
    for (const name of categories) {
      db!.prepare('INSERT INTO categories (name, is_predefined, created_at) VALUES (?, 1, ?)').run(name, now)
    }
    for (const name of brands) {
      db!.prepare('INSERT INTO brands (name, is_predefined, created_at) VALUES (?, 1, ?)').run(name, now)
    }

    db!.prepare(
      `INSERT INTO users (id, shop_name, password_hash, secret_question, secret_answer_hash, backup_folder_path, created_at, updated_at)
       VALUES (1, '', '', '', '', '', ?, ?)`
    ).run(now, now)
  })

  transaction()
}

export function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

export function isFirstLaunch(): boolean {
  const user = db!.prepare('SELECT password_hash FROM users WHERE id = 1').get() as { password_hash: string } | undefined
  return !user || user.password_hash === ''
}
