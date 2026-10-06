import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'

export class SqliteWrapper {
  private db: SqlJsDatabase
  private dbPath: string
  private inTransaction = 0
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private dirty = false

  constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db
    this.dbPath = dbPath
  }

  private debouncedPersist() {
    this.dirty = true
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.flush()
      this.persistTimer = null
    }, 2000)
  }

  private flush() {
    if (!this.dirty) return
    this.dirty = false
    const data = this.db.export()
    fs.writeFileSync(this.dbPath, Buffer.from(data))
  }

  persist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.flush()
  }

  markDirty() {
    this.dirty = true
  }

  schedulePersist() {
    this.markDirty()
    if (this.inTransaction === 0) this.debouncedPersist()
  }

  prepare(sql: string) {
    return new StatementWrapper(this, sql)
  }

  transaction<T>(fn: (...args: any[]) => T) {
    const wrapper = this
    return function (this: unknown, ...args: any[]) {
      wrapper.db.run('BEGIN')
      wrapper.inTransaction++
      try {
        const result = fn.apply(this, args)
        wrapper.db.run('COMMIT')
        wrapper.inTransaction--
        wrapper.persist()
        return result
      } catch (e) {
        wrapper.db.run('ROLLBACK')
        wrapper.inTransaction--
        wrapper.persist()
        throw e
      }
    }
  }

  pragma(str: string) {
    this.db.exec(`PRAGMA ${str}`)
  }

  exec(sql: string) {
    this.db.exec(sql)
    if (this.inTransaction === 0) this.debouncedPersist()
  }

  close() {
    this.persist()
    this.db.close()
  }

  backup(filePath: string) {
    this.persist()
    fs.copyFileSync(this.dbPath, filePath)
  }

  getRawDb() {
    return this.db
  }
}

class StatementWrapper {
  private wrapper: SqliteWrapper
  private sql: string
  private pluckMode = false

  constructor(wrapper: SqliteWrapper, sql: string) {
    this.wrapper = wrapper
    this.sql = sql
  }

  pluck() {
    this.pluckMode = true
    return this
  }

  all(...params: unknown[]) {
    const stmt = this.wrapper.getRawDb().prepare(this.sql)
    if (params.length > 0) stmt.bind(params as [])
    const results: unknown[] = []
    while (stmt.step()) {
      if (this.pluckMode) {
        results.push(stmt.get()[0])
      } else {
        results.push(stmt.getAsObject())
      }
    }
    stmt.free()
    return results
  }

  iterate(...params: unknown[]) {
    const stmt = this.wrapper.getRawDb().prepare(this.sql)
    if (params.length > 0) stmt.bind(params as [])
    const iterator = {
      stmt,
      next() {
        if (stmt.step()) {
          return { value: stmt.getAsObject(), done: false }
        }
        stmt.free()
        return { value: undefined, done: true }
      },
      [Symbol.iterator]() {
        return this
      },
    }
    return iterator
  }

  get(...params: unknown[]) {
    const stmt = this.wrapper.getRawDb().prepare(this.sql)
    if (params.length > 0) stmt.bind(params as [])
    let result: unknown = undefined
    if (stmt.step()) {
      if (this.pluckMode) {
        result = stmt.get()[0]
      } else {
        result = stmt.getAsObject()
      }
    }
    stmt.free()
    return result
  }

  run(...params: unknown[]) {
    const raw = this.wrapper.getRawDb()
    if (params.length > 0) {
      raw.run(this.sql, params as [])
    } else {
      raw.run(this.sql)
    }

    this.wrapper.schedulePersist()

    let lastInsertRowid = 0
    const ridStmt = raw.prepare('SELECT last_insert_rowid() as id')
    if (ridStmt.step()) {
      lastInsertRowid = (ridStmt.getAsObject() as { id: number }).id
    }
    ridStmt.free()

    return {
      changes: raw.getRowsModified(),
      lastInsertRowid,
    }
  }
}

export interface SqliteOpenResult {
  wrapper: SqliteWrapper
  /** Set when an existing database file could not be read: the file has been renamed, not overwritten. */
  corruption?: { renamedTo: string; error: string }
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
}

export async function createSqliteWrapper(dbPath: string): Promise<SqliteOpenResult> {
  const SQL = await initSqlJs()

  if (!fs.existsSync(dbPath)) {
    return { wrapper: new SqliteWrapper(new SQL.Database(), dbPath) }
  }

  let db: SqlJsDatabase | null = null
  let readError: string | null = null
  try {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
    // Construction can succeed on garbage bytes; force SQLite to parse the header.
    db.exec('SELECT count(*) FROM sqlite_master')
  } catch (e) {
    readError = (e as Error).message || String(e)
    try { db?.close() } catch { /* ignore */ }
    db = null
  }

  if (!db) {
    const renamedTo = `${dbPath}.corrupt-${stamp()}`
    try {
      fs.renameSync(dbPath, renamedTo)
    } catch (e) {
      // Renaming failed: keep the original untouched by pointing the new DB elsewhere.
      const fallback = `${dbPath}.fresh-${stamp()}`
      return {
        wrapper: new SqliteWrapper(new SQL.Database(), fallback),
        corruption: { renamedTo: fallback, error: `${readError} (rename failed: ${(e as Error).message})` },
      }
    }
    return {
      wrapper: new SqliteWrapper(new SQL.Database(), dbPath),
      corruption: { renamedTo, error: readError || 'unknown' },
    }
  }

  return { wrapper: new SqliteWrapper(db, dbPath) }
}

/**
 * Reads the table list of a SQLite file without touching the live database.
 * Returns null when the file cannot be read as SQLite.
 */
export async function readTableNames(dbPath: string): Promise<string[] | null> {
  const SQL = await initSqlJs()
  let db: SqlJsDatabase | null = null
  try {
    db = new SQL.Database(fs.readFileSync(dbPath))
    const rows = db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")
    if (rows.length === 0) return []
    return rows[0].values.map((v) => String(v[0]))
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* ignore */ }
  }
}
