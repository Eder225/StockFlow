import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import initSqlJs from 'sql.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteWrapper } from '../electron/database/sqlite-wrapper'
import { applyStockMovement } from '../electron/database/stockMovement'

const SCHEMA = `
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  justification TEXT,
  created_at TEXT NOT NULL
);
`

describe('applyStockMovement', () => {
  let dir: string
  let db: SqliteWrapper
  const TS = '2026-01-01 12:00:00'

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'stockflow-test-'))
    const SQL = await initSqlJs()
    db = new SqliteWrapper(new SQL.Database(), path.join(dir, 'test.db'))
    db.exec(SCHEMA)
    db.exec("INSERT INTO products (name, quantity) VALUES ('Cable USB', 10)")
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function productQuantity(): number {
    return (db.prepare('SELECT quantity FROM products WHERE id = 1').get() as { quantity: number }).quantity
  }

  function movements() {
    return db.prepare('SELECT * FROM stock_movements ORDER BY id').all() as Array<Record<string, unknown>>
  }

  it('increases stock and records before/after', () => {
    const result = applyStockMovement(db, {
      productId: 1,
      movementType: 'in',
      quantity: 5,
      reason: 'initial_stock',
      timestamp: TS,
    })

    expect(result).toEqual({ stockBefore: 10, stockAfter: 15 })
    expect(productQuantity()).toBe(15)

    const rows = movements()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      product_id: 1,
      movement_type: 'in',
      quantity: 5,
      reason: 'initial_stock',
      reference_type: null,
      reference_id: null,
      stock_before: 10,
      stock_after: 15,
      justification: null,
      created_at: TS,
    })
  })

  it('decreases stock and refuses to go below zero', () => {
    const result = applyStockMovement(db, {
      productId: 1,
      movementType: 'out',
      quantity: 4,
      reason: 'sale',
      referenceType: 'sale',
      referenceId: 42,
      timestamp: TS,
    })

    expect(result).toEqual({ stockBefore: 10, stockAfter: 6 })
    expect(productQuantity()).toBe(6)
    expect(movements()[0]).toMatchObject({
      movement_type: 'out',
      reference_type: 'sale',
      reference_id: 42,
      stock_before: 10,
      stock_after: 6,
    })
  })

  it('refuses an outgoing movement larger than the stock', () => {
    expect(() =>
      applyStockMovement(db, {
        productId: 1,
        movementType: 'out',
        quantity: 11,
        reason: 'sale',
        timestamp: TS,
      })
    ).toThrow('Stock insuffisant')

    expect(productQuantity()).toBe(10)
    expect(movements()).toHaveLength(0)
  })

  it('refuses to move a product that does not exist', () => {
    expect(() =>
      applyStockMovement(db, {
        productId: 999,
        movementType: 'in',
        quantity: 1,
        reason: 'sale',
        timestamp: TS,
      })
    ).toThrow('introuvable')
    expect(movements()).toHaveLength(0)
  })

  it('refuses an invalid movement type', () => {
    expect(() =>
      applyStockMovement(db, {
        productId: 1,
        movementType: 'inout' as 'in',
        quantity: 1,
        reason: 'sale',
        timestamp: TS,
      })
    ).toThrow('Type de mouvement invalide')
    expect(productQuantity()).toBe(10)
  })

  it.each([0, -1, 1.5, NaN])('refuses the quantity %s', (quantity) => {
    expect(() =>
      applyStockMovement(db, {
        productId: 1,
        movementType: 'in',
        quantity,
        reason: 'sale',
        timestamp: TS,
      })
    ).toThrow('Quantité invalide')
    expect(productQuantity()).toBe(10)
    expect(movements()).toHaveLength(0)
  })

  it('stores the justification', () => {
    applyStockMovement(db, {
      productId: 1,
      movementType: 'out',
      quantity: 2,
      reason: 'manual_adjustment',
      justification: 'Cassé',
      timestamp: TS,
    })

    expect(movements()[0].justification).toBe('Cassé')
  })
})
