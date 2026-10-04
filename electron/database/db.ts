import path from 'path'
import { app } from 'electron'
import { SqliteWrapper, createSqliteWrapper } from './sqlite-wrapper'
import { logger } from '../logger'

let db: SqliteWrapper | null = null
const SCHEMA_VERSION = 3

export function getDb(): SqliteWrapper {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export async function initDatabase(): Promise<SqliteWrapper> {
  const dbPath = path.join(app.getPath('userData'), 'stockflow.db')
  db = await createSqliteWrapper(dbPath)

  db.pragma('foreign_keys = ON')

  createTables()
  runMigrations()
  seedIfNeeded()

  db.persist()
  return db
}

function getSchemaVersion(): number {
  try {
    const row = db!.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined
    return row?.version ?? 0
  } catch {
    return 0
  }
}

function runMigrations() {
  const currentVersion = getSchemaVersion()
  if (currentVersion >= SCHEMA_VERSION) return

  logger.info(`Schema migration: ${currentVersion} → ${SCHEMA_VERSION}`)

  if (currentVersion < 1) {
    // V1: initial schema (all tables created by createTables())
    db!.prepare('INSERT OR REPLACE INTO schema_version (version, updated_at) VALUES (1, ?)')
      .run(new Date().toISOString().replace('T', ' ').slice(0, 19))
  }

  if (currentVersion < 2) {
    // V2: add sale_updated, sale_deleted to history_log; sale_deletion to stock_movements
    logger.info('Migration V2: recreating history_log and stock_movements with new CHECK constraints')
    try {
      db!.exec(`CREATE TABLE history_log_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type  TEXT    NOT NULL CHECK (operation_type IN ('sale_created', 'sale_cancelled', 'sale_updated', 'sale_deleted', 'repair_created', 'repair_status_changed', 'repair_cancelled', 'repair_deleted', 'product_created', 'product_updated', 'product_deleted', 'stock_adjusted', 'backup_created', 'backup_restored', 'settings_changed')),
        entity_type     TEXT    NOT NULL CHECK (entity_type IN ('product', 'sale', 'repair', 'backup', 'settings')),
        entity_id       INTEGER,
        description     TEXT    NOT NULL,
        created_at      TEXT    NOT NULL
      )`)
      db!.exec(`INSERT INTO history_log_new SELECT * FROM history_log`)
      db!.exec(`DROP TABLE history_log`)
      db!.exec(`ALTER TABLE history_log_new RENAME TO history_log`)
      logger.info('Migration V2: history_log recreated successfully')
    } catch (e) {
      logger.error('Migration V2 history_log failed: ' + (e as Error).message)
    }

    try {
      db!.exec(`CREATE TABLE stock_movements_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id      INTEGER NOT NULL REFERENCES products(id),
        movement_type   TEXT    NOT NULL CHECK (movement_type IN ('in', 'out')),
        quantity        INTEGER NOT NULL CHECK (quantity > 0),
        reason          TEXT    NOT NULL CHECK (reason IN ('initial_stock', 'manual_adjustment', 'sale', 'sale_cancellation', 'sale_deletion', 'repair_part', 'repair_cancellation', 'repair_deletion')),
        reference_type  TEXT    CHECK (reference_type IN ('sale', 'repair')),
        reference_id    INTEGER,
        stock_before    INTEGER NOT NULL CHECK (stock_before >= 0),
        stock_after     INTEGER NOT NULL CHECK (stock_after >= 0),
        created_at      TEXT    NOT NULL
      )`)
      db!.exec(`INSERT INTO stock_movements_new SELECT * FROM stock_movements`)
      db!.exec(`DROP TABLE stock_movements`)
      db!.exec(`ALTER TABLE stock_movements_new RENAME TO stock_movements`)
      logger.info('Migration V2: stock_movements recreated successfully')
    } catch (e) {
      logger.error('Migration V2 stock_movements failed: ' + (e as Error).message)
    }

    db!.prepare('INSERT OR REPLACE INTO schema_version (version, updated_at) VALUES (2, ?)')
      .run(new Date().toISOString().replace('T', ' ').slice(0, 19))
  }

  if (currentVersion < 3) {
    logger.info('Migration V3: adding justification column to stock_movements')
    try {
      db!.exec(`ALTER TABLE stock_movements ADD COLUMN justification TEXT`)
      logger.info('Migration V3: justification column added successfully')
    } catch (e) {
      logger.error('Migration V3 failed: ' + (e as Error).message)
    }
    db!.prepare('INSERT OR REPLACE INTO schema_version (version, updated_at) VALUES (3, ?)')
      .run(new Date().toISOString().replace('T', ' ').slice(0, 19))
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
      operation_type  TEXT    NOT NULL CHECK (operation_type IN ('sale_created', 'sale_cancelled', 'sale_updated', 'sale_deleted', 'repair_created', 'repair_status_changed', 'repair_cancelled', 'repair_deleted', 'product_created', 'product_updated', 'product_deleted', 'stock_adjusted', 'backup_created', 'backup_restored', 'settings_changed')),
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
