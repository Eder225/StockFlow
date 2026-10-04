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

    this.wrapper.markDirty()
    if (this.wrapper.inTransaction === 0) this.wrapper.debouncedPersist()

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

export async function createSqliteWrapper(dbPath: string): Promise<SqliteWrapper> {
  const SQL = await initSqlJs()
  let db: SqlJsDatabase

  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath)
      db = new SQL.Database(buffer)
    } else {
      db = new SQL.Database()
    }
  } catch {
    db = new SQL.Database()
  }

  return new SqliteWrapper(db, dbPath)
}
