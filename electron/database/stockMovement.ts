/**
 * Single place where stock is moved. Every call:
 *  - reads the product's current quantity,
 *  - refuses to go below zero,
 *  - records the movement in stock_movements,
 *  - updates products.quantity.
 *
 * Kept free of any Electron import so it can be unit tested directly.
 */

export interface StockMovementDb {
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number; lastInsertRowid: number }
  }
}

export interface StockMovementOptions {
  productId: number
  movementType: 'in' | 'out'
  quantity: number
  reason: string
  referenceType?: string | null
  referenceId?: number | null
  justification?: string | null
  timestamp: string
}

export interface StockMovementResult {
  stockBefore: number
  stockAfter: number
}

export function applyStockMovement(db: StockMovementDb, opts: StockMovementOptions): StockMovementResult {
  if (opts.movementType !== 'in' && opts.movementType !== 'out') {
    throw new Error('Type de mouvement invalide')
  }
  if (!Number.isInteger(opts.quantity) || opts.quantity < 1) {
    throw new Error('Quantité invalide')
  }

  const row = db.prepare('SELECT quantity FROM products WHERE id = ?').get(opts.productId) as { quantity: number } | undefined
  if (!row) throw new Error(`Produit #${opts.productId} introuvable`)

  const stockBefore = row.quantity
  const stockAfter = opts.movementType === 'in' ? stockBefore + opts.quantity : stockBefore - opts.quantity

  if (stockAfter < 0) {
    throw new Error(`Stock insuffisant : ${stockBefore} disponible(s), ${opts.quantity} demandé(s)`)
  }

  db.prepare(`
    INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, justification, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.productId,
    opts.movementType,
    opts.quantity,
    opts.reason,
    opts.referenceType ?? null,
    opts.referenceId ?? null,
    stockBefore,
    stockAfter,
    opts.justification ?? null,
    opts.timestamp
  )

  db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
    .run(stockAfter, opts.timestamp, opts.productId)

  return { stockBefore, stockAfter }
}
