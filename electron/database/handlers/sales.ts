import { ipcMain } from 'electron'
import { getDb } from '../db'
import { formatAmount, mergeQuantityLines, validateNonNegativeInt, validateQuantity, validateString } from '../validators'
import { applyStockMovement } from '../stockMovement'
import { now } from './common'

export function registerSalesHandlers() {
  // ── Sales: list ──
  ipcMain.handle('sales:list', (_event, filters: { status?: string; dateFrom?: string; dateTo?: string } = {}) => {
    let sql = `
      SELECT s.*, COUNT(si.id) AS item_count
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (filters.status) { sql += ' AND s.status = ?'; params.push(filters.status) }
    if (filters.dateFrom) { sql += ' AND s.created_at >= ?'; params.push(filters.dateFrom) }
    if (filters.dateTo) { sql += ' AND s.created_at <= ?'; params.push(filters.dateTo) }

    sql += ' GROUP BY s.id ORDER BY s.created_at DESC'

    return getDb().prepare(sql).all(...params)
  })

  // ── Sales: get by id ──
  ipcMain.handle('sales:getById', (_event, { id }: { id: number }) => {
    const db = getDb()
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!sale) return null

    const items = db.prepare(`
      SELECT si.*, p.name AS product_name
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `).all(id)

    return { ...sale, items }
  })

  // ── Sales: create ──
  ipcMain.handle('sales:create', (_event, data: {
    client_name?: string
    discount_amount: number
    payment_method: 'cash' | 'mobile_money'
    items: Array<{ product_id: number; quantity: number }>
  }) => {
    let err: string | null
    if ((err = validateNonNegativeInt(data.discount_amount, 'La remise'))) return { success: false, error: err }
    if (data.payment_method !== 'cash' && data.payment_method !== 'mobile_money') return { success: false, error: 'Mode de paiement invalide' }
    if (!Array.isArray(data.items) || data.items.length === 0) return { success: false, error: 'Le panier est vide' }
    if (data.client_name && (err = validateString(data.client_name, 'Le nom du client', 100))) return { success: false, error: err }
    for (const item of data.items) {
      if (typeof item.product_id !== 'number' || !Number.isInteger(item.product_id) || item.product_id < 1) return { success: false, error: 'Produit invalide' }
      if ((err = validateQuantity(item.quantity, 'La quantité'))) return { success: false, error: err }
    }
    // Merge duplicate lines: stock must be validated once per product, not once per line.
    const items = mergeQuantityLines(data.items)
    const productIds = items.map((i) => i.product_id)

    const db = getDb()
    const timestamp = now()

    const transaction = db.transaction(() => {
      // 1. Fetch current product prices and stock, validate stock
      const placeholders = productIds.map(() => '?').join(', ')
      const productRows = db.prepare(`SELECT id, name, sale_price, quantity FROM products WHERE is_deleted = 0 AND id IN (${placeholders})`).all(...productIds) as Array<{
        id: number; name: string; sale_price: number; quantity: number
      }>

      const productMap = new Map(productRows.map((p) => [p.id, p]))

      const insufficient: string[] = []
      let subtotal = 0
      const itemRows: Array<{ product_id: number; unit_price: number; quantity: number; subtotal: number }> = []

      for (const item of items) {
        const product = productMap.get(item.product_id)
        if (!product) { insufficient.push(`Produit #${item.product_id} introuvable`); continue }
        if (item.quantity > product.quantity) {
          insufficient.push(`Stock insuffisant pour ${product.name} : ${product.quantity} disponible(s), ${item.quantity} demandé(s)`)
          continue
        }
        const lineSubtotal = product.sale_price * item.quantity
        subtotal += lineSubtotal
        itemRows.push({ product_id: item.product_id, unit_price: product.sale_price, quantity: item.quantity, subtotal: lineSubtotal })
      }

      if (insufficient.length > 0) {
        throw new Error(insufficient.join(' ; '))
      }

      // 2. Apply discount cap
      const discount = Math.min(data.discount_amount, subtotal)
      const total = subtotal - discount

      // 3. Insert sale
      const saleInfo = db.prepare(`
        INSERT INTO sales (client_name, discount_amount, payment_method, subtotal, total, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(data.client_name || null, discount, data.payment_method, subtotal, total, timestamp)
      const saleId = saleInfo.lastInsertRowid as number

      // 4. Insert sale_items + stock_movements + update product quantities
      for (const row of itemRows) {
        db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, unit_price, quantity, subtotal)
          VALUES (?, ?, ?, ?, ?)
        `).run(saleId, row.product_id, row.unit_price, row.quantity, row.subtotal)

        const product = productMap.get(row.product_id)!
        const stockBefore = product.quantity
        const stockAfter = stockBefore - row.quantity

        db.prepare(`
          INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
          VALUES (?, 'out', ?, 'sale', 'sale', ?, ?, ?, ?)
        `).run(row.product_id, row.quantity, saleId, stockBefore, stockAfter, timestamp)

        db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
          .run(stockAfter, timestamp, row.product_id)
      }

      // 5. History log
      const itemCount = itemRows.reduce((sum, r) => sum + r.quantity, 0)
      const clientPart = data.client_name ? ` - Client: ${data.client_name}` : ''
      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('sale_created', 'sale', ?, ?, ?)
      `).run(saleId, `Vente #${saleId} créée - ${itemCount} article(s) - ${formatAmount(total)} FCFA${clientPart}`, timestamp)

      return { saleId, subtotal, discount, total, itemCount }
    })

    try {
      const result = transaction()
      return { success: true, ...result }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── Sales: cancel ──
  ipcMain.handle('sales:cancel', (_event, { id }: { id: number }) => {
    const db = getDb()
    const timestamp = now()

    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as { status: string } | undefined
    if (!sale) return { success: false, error: 'Vente introuvable' }
    if (sale.status === 'cancelled') return { success: false, error: 'Cette vente est déjà annulée' }

    const transaction = db.transaction(() => {
      db.prepare('UPDATE sales SET status = \'cancelled\', cancelled_at = ? WHERE id = ?').run(timestamp, id)

      const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id) as Array<{
        product_id: number; quantity: number
      }>

      for (const item of items) {
        if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(item.product_id)) continue

        applyStockMovement(db, {
          productId: item.product_id,
          movementType: 'in',
          quantity: item.quantity,
          reason: 'sale_cancellation',
          referenceType: 'sale',
          referenceId: id,
          timestamp,
        })
      }

      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('sale_cancelled', 'sale', ?, ?, ?)
      `).run(id, `Vente #${id} annulée`, timestamp)
    })()

    return { success: true }
  })

  // ── Sales: update ──
  ipcMain.handle('sales:update', (_event, data: {
    id: number
    client_name?: string
    discount_amount: number
    payment_method: 'cash' | 'mobile_money'
    created_at?: string
  }) => {
    try {
      let err: string | null
      if ((err = validateNonNegativeInt(data.discount_amount, 'La remise'))) return { success: false, error: err }
      if (data.payment_method !== 'cash' && data.payment_method !== 'mobile_money') return { success: false, error: 'Mode de paiement invalide' }
      if (data.client_name && (err = validateString(data.client_name, 'Le nom du client', 100))) return { success: false, error: err }

      const db = getDb()
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(data.id) as { status: string; subtotal: number } | undefined
      if (!sale) return { success: false, error: 'Vente introuvable' }
      if (sale.status === 'cancelled') return { success: false, error: 'Impossible de modifier une vente annulée' }

      const discount = Math.min(data.discount_amount, sale.subtotal)
      const total = sale.subtotal - discount
      const timestamp = now()
      const dateVal = data.created_at || timestamp

      db.prepare(`
        UPDATE sales SET client_name = ?, discount_amount = ?, payment_method = ?, total = ?, created_at = ?
        WHERE id = ?
      `).run(data.client_name || null, discount, data.payment_method, total, dateVal, data.id)

      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('sale_updated', 'sale', ?, ?, ?)
      `).run(data.id, `Vente #${data.id} modifiée`, timestamp)

      return { success: true, total }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  // ── Sales: delete ──
  // Deleting a validated sale restocks its items: this is deliberate, deletion
  // exists to correct an entry error and the goods are physically back.
  ipcMain.handle('sales:delete', (_event, { id }: { id: number }) => {
    try {
      const db = getDb()
      const timestamp = now()

      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as { status: string; total: number; client_name: string | null } | undefined
      if (!sale) return { success: false, error: 'Vente introuvable' }

      const transaction = db.transaction(() => {
        if (sale.status === 'validated') {
          const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id) as Array<{
            product_id: number; quantity: number
          }>

          for (const item of items) {
            if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(item.product_id)) continue

            applyStockMovement(db, {
              productId: item.product_id,
              movementType: 'in',
              quantity: item.quantity,
              reason: 'sale_deletion',
              referenceType: 'sale',
              referenceId: id,
              timestamp,
            })
          }
        }

        db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id)
        db.prepare('DELETE FROM sales WHERE id = ?').run(id)

        const clientPart = sale.client_name ? ` - Client: ${sale.client_name}` : ''
        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('sale_deleted', 'sale', ?, ?, ?)
        `).run(id, `Vente #${id} supprimée - ${formatAmount(sale.total)} FCFA${clientPart}`, timestamp)
      })()

      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })
}
