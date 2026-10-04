import { ipcMain, shell } from 'electron'
import fs from 'fs'
import { getDb } from './db'
import { hashPassword, verifyPassword, needsHashUpgrade } from './crypto'
import { createBackup, getBackupFolder, listBackups, restoreBackup, getStockMovementCountSinceLastBackup, getLastBackupTime } from './backup'

const MAX_STR_LEN = 200
const MIN_PASSWORD_LEN = 6
const MAX_PRICE = 999999999

function validateString(val: unknown, name: string, maxLen = MAX_STR_LEN): string | null {
  if (typeof val !== 'string' || !val.trim()) return `${name} est obligatoire`
  if (val.trim().length > maxLen) return `${name} ne doit pas dépasser ${maxLen} caractères`
  return null
}

function validatePositiveInt(val: unknown, name: string): string | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) return `${name} doit être un entier ≥ 0`
  if (val > MAX_PRICE) return `${name} ne doit pas dépasser ${MAX_PRICE}`
  return null
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function resolveBrandId(brandId: number): number {
  if (brandId >= 1) return brandId
  const db = getDb()
  const existing = db.prepare('SELECT id FROM brands WHERE name = ? COLLATE NOCASE').get('Autre') as { id: number } | undefined
  if (existing) return existing.id
  const info = db.prepare('INSERT INTO brands (name, is_predefined, created_at) VALUES (?, 0, ?)').run('Autre', now())
  return info.lastInsertRowid as number
}

export function registerHandlers() {
  // ── Dashboard ──
  ipcMain.handle('dashboard:getStats', () => {
    const db = getDb()
    const productCount = db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_deleted = 0').get() as { c: number }
    const stockValue = db.prepare('SELECT COALESCE(SUM(quantity * purchase_price), 0) AS v FROM products WHERE is_deleted = 0').get() as { v: number }
    const today = now().slice(0, 10)
    const todaySales = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS total FROM sales WHERE status = \'validated\' AND created_at >= ?').get(today) as { c: number; total: number }
    const inProgressRepairs = db.prepare('SELECT COUNT(*) AS c FROM repairs WHERE status IN (\'pending\', \'in_progress\', \'completed\')').get() as { c: number }
    const monthlySales = db.prepare(`
      SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
      FROM sales WHERE status = 'validated'
      GROUP BY month ORDER BY month DESC LIMIT 12
    `).all() as Array<{ month: string; count: number; total: number }>

    return {
      productCount: productCount.c,
      stockValue: stockValue.v,
      todaySalesCount: todaySales.c,
      todaySalesTotal: todaySales.total,
      inProgressRepairs: inProgressRepairs.c,
      monthlySales,
    }
  })

  // ── Dashboard: alerts ──
  ipcMain.handle('dashboard:getAlerts', () => {
    const db = getDb()

    const lowStockProducts = db.prepare(`
      SELECT id, name, quantity, sale_price
      FROM products WHERE is_deleted = 0 AND quantity <= 2
      ORDER BY quantity ASC, name ASC LIMIT 10
    `).all() as Array<{ id: number; name: string; quantity: number; sale_price: number }>

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    const topProducts = db.prepare(`
      SELECT p.name, SUM(si.quantity) AS qty, COALESCE(SUM(si.subtotal), 0) AS total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status = 'validated' AND s.created_at >= ?
      JOIN products p ON p.id = si.product_id
      GROUP BY si.product_id ORDER BY qty DESC LIMIT 5
    `).all(thirtyDaysAgo) as Array<{ name: string; qty: number; total: number }>

    const recentHistory = db.prepare(`
      SELECT description, created_at, operation_type FROM history_log
      ORDER BY created_at DESC LIMIT 10
    `).all() as Array<{ description: string; created_at: string; operation_type: string }>

    const shop = db.prepare('SELECT shop_name FROM users WHERE id = 1').get() as { shop_name: string } | undefined

    return { lowStockProducts, topProducts, recentHistory, shopName: shop?.shop_name || 'Ma Boutique' }
  })

  // ── Categories ──
  ipcMain.handle('categories:list', () => {
    return getDb().prepare('SELECT * FROM categories ORDER BY name').all()
  })

  // ── Brands ──
  ipcMain.handle('brands:list', () => {
    return getDb().prepare('SELECT * FROM brands ORDER BY name').all()
  })

  // ── Products: list ──
  ipcMain.handle('products:list', (_event, { showArchived }: { showArchived: boolean }) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT p.*, c.name AS category_name, b.name AS brand_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN brands b ON b.id = p.brand_id
      WHERE p.is_deleted = ?
      ORDER BY p.name
    `).all(showArchived ? 1 : 0)
    return rows
  })

  // ── Products: create ──
  ipcMain.handle('products:create', (_event, data: {
    name: string
    category_id: number
    brand_id: number
    model: string
    purchase_price: number
    sale_price: number
    initial_quantity: number
  }) => {
    let err: string | null
    if ((err = validateString(data.name, 'Le nom'))) return { success: false, error: err }
    if ((err = validateString(data.model, 'Le modèle'))) return { success: false, error: err }
    if ((err = validatePositiveInt(data.purchase_price, 'Le prix d\'achat'))) return { success: false, error: err }
    if ((err = validatePositiveInt(data.sale_price, 'Le prix de vente'))) return { success: false, error: err }
    if ((err = validatePositiveInt(data.initial_quantity, 'La quantité initiale'))) return { success: false, error: err }
    if (typeof data.category_id !== 'number' || data.category_id < 1) return { success: false, error: 'Catégorie invalide' }
    if (typeof data.brand_id !== 'number' || data.brand_id < 0) return { success: false, error: 'Marque invalide' }

    const db = getDb()
    const brandId = resolveBrandId(data.brand_id)
    const timestamp = now()

    const transaction = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO products (name, category_id, brand_id, model, purchase_price, sale_price, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(data.name, data.category_id, brandId, data.model, data.purchase_price, data.sale_price, timestamp, timestamp)

      const productId = info.lastInsertRowid as number

      if (data.initial_quantity > 0) {
        db.prepare(`
          INSERT INTO stock_movements (product_id, movement_type, quantity, reason, stock_before, stock_after, created_at)
          VALUES (?, 'in', ?, 'initial_stock', 0, ?, ?)
        `).run(productId, data.initial_quantity, data.initial_quantity, timestamp)

        db.prepare('UPDATE products SET quantity = ? WHERE id = ?')
          .run(data.initial_quantity, productId)
      }

      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('product_created', 'product', ?, ?, ?)
      `).run(productId, `Produit « ${data.name} » créé`, timestamp)

      return productId
    })

    return { success: true, id: transaction() }
  })

  // ── Products: update ──
  ipcMain.handle('products:update', (_event, data: {
    id: number
    name: string
    category_id: number
    brand_id: number
    model: string
    purchase_price: number
    sale_price: number
  }) => {
    let err: string | null
    if ((err = validateString(data.name, 'Le nom'))) return { success: false, error: err }
    if ((err = validateString(data.model, 'Le modèle'))) return { success: false, error: err }
    if ((err = validatePositiveInt(data.purchase_price, 'Le prix d\'achat'))) return { success: false, error: err }
    if ((err = validatePositiveInt(data.sale_price, 'Le prix de vente'))) return { success: false, error: err }
    if (typeof data.category_id !== 'number' || data.category_id < 1) return { success: false, error: 'Catégorie invalide' }
    if (typeof data.brand_id !== 'number' || data.brand_id < 0) return { success: false, error: 'Marque invalide' }

    const db = getDb()
    const brandId = resolveBrandId(data.brand_id)
    const timestamp = now()

    const old = db.prepare('SELECT * FROM products WHERE id = ?').get(data.id) as Record<string, unknown> | undefined
    if (!old) return { success: false, error: 'Produit introuvable' }

    const changes: string[] = []
    if (old.name !== data.name) changes.push(`nom: "${old.name}" → "${data.name}"`)
    if (old.purchase_price !== data.purchase_price) changes.push(`prix achat: ${old.purchase_price} → ${data.purchase_price} FCFA`)
    if (old.sale_price !== data.sale_price) changes.push(`prix vente: ${old.sale_price} → ${data.sale_price} FCFA`)
    if (old.model !== data.model) changes.push(`modèle: "${old.model}" → "${data.model}"`)

    const oldCat = db.prepare('SELECT name FROM categories WHERE id = ?').get(old.category_id as number) as { name: string } | undefined
    const newCat = db.prepare('SELECT name FROM categories WHERE id = ?').get(data.category_id) as { name: string } | undefined
    if (oldCat && newCat && old.category_id !== data.category_id) changes.push(`catégorie: "${oldCat.name}" → "${newCat.name}"`)

    const oldBrand = db.prepare('SELECT name FROM brands WHERE id = ?').get(old.brand_id as number) as { name: string } | undefined
    const newBrand = db.prepare('SELECT name FROM brands WHERE id = ?').get(data.brand_id) as { name: string } | undefined
    if (oldBrand && newBrand && old.brand_id !== data.brand_id) changes.push(`marque: "${oldBrand.name}" → "${newBrand.name}"`)

    db.transaction(() => {
      db.prepare(`
        UPDATE products SET name = ?, category_id = ?, brand_id = ?, model = ?, purchase_price = ?, sale_price = ?, updated_at = ?
        WHERE id = ?
      `).run(data.name, data.category_id, brandId, data.model, data.purchase_price, data.sale_price, timestamp, data.id)

      if (changes.length > 0) {
        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('product_updated', 'product', ?, ?, ?)
        `).run(data.id, changes.join(' ; '), timestamp)
      }
    })()

    return { success: true }
  })

  // ── Products: archive (soft delete) ──
  ipcMain.handle('products:archive', (_event, { id }: { id: number }) => {
    const db = getDb()
    const timestamp = now()

    db.transaction(() => {
      db.prepare('UPDATE products SET is_deleted = 1, updated_at = ? WHERE id = ?').run(timestamp, id)

      const product = db.prepare('SELECT name FROM products WHERE id = ?').get(id) as { name: string } | undefined
      if (product) {
        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('product_deleted', 'product', ?, ?, ?)
        `).run(id, `Produit « ${product.name} » archivé`, timestamp)
      }
    })()

    return { success: true }
  })

  // ── Products: restore ──
  ipcMain.handle('products:restore', (_event, { id }: { id: number }) => {
    const db = getDb()
    const timestamp = now()

    db.transaction(() => {
      db.prepare('UPDATE products SET is_deleted = 0, updated_at = ? WHERE id = ?').run(timestamp, id)

      const product = db.prepare('SELECT name FROM products WHERE id = ?').get(id) as { name: string } | undefined
      if (product) {
        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('product_updated', 'product', ?, ?, ?)
        `).run(id, `Produit « ${product.name} » restauré`, timestamp)
      }
    })()

    return { success: true }
  })

  // ── Products: search (for sales cart) ──
  ipcMain.handle('products:search', (_event, { query }: { query: string }) => {
    const q = `%${query}%`
    return getDb().prepare(`
      SELECT p.*, c.name AS category_name, b.name AS brand_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN brands b ON b.id = p.brand_id
      WHERE p.is_deleted = 0
        AND (p.name LIKE ? OR p.model LIKE ? OR c.name LIKE ? OR b.name LIKE ?)
      ORDER BY p.name
      LIMIT 20
    `).all(q, q, q, q)
  })

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
    if ((err = validatePositiveInt(data.discount_amount, 'La remise'))) return { success: false, error: err }
    if (data.payment_method !== 'cash' && data.payment_method !== 'mobile_money') return { success: false, error: 'Mode de paiement invalide' }
    if (!Array.isArray(data.items) || data.items.length === 0) return { success: false, error: 'Le panier est vide' }
    if (data.client_name && (err = validateString(data.client_name, 'Le nom du client', 100))) return { success: false, error: err }
    for (const item of data.items) {
      if (typeof item.product_id !== 'number' || item.product_id < 1) return { success: false, error: 'Produit invalide' }
      if (typeof item.quantity !== 'number' || item.quantity < 1) return { success: false, error: 'Quantité invalide' }
    }

    const db = getDb()
    const timestamp = now()

    const transaction = db.transaction(() => {
      // 1. Fetch current product prices and stock, validate stock
      const productRows = db.prepare('SELECT id, name, sale_price, quantity FROM products WHERE is_deleted = 0').all() as Array<{
        id: number; name: string; sale_price: number; quantity: number
      }>

      const productMap = new Map(productRows.map((p) => [p.id, p]))

      const insufficient: string[] = []
      let subtotal = 0
      const itemRows: Array<{ product_id: number; unit_price: number; quantity: number; subtotal: number }> = []

      for (const item of data.items) {
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
      `).run(saleId, `Vente #${saleId} créée - ${itemCount} article(s) - ${total.toLocaleString()} FCFA${clientPart}`, timestamp)

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
        const product = db.prepare('SELECT quantity FROM products WHERE id = ?').get(item.product_id) as { quantity: number } | undefined
        if (!product) continue

        const stockBefore = product.quantity
        const stockAfter = stockBefore + item.quantity

        db.prepare(`
          INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
          VALUES (?, 'in', ?, 'sale_cancellation', 'sale', ?, ?, ?, ?)
        `).run(item.product_id, item.quantity, id, stockBefore, stockAfter, timestamp)

        db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
          .run(stockAfter, timestamp, item.product_id)
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
      if ((err = validatePositiveInt(data.discount_amount, 'La remise'))) return { success: false, error: err }
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
  ipcMain.handle('sales:delete', (_event, { id }: { id: number }) => {
    try {
      const db = getDb()
      const timestamp = now()

      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as { status: string } | undefined
      if (!sale) return { success: false, error: 'Vente introuvable' }

      const transaction = db.transaction(() => {
        if (sale.status === 'validated') {
          const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(id) as Array<{
            product_id: number; quantity: number
          }>

          for (const item of items) {
            const product = db.prepare('SELECT quantity FROM products WHERE id = ?').get(item.product_id) as { quantity: number } | undefined
            if (!product) continue

            const stockBefore = product.quantity
            const stockAfter = stockBefore + item.quantity

            db.prepare(`
              INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
              VALUES (?, 'in', ?, 'sale_deletion', 'sale', ?, ?, ?, ?)
            `).run(item.product_id, item.quantity, id, stockBefore, stockAfter, timestamp)

            db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
              .run(stockAfter, timestamp, item.product_id)
          }
        }

        db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id)
        db.prepare('DELETE FROM sales WHERE id = ?').run(id)

        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('sale_deleted', 'sale', ?, ?, ?)
        `).run(id, `Vente #${id} supprimée`, timestamp)
      })()

      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  // ── Products: adjust stock ──
  ipcMain.handle('products:adjustStock', (_event, data: {
    product_id: number
    movement_type: 'in' | 'out'
    quantity: number
    reason?: string
    justification?: string
  }) => {
    const db = getDb()
    const timestamp = now()

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(data.product_id) as { quantity: number; name: string } | undefined
    if (!product) return { success: false, error: 'Produit introuvable' }

    if (data.movement_type === 'out' && data.quantity > product.quantity) {
      return { success: false, error: `Stock insuffisant. Stock actuel : ${product.quantity}.` }
    }

    const stockBefore = product.quantity
    const stockAfter = data.movement_type === 'in'
      ? stockBefore + data.quantity
      : stockBefore - data.quantity

    db.transaction(() => {
      db.prepare(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, reason, stock_before, stock_after, justification, created_at)
        VALUES (?, ?, ?, 'manual_adjustment', ?, ?, ?, ?)
      `).run(data.product_id, data.movement_type, data.quantity, stockBefore, stockAfter, data.justification || null, timestamp)

      db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
        .run(stockAfter, timestamp, data.product_id)

      const justifPart = data.justification ? ` [${data.justification}]` : ''
      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('stock_adjusted', 'product', ?, ?, ?)
      `).run(data.product_id, `Stock ajusté pour « ${product.name} » : ${data.movement_type === 'in' ? '+' : '-'}${data.quantity}${justifPart}`, timestamp)
    })()

    return { success: true, stock_before: stockBefore, stock_after: stockAfter }
  })

  // ── Repairs: list ──
  ipcMain.handle('repairs:list', (_event, filters: { status?: string; dateFrom?: string; dateTo?: string } = {}) => {
    let sql = 'SELECT * FROM repairs WHERE 1=1'
    const params: unknown[] = []
    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status) }
    if (filters.dateFrom) { sql += ' AND created_at >= ?'; params.push(filters.dateFrom) }
    if (filters.dateTo) { sql += ' AND created_at <= ?'; params.push(filters.dateTo) }
    sql += ' ORDER BY created_at DESC'
    return getDb().prepare(sql).all(...params)
  })

  // ── Repairs: get by id ──
  ipcMain.handle('repairs:getById', (_event, { id }: { id: number }) => {
    const db = getDb()
    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!repair) return null

    const parts = db.prepare(`
      SELECT rp.*, p.name AS product_name, p.sale_price AS current_price
      FROM repair_parts rp
      JOIN products p ON p.id = rp.product_id
      WHERE rp.repair_id = ?
    `).all(id)

    return { ...repair, parts }
  })

  // ── Repairs: create ──
  ipcMain.handle('repairs:create', (_event, data: {
    client_name?: string
    device_model: string
    status: string
    labor_cost: number
    amount_paid: number
    parts: Array<{ product_id: number; quantity: number }>
  }) => {
    const db = getDb()
    const timestamp = now()

    if (!data.device_model.trim()) return { success: false, error: 'Le modèle de l\'appareil est obligatoire' }
    if (data.labor_cost < 0) return { success: false, error: 'La main d\'œuvre doit être ≥ 0' }
    if (data.amount_paid < 0) return { success: false, error: 'Le montant payé doit être ≥ 0' }

    const transaction = db.transaction(() => {
      // Validate parts stock and calculate total
      let totalParts = 0
      const partRows: Array<{ product_id: number; unit_price: number; quantity: number; stock_before: number; stock_after: number }> = []

      for (const p of data.parts) {
        const product = db.prepare('SELECT id, name, sale_price, quantity FROM products WHERE id = ? AND is_deleted = 0').get(p.product_id) as {
          id: number; name: string; sale_price: number; quantity: number
        } | undefined
        if (!product) throw new Error(`Produit #${p.product_id} introuvable`)
        if (p.quantity > product.quantity) throw new Error(`Stock insuffisant pour ${product.name} : ${product.quantity} disponible(s)`)
        totalParts += product.sale_price * p.quantity
        partRows.push({ product_id: p.product_id, unit_price: product.sale_price, quantity: p.quantity, stock_before: product.quantity, stock_after: product.quantity - p.quantity })
      }

      const totalDue = totalParts + data.labor_cost
      const amountPaid = Math.min(data.amount_paid, totalDue)
      const remaining = totalDue - amountPaid

      // Determine effective status based on payment
      let effectiveStatus = data.status
      if (data.status === 'delivered' && remaining > 0) throw new Error('Le paiement doit être complet avant la livraison')

      const repairInfo = db.prepare(`
        INSERT INTO repairs (client_name, device_model, status, labor_cost, amount_paid, total_due, remaining, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.client_name || null, data.device_model.trim(), effectiveStatus, data.labor_cost, amountPaid, totalDue, remaining, timestamp, timestamp)
      const repairId = repairInfo.lastInsertRowid as number

      // Insert parts + stock movements
      for (const row of partRows) {
        db.prepare(`
          INSERT INTO repair_parts (repair_id, product_id, unit_price, quantity)
          VALUES (?, ?, ?, ?)
        `).run(repairId, row.product_id, row.unit_price, row.quantity)

        db.prepare(`
          INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
          VALUES (?, 'out', ?, 'repair_part', 'repair', ?, ?, ?, ?)
        `).run(row.product_id, row.quantity, repairId, row.stock_before, row.stock_after, timestamp)

        db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
          .run(row.stock_after, timestamp, row.product_id)
      }

      if (effectiveStatus === 'delivered') {
        db.prepare('UPDATE repairs SET delivered_at = ? WHERE id = ?').run(timestamp, repairId)
      }

      const clientPart = data.client_name ? ` - Client: ${data.client_name}` : ''
      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('repair_created', 'repair', ?, ?, ?)
      `).run(repairId, `Réparation #${repairId} créée - ${data.device_model}${clientPart}`, timestamp)

      return { repairId, totalDue, remaining }
    })

    try {
      const result = transaction()
      return { success: true, ...result }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── Repairs: update (fields + parts) ──
  ipcMain.handle('repairs:update', (_event, data: {
    id: number
    client_name?: string
    device_model: string
    labor_cost: number
    amount_paid: number
    parts: Array<{ product_id: number; quantity: number }>
  }) => {
    const db = getDb()
    const timestamp = now()

    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(data.id) as {
      id: number; status: string; labor_cost: number; amount_paid: number; total_due: number
    } | undefined
    if (!repair) return { success: false, error: 'Réparation introuvable' }
    if (repair.status === 'delivered' || repair.status === 'cancelled') {
      return { success: false, error: 'Impossible de modifier une réparation livrée ou annulée' }
    }

    const transaction = db.transaction(() => {
      // Get existing parts
      const existingParts = db.prepare('SELECT * FROM repair_parts WHERE repair_id = ?').all(data.id) as Array<{
        id: number; product_id: number; quantity: number
      }>

      // Diff parts: remove old parts not in new list, add new parts not in old list
      const existingMap = new Map(existingParts.map((p) => [p.product_id, p]))
      const newMap = new Map(data.parts.map((p) => [p.product_id, p]))

      // Remove parts no longer in list (restore stock)
      for (const old of existingParts) {
        if (!newMap.has(old.product_id)) {
          const product = db.prepare('SELECT quantity FROM products WHERE id = ?').get(old.product_id) as { quantity: number } | undefined
          if (product) {
            const stockBefore = product.quantity
            const stockAfter = stockBefore + old.quantity

            db.prepare(`
              INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
              VALUES (?, 'in', ?, 'repair_cancellation', 'repair', ?, ?, ?, ?)
            `).run(old.product_id, old.quantity, data.id, stockBefore, stockAfter, timestamp)

            db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
              .run(stockAfter, timestamp, old.product_id)
          }

          db.prepare('DELETE FROM repair_parts WHERE id = ?').run(old.id)
        }
      }

      // Add new parts or adjust existing part quantities
      for (const newPart of data.parts) {
        const existing = existingMap.get(newPart.product_id)
        const product = db.prepare('SELECT id, name, sale_price, quantity FROM products WHERE id = ? AND is_deleted = 0').get(newPart.product_id) as {
          id: number; name: string; sale_price: number; quantity: number
        } | undefined
        if (!product) throw new Error(`Produit #${newPart.product_id} introuvable`)

        if (!existing) {
          if (newPart.quantity > product.quantity) throw new Error(`Stock insuffisant pour ${product.name}`)

          const stockBefore = product.quantity
          const stockAfter = stockBefore - newPart.quantity

          db.prepare(`
            INSERT INTO repair_parts (repair_id, product_id, unit_price, quantity)
            VALUES (?, ?, ?, ?)
          `).run(data.id, newPart.product_id, product.sale_price, newPart.quantity)

          db.prepare(`
            INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
            VALUES (?, 'out', ?, 'repair_part', 'repair', ?, ?, ?, ?)
          `).run(newPart.product_id, newPart.quantity, data.id, stockBefore, stockAfter, timestamp)

          db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
            .run(stockAfter, timestamp, newPart.product_id)
        } else if (existing.quantity !== newPart.quantity) {
          const delta = newPart.quantity - existing.quantity
          if (delta > 0) {
            if (delta > product.quantity) throw new Error(`Stock insuffisant pour ${product.name}`)
            const stockBefore = product.quantity
            const stockAfter = stockBefore - delta

            db.prepare('UPDATE repair_parts SET quantity = ? WHERE id = ?')
              .run(newPart.quantity, existing.id)

            db.prepare(`
              INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
              VALUES (?, 'out', ?, 'repair_part', 'repair', ?, ?, ?, ?)
            `).run(newPart.product_id, delta, data.id, stockBefore, stockAfter, timestamp)

            db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
              .run(stockAfter, timestamp, newPart.product_id)
          } else {
            const stockBefore = product.quantity
            const stockAfter = stockBefore - delta

            db.prepare('UPDATE repair_parts SET quantity = ? WHERE id = ?')
              .run(newPart.quantity, existing.id)

            db.prepare(`
              INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
              VALUES (?, 'in', ?, 'repair_part', 'repair', ?, ?, ?, ?)
            `).run(newPart.product_id, -delta, data.id, stockBefore, stockAfter, timestamp)

            db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
              .run(stockAfter, timestamp, newPart.product_id)
          }
        }
      }

      // Recalculate totals
      const allParts = db.prepare('SELECT * FROM repair_parts WHERE repair_id = ?').all(data.id) as Array<{
        product_id: number; unit_price: number; quantity: number
      }>
      const totalParts = allParts.reduce((sum, p) => sum + p.unit_price * p.quantity, 0)
      const totalDue = totalParts + data.labor_cost
      const amountPaid = Math.min(data.amount_paid, totalDue)
      const remaining = totalDue - amountPaid

      db.prepare(`
        UPDATE repairs SET client_name = ?, device_model = ?, labor_cost = ?, amount_paid = ?, total_due = ?, remaining = ?, updated_at = ?
        WHERE id = ?
      `).run(data.client_name || null, data.device_model.trim(), data.labor_cost, amountPaid, totalDue, remaining, timestamp, data.id)

      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('repair_updated', 'repair', ?, ?, ?)
      `).run(data.id, `Réparation #${data.id} mise à jour`, timestamp)

      return { totalDue, remaining }
    })

    try {
      const result = transaction()
      return { success: true, ...result }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── Repairs: change status ──
  ipcMain.handle('repairs:changeStatus', (_event, { id, newStatus }: { id: number; newStatus: string }) => {
    const db = getDb()
    const timestamp = now()

    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id) as {
      status: string; remaining: number; delivered_at: string | null
    } | undefined
    if (!repair) return { success: false, error: 'Réparation introuvable' }
    if (repair.status === 'delivered') return { success: false, error: 'La réparation est déjà livrée' }
    if (repair.status === 'cancelled') return { success: false, error: 'La réparation est annulée' }

    if (newStatus === 'delivered' && repair.remaining > 0) {
      return { success: false, error: `Le paiement doit être complet avant la livraison. Reste dû : ${repair.remaining} FCFA.` }
    }

    const oldStatus = repair.status

    db.transaction(() => {
      let extraSql = ''
      const extraParams: unknown[] = []
      if (newStatus === 'delivered') { extraSql = ', delivered_at = ?'; extraParams.push(timestamp) }

      db.prepare(`UPDATE repairs SET status = ?, updated_at = ?${extraSql} WHERE id = ?`)
        .run(newStatus, timestamp, ...extraParams, id)

      const statusLabels: Record<string, string> = {
        pending: 'En attente', in_progress: 'En cours', completed: 'Terminée', delivered: 'Livrée', cancelled: 'Annulée',
      }
      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('repair_status_changed', 'repair', ?, ?, ?)
      `).run(id, `Réparation #${id} : ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}`, timestamp)
    })()

    return { success: true }
  })

  // ── Settings: get user info ──
  ipcMain.handle('settings:getUser', () => {
    const user = getDb().prepare('SELECT id, shop_name, secret_question, backup_folder_path, created_at, updated_at FROM users WHERE id = 1').get() as Record<string, unknown> | undefined
    return user || null
  })

  // ── Settings: update password ──
  ipcMain.handle('settings:updatePassword', (_event, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
    const db = getDb()
    const user = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as { password_hash: string } | undefined
    if (!user) return { success: false, error: 'Aucun utilisateur' }

    if (!verifyPassword(currentPassword, user.password_hash)) return { success: false, error: 'Mot de passe actuel incorrect' }
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

  // ── Categories: create ──
  ipcMain.handle('categories:create', (_event, { name }: { name: string }) => {
    const db = getDb()
    if (!name.trim()) return { success: false, error: 'Le nom est obligatoire' }
    if (name.trim().length > 50) return { success: false, error: 'Max 50 caractères' }
    try {
      db.prepare('INSERT INTO categories (name, is_predefined, created_at) VALUES (?, 0, ?)').run(name.trim(), now())
      return { success: true }
    } catch {
      return { success: false, error: 'Cette catégorie existe déjà' }
    }
  })

  // ── Categories: update ──
  ipcMain.handle('categories:update', (_event, { id, name }: { id: number; name: string }) => {
    const db = getDb()
    if (!name.trim()) return { success: false, error: 'Le nom est obligatoire' }
    try {
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id)
      return { success: true }
    } catch {
      return { success: false, error: 'Ce nom existe déjà' }
    }
  })

  // ── Categories: delete ──
  ipcMain.handle('categories:delete', (_event, { id }: { id: number }) => {
    const db = getDb()
    const cat = db.prepare('SELECT is_predefined FROM categories WHERE id = ?').get(id) as { is_predefined: number } | undefined
    if (!cat) return { success: false, error: 'Catégorie introuvable' }
    if (cat.is_predefined) return { success: false, error: 'Les catégories prédéfinies ne peuvent pas être supprimées' }

    const count = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND is_deleted = 0').get(id) as { c: number }
    if (count.c > 0) return { success: false, error: `Impossible de supprimer : ${count.c} produit(s) utilisent encore cette catégorie.` }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    return { success: true }
  })

  // ── Brands: create ──
  ipcMain.handle('brands:create', (_event, { name }: { name: string }) => {
    const db = getDb()
    if (!name.trim()) return { success: false, error: 'Le nom est obligatoire' }
    if (name.trim().length > 50) return { success: false, error: 'Max 50 caractères' }
    try {
      db.prepare('INSERT INTO brands (name, is_predefined, created_at) VALUES (?, 0, ?)').run(name.trim(), now())
      return { success: true }
    } catch {
      return { success: false, error: 'Cette marque existe déjà' }
    }
  })

  // ── Brands: update ──
  ipcMain.handle('brands:update', (_event, { id, name }: { id: number; name: string }) => {
    const db = getDb()
    if (!name.trim()) return { success: false, error: 'Le nom est obligatoire' }
    try {
      db.prepare('UPDATE brands SET name = ? WHERE id = ?').run(name.trim(), id)
      return { success: true }
    } catch {
      return { success: false, error: 'Ce nom existe déjà' }
    }
  })

  // ── Brands: delete ──
  ipcMain.handle('brands:delete', (_event, { id }: { id: number }) => {
    const db = getDb()
    const brand = db.prepare('SELECT is_predefined FROM brands WHERE id = ?').get(id) as { is_predefined: number } | undefined
    if (!brand) return { success: false, error: 'Marque introuvable' }
    if (brand.is_predefined) return { success: false, error: 'Les marques prédéfinies ne peuvent pas être supprimées' }

    const count = db.prepare('SELECT COUNT(*) AS c FROM products WHERE brand_id = ? AND is_deleted = 0').get(id) as { c: number }
    if (count.c > 0) return { success: false, error: `Impossible de supprimer : ${count.c} produit(s) utilisent encore cette marque.` }

    db.prepare('DELETE FROM brands WHERE id = ?').run(id)
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

  // ── Reports: get aggregated data (optionally scoped to a month YYYY-MM) ──
  ipcMain.handle('reports:getData', (_event, filters: { month?: string } = {}) => {
    const db = getDb()

    const currentMonth = new Date().toISOString().slice(0, 7)
    const targetMonth = typeof filters.month === 'string' && /^\d{4}-\d{2}$/.test(filters.month)
      ? filters.month
      : currentMonth
    const like = targetMonth + '%'

    const totalRevenue = db.prepare(`SELECT COALESCE(SUM(total), 0) AS v FROM sales WHERE status = 'validated'`).get() as { v: number }
    const totalSales = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status = 'validated'`).get() as { c: number }

    const monthRevenue = db.prepare(`SELECT COALESCE(SUM(total), 0) AS v FROM sales WHERE status = 'validated' AND created_at LIKE ?`).get(like) as { v: number }
    const monthSales = db.prepare(`SELECT COUNT(*) AS c FROM sales WHERE status = 'validated' AND created_at LIKE ?`).get(like) as { c: number }

    const paymentBreakdown = db.prepare(`
      SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
      FROM sales WHERE status = 'validated'
      GROUP BY payment_method
    `).all() as Array<{ payment_method: string; count: number; total: number }>

    const monthPaymentBreakdown = db.prepare(`
      SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
      FROM sales WHERE status = 'validated' AND created_at LIKE ?
      GROUP BY payment_method
    `).all(like) as Array<{ payment_method: string; count: number; total: number }>

    const totalRepairRevenue = db.prepare(`SELECT COALESCE(SUM(amount_paid), 0) AS v FROM repairs WHERE status IN ('delivered', 'completed')`).get() as { v: number }
    const monthRepairRevenue = db.prepare(`SELECT COALESCE(SUM(amount_paid), 0) AS v FROM repairs WHERE status IN ('delivered', 'completed') AND created_at LIKE ?`).get(like) as { v: number }
    const repairsByStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM repairs GROUP BY status`).all() as Array<{ status: string; count: number }>

    // Distinct months having sales or repairs activity (for the month selector)
    const availableMonths = db.prepare(`
      SELECT month FROM (
        SELECT substr(created_at, 1, 7) AS month FROM sales WHERE status = 'validated'
        UNION
        SELECT substr(created_at, 1, 7) AS month FROM repairs
      ) GROUP BY month ORDER BY month DESC
    `).all() as Array<{ month: string }>

    const stockValue = db.prepare(`SELECT COALESCE(SUM(quantity * purchase_price), 0) AS v FROM products WHERE is_deleted = 0`).get() as { v: number }
    const lowStock = db.prepare(`SELECT COUNT(*) AS c FROM products WHERE is_deleted = 0 AND quantity <= 2`).get() as { c: number }
    const outOfStock = db.prepare(`SELECT COUNT(*) AS c FROM products WHERE is_deleted = 0 AND quantity = 0`).get() as { c: number }

    const monthlySales = db.prepare(`
      SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
      FROM sales WHERE status = 'validated'
      GROUP BY month ORDER BY month DESC LIMIT 12
    `).all() as Array<{ month: string; count: number; total: number }>

    const topProducts = db.prepare(`
      SELECT p.name, SUM(si.quantity) AS qty, COALESCE(SUM(si.subtotal), 0) AS total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status = 'validated'
      JOIN products p ON p.id = si.product_id
      GROUP BY si.product_id ORDER BY total DESC LIMIT 5
    `).all() as Array<{ name: string; qty: number; total: number }>

    const monthTopProducts = db.prepare(`
      SELECT p.name, SUM(si.quantity) AS qty, COALESCE(SUM(si.subtotal), 0) AS total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status = 'validated' AND s.created_at LIKE ?
      JOIN products p ON p.id = si.product_id
      GROUP BY si.product_id ORDER BY total DESC LIMIT 5
    `).all(like) as Array<{ name: string; qty: number; total: number }>

    const totalProfit = db.prepare(`
      SELECT COALESCE(SUM(profit), 0) AS v FROM (
        SELECT COALESCE(SUM((si.unit_price - p.purchase_price) * si.quantity), 0) AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'validated'
        JOIN products p ON p.id = si.product_id
        UNION ALL
        SELECT COALESCE(SUM((rp.unit_price - p.purchase_price) * rp.quantity), 0) AS profit
        FROM repair_parts rp
        JOIN repairs r ON r.id = rp.repair_id AND r.status NOT IN ('cancelled')
        JOIN products p ON p.id = rp.product_id
      )
    `).get() as { v: number }

    const monthProfit = db.prepare(`
      SELECT COALESCE(SUM(profit), 0) AS v FROM (
        SELECT COALESCE(SUM((si.unit_price - p.purchase_price) * si.quantity), 0) AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'validated' AND s.created_at LIKE ?
        JOIN products p ON p.id = si.product_id
        UNION ALL
        SELECT COALESCE(SUM((rp.unit_price - p.purchase_price) * rp.quantity), 0) AS profit
        FROM repair_parts rp
        JOIN repairs r ON r.id = rp.repair_id AND r.status NOT IN ('cancelled') AND r.created_at LIKE ?
        JOIN products p ON p.id = rp.product_id
      )
    `).get(like, like) as { v: number }

    const profitByProduct = db.prepare(`
      SELECT name, SUM(qty) AS qty, SUM(revenue) AS revenue, SUM(profit) AS profit FROM (
        SELECT p.name,
               SUM(si.quantity) AS qty,
               COALESCE(SUM(si.subtotal), 0) AS revenue,
               COALESCE(SUM((si.unit_price - p.purchase_price) * si.quantity), 0) AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'validated'
        JOIN products p ON p.id = si.product_id
        GROUP BY si.product_id
        UNION ALL
        SELECT p.name,
               SUM(rp.quantity) AS qty,
               COALESCE(SUM(rp.unit_price * rp.quantity), 0) AS revenue,
               COALESCE(SUM((rp.unit_price - p.purchase_price) * rp.quantity), 0) AS profit
        FROM repair_parts rp
        JOIN repairs r ON r.id = rp.repair_id AND r.status NOT IN ('cancelled')
        JOIN products p ON p.id = rp.product_id
        GROUP BY rp.product_id
      ) combined
      GROUP BY name
      ORDER BY profit DESC
      LIMIT 10
    `).all() as Array<{ name: string; qty: number; revenue: number; profit: number }>

    const monthProfitByProduct = db.prepare(`
      SELECT name, SUM(qty) AS qty, SUM(revenue) AS revenue, SUM(profit) AS profit FROM (
        SELECT p.name,
               SUM(si.quantity) AS qty,
               COALESCE(SUM(si.subtotal), 0) AS revenue,
               COALESCE(SUM((si.unit_price - p.purchase_price) * si.quantity), 0) AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'validated' AND s.created_at LIKE ?
        JOIN products p ON p.id = si.product_id
        GROUP BY si.product_id
        UNION ALL
        SELECT p.name,
               SUM(rp.quantity) AS qty,
               COALESCE(SUM(rp.unit_price * rp.quantity), 0) AS revenue,
               COALESCE(SUM((rp.unit_price - p.purchase_price) * rp.quantity), 0) AS profit
        FROM repair_parts rp
        JOIN repairs r ON r.id = rp.repair_id AND r.status NOT IN ('cancelled') AND r.created_at LIKE ?
        JOIN products p ON p.id = rp.product_id
        GROUP BY rp.product_id
      ) combined
      GROUP BY name
      ORDER BY profit DESC
      LIMIT 10
    `).all(like, like) as Array<{ name: string; qty: number; revenue: number; profit: number }>

    return {
      totalRevenue: totalRevenue.v,
      totalSales: totalSales.c,
      monthRevenue: monthRevenue.v,
      monthSales: monthSales.c,
      selectedMonth: targetMonth,
      availableMonths: availableMonths.map((r) => r.month),
      paymentBreakdown,
      monthPaymentBreakdown,
      totalRepairRevenue: totalRepairRevenue.v,
      monthRepairRevenue: monthRepairRevenue.v,
      repairsByStatus,
      stockValue: stockValue.v,
      lowStock: lowStock.c,
      outOfStock: outOfStock.c,
      monthlySales,
      topProducts,
      monthTopProducts,
      totalProfit: totalProfit.v,
      monthProfit: monthProfit.v,
      profitByProduct,
      monthProfitByProduct,
    }
  })

  // ── Repairs: pay remaining ──
  ipcMain.handle('repairs:pay', (_event, { id, amount }: { id: number; amount: number }) => {
    const db = getDb()

    if (typeof amount !== 'number' || amount <= 0) return { success: false, error: 'Montant invalide' }

    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id) as {
      status: string; amount_paid: number; total_due: number; remaining: number
    } | undefined
    if (!repair) return { success: false, error: 'Réparation introuvable' }
    if (repair.status === 'cancelled') return { success: false, error: 'Réparation annulée' }
    if (repair.remaining <= 0) return { success: false, error: 'Solde déjà intégralement payé' }

    const capped = Math.min(amount, repair.remaining)
    const newAmountPaid = repair.amount_paid + capped
    const newRemaining = repair.total_due - newAmountPaid
    const timestamp = now()

    db.prepare('UPDATE repairs SET amount_paid = ?, remaining = ?, updated_at = ? WHERE id = ?')
      .run(newAmountPaid, newRemaining, timestamp, id)

    db.prepare(`
      INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
      VALUES ('repair_status_changed', 'repair', ?, ?, ?)
    `).run(id, `Paiement de ${capped.toLocaleString()} FCFA reçu pour réparation #${id}`, timestamp)

    return { success: true, amountPaid: newAmountPaid, remaining: newRemaining }
  })

  // ── Repairs: cancel ──
  ipcMain.handle('repairs:cancel', (_event, { id }: { id: number }) => {
    const db = getDb()
    const timestamp = now()

    const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id) as { status: string } | undefined
    if (!repair) return { success: false, error: 'Réparation introuvable' }
    if (repair.status === 'delivered') return { success: false, error: 'Impossible d\'annuler une réparation livrée' }
    if (repair.status === 'cancelled') return { success: false, error: 'Cette réparation est déjà annulée' }

    db.transaction(() => {
      db.prepare('UPDATE repairs SET status = \'cancelled\', cancelled_at = ?, updated_at = ? WHERE id = ?')
        .run(timestamp, timestamp, id)

      const parts = db.prepare('SELECT * FROM repair_parts WHERE repair_id = ?').all(id) as Array<{
        product_id: number; quantity: number
      }>

      for (const part of parts) {
        const product = db.prepare('SELECT quantity FROM products WHERE id = ?').get(part.product_id) as { quantity: number } | undefined
        if (!product) continue

        const stockBefore = product.quantity
        const stockAfter = stockBefore + part.quantity

        db.prepare(`
          INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
          VALUES (?, 'in', ?, 'repair_cancellation', 'repair', ?, ?, ?, ?)
        `).run(part.product_id, part.quantity, id, stockBefore, stockAfter, timestamp)

        db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
          .run(stockAfter, timestamp, part.product_id)
      }

      db.prepare(`
        INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
        VALUES ('repair_cancelled', 'repair', ?, ?, ?)
      `).run(id, `Réparation #${id} annulée`, timestamp)
    })()

    return { success: true }
  })

  ipcMain.handle('repairs:delete', (_event, { id }: { id: number }) => {
    try {
      const db = getDb()
      const timestamp = now()

      const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id) as { status: string } | undefined
      if (!repair) return { success: false, error: 'Réparation introuvable' }

      db.transaction(() => {
        if (repair.status !== 'cancelled') {
          const parts = db.prepare('SELECT * FROM repair_parts WHERE repair_id = ?').all(id) as Array<{
            product_id: number; quantity: number
          }>

          for (const part of parts) {
            const product = db.prepare('SELECT quantity FROM products WHERE id = ?').get(part.product_id) as { quantity: number } | undefined
            if (!product) continue

            const stockBefore = product.quantity
            const stockAfter = stockBefore + part.quantity

            db.prepare(`
              INSERT INTO stock_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, stock_before, stock_after, created_at)
              VALUES (?, 'in', ?, 'repair_deletion', 'repair', ?, ?, ?, ?)
            `).run(part.product_id, part.quantity, id, stockBefore, stockAfter, timestamp)

            db.prepare('UPDATE products SET quantity = ?, updated_at = ? WHERE id = ?')
              .run(stockAfter, timestamp, part.product_id)
          }
        }

        db.prepare('DELETE FROM repair_parts WHERE repair_id = ?').run(id)
        db.prepare('DELETE FROM repairs WHERE id = ?').run(id)

        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('repair_deleted', 'repair', ?, ?, ?)
        `).run(id, `Réparation #${id} supprimée`, timestamp)
      })()

      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  // ── Stock: by category ──
  ipcMain.handle('stock:byCategory', () => {
    return getDb().prepare(`
      SELECT
        c.id AS category_id,
        c.name AS category_name,
        COUNT(p.id) AS product_count,
        COALESCE(SUM(p.quantity), 0) AS total_quantity,
        COALESCE(SUM(p.quantity * p.purchase_price), 0) AS total_value
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_deleted = 0
      GROUP BY c.id, c.name
      ORDER BY c.name ASC
    `).all()
  })

  // ── Stock: category detail ──
  ipcMain.handle('stock:categoryDetail', (_event, { categoryId }: { categoryId: number }) => {
    const err = validatePositiveInt(categoryId, 'Catégorie')
    if (err) return { success: false, error: err }

    return getDb().prepare(`
      SELECT p.*, b.name AS brand_name
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      WHERE p.category_id = ? AND p.is_deleted = 0
      ORDER BY p.name ASC
    `).all(categoryId)
  })

  // ── Stock: by brand ──
  ipcMain.handle('stock:byBrand', () => {
    return getDb().prepare(`
      SELECT
        b.id AS brand_id,
        b.name AS brand_name,
        COUNT(p.id) AS product_count,
        COALESCE(SUM(p.quantity), 0) AS total_quantity,
        COALESCE(SUM(p.quantity * p.purchase_price), 0) AS total_value
      FROM brands b
      LEFT JOIN products p ON p.brand_id = b.id AND p.is_deleted = 0
      GROUP BY b.id, b.name
      ORDER BY b.name ASC
    `).all()
  })

  // ── Stock: brand detail ──
  ipcMain.handle('stock:brandDetail', (_event, { brandId }: { brandId: number }) => {
    const err = validatePositiveInt(brandId, 'Marque')
    if (err) return { success: false, error: err }

    return getDb().prepare(`
      SELECT p.*, c.name AS category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.brand_id = ? AND p.is_deleted = 0
      ORDER BY p.name ASC
    `).all(brandId)
  })

  // ── Stock: product profit/loss by category ──
  ipcMain.handle('stock:profitLossByCategory', (_event, { categoryId }: { categoryId: number }) => {
    const err = validatePositiveInt(categoryId, 'Catégorie')
    if (err) return { success: false, error: err }

    const db = getDb()
    const products = db.prepare(`
      SELECT p.id FROM products p
      WHERE p.category_id = ? AND p.is_deleted = 0
    `).all(categoryId) as Array<{ id: number }>

    return products.map(({ id }) => {
      const sales = db.prepare(`
        SELECT
          COALESCE(SUM(si.quantity), 0) AS sold_qty,
          COALESCE(SUM(si.subtotal), 0) AS gross_revenue,
          COALESCE(SUM(si.subtotal * s.discount_amount / NULLIF(s.subtotal, 0)), 0) AS discount,
          COALESCE(SUM(si.subtotal), 0)
            - COALESCE(SUM(si.subtotal * s.discount_amount / NULLIF(s.subtotal, 0)), 0)
            AS revenue,
          COALESCE(SUM((si.unit_price - p.purchase_price) * si.quantity), 0)
            - COALESCE(SUM(si.subtotal * s.discount_amount / NULLIF(s.subtotal, 0)), 0)
            AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'validated'
        JOIN products p ON p.id = si.product_id
        WHERE si.product_id = ?
      `).get(id) as { sold_qty: number; gross_revenue: number; discount: number; revenue: number; profit: number }

      const repairs = db.prepare(`
        SELECT
          COALESCE(SUM(rp.quantity), 0) AS repair_qty,
          COALESCE(SUM(rp.unit_price * rp.quantity), 0) AS repair_revenue,
          COALESCE(SUM((rp.unit_price - p.purchase_price) * rp.quantity), 0) AS repair_profit
        FROM repair_parts rp
        JOIN repairs r ON r.id = rp.repair_id AND r.status != 'cancelled'
        JOIN products p ON p.id = rp.product_id
        WHERE rp.product_id = ?
      `).get(id) as { repair_qty: number; repair_revenue: number; repair_profit: number }

      const labor = db.prepare(`
        SELECT COALESCE(SUM(r.labor_cost), 0) AS labor_revenue
        FROM repairs r
        JOIN repair_parts rp ON rp.repair_id = r.id
        WHERE rp.product_id = ? AND r.status != 'cancelled'
      `).get(id) as { labor_revenue: number }

      const adjustments = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN movement_type = 'out' AND reason = 'manual_adjustment' THEN quantity ELSE 0 END), 0) AS out_qty,
          COALESCE(SUM(CASE WHEN movement_type = 'in' AND reason = 'manual_adjustment' THEN quantity ELSE 0 END), 0) AS in_qty
        FROM stock_movements
        WHERE product_id = ?
      `).get(id) as { out_qty: number; in_qty: number }

      const adjustmentDetails = db.prepare(`
        SELECT movement_type, quantity, justification, created_at
        FROM stock_movements
        WHERE product_id = ? AND reason = 'manual_adjustment'
        ORDER BY created_at DESC
      `).all(id) as Array<{ movement_type: string; quantity: number; justification: string | null; created_at: string }>

      return {
        product_id: id,
        sold_qty: sales.sold_qty,
        gross_revenue: sales.gross_revenue,
        discount: sales.discount,
        revenue: sales.revenue,
        profit: sales.profit,
        repair_qty: repairs.repair_qty,
        repair_revenue: repairs.repair_revenue,
        repair_profit: repairs.repair_profit,
        labor_revenue: labor.labor_revenue,
        adj_out_qty: adjustments.out_qty,
        adj_in_qty: adjustments.in_qty,
        adjustments: adjustmentDetails,
      }
    })
  })

  // ── Stock: product profit/loss by brand ──
  ipcMain.handle('stock:profitLossByBrand', (_event, { brandId }: { brandId: number }) => {
    const err = validatePositiveInt(brandId, 'Marque')
    if (err) return { success: false, error: err }

    const db = getDb()
    const products = db.prepare(`
      SELECT p.id FROM products p
      WHERE p.brand_id = ? AND p.is_deleted = 0
    `).all(brandId) as Array<{ id: number }>

    return products.map(({ id }) => {
      const sales = db.prepare(`
        SELECT
          COALESCE(SUM(si.quantity), 0) AS sold_qty,
          COALESCE(SUM(si.subtotal), 0) AS gross_revenue,
          COALESCE(SUM(si.subtotal * s.discount_amount / NULLIF(s.subtotal, 0)), 0) AS discount,
          COALESCE(SUM(si.subtotal), 0)
            - COALESCE(SUM(si.subtotal * s.discount_amount / NULLIF(s.subtotal, 0)), 0)
            AS revenue,
          COALESCE(SUM((si.unit_price - p.purchase_price) * si.quantity), 0)
            - COALESCE(SUM(si.subtotal * s.discount_amount / NULLIF(s.subtotal, 0)), 0)
            AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'validated'
        JOIN products p ON p.id = si.product_id
        WHERE si.product_id = ?
      `).get(id) as { sold_qty: number; gross_revenue: number; discount: number; revenue: number; profit: number }

      const repairs = db.prepare(`
        SELECT
          COALESCE(SUM(rp.quantity), 0) AS repair_qty,
          COALESCE(SUM(rp.unit_price * rp.quantity), 0) AS repair_revenue,
          COALESCE(SUM((rp.unit_price - p.purchase_price) * rp.quantity), 0) AS repair_profit
        FROM repair_parts rp
        JOIN repairs r ON r.id = rp.repair_id AND r.status != 'cancelled'
        JOIN products p ON p.id = rp.product_id
        WHERE rp.product_id = ?
      `).get(id) as { repair_qty: number; repair_revenue: number; repair_profit: number }

      const labor = db.prepare(`
        SELECT COALESCE(SUM(r.labor_cost), 0) AS labor_revenue
        FROM repairs r
        JOIN repair_parts rp ON rp.repair_id = r.id
        WHERE rp.product_id = ? AND r.status != 'cancelled'
      `).get(id) as { labor_revenue: number }

      const adjustments = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN movement_type = 'out' AND reason = 'manual_adjustment' THEN quantity ELSE 0 END), 0) AS out_qty,
          COALESCE(SUM(CASE WHEN movement_type = 'in' AND reason = 'manual_adjustment' THEN quantity ELSE 0 END), 0) AS in_qty
        FROM stock_movements
        WHERE product_id = ?
      `).get(id) as { out_qty: number; in_qty: number }

      const adjustmentDetails = db.prepare(`
        SELECT movement_type, quantity, justification, created_at
        FROM stock_movements
        WHERE product_id = ? AND reason = 'manual_adjustment'
        ORDER BY created_at DESC
      `).all(id) as Array<{ movement_type: string; quantity: number; justification: string | null; created_at: string }>

      return {
        product_id: id,
        sold_qty: sales.sold_qty,
        gross_revenue: sales.gross_revenue,
        discount: sales.discount,
        revenue: sales.revenue,
        profit: sales.profit,
        repair_qty: repairs.repair_qty,
        repair_revenue: repairs.repair_revenue,
        repair_profit: repairs.repair_profit,
        labor_revenue: labor.labor_revenue,
        adj_out_qty: adjustments.out_qty,
        adj_in_qty: adjustments.in_qty,
        adjustments: adjustmentDetails,
      }
    })
  })

  // ── Global search ──
  ipcMain.handle('global:search', (_event, { query }: { query: string }) => {
    if (!query || !query.trim()) return []
    const q = `%${query.trim()}%`

    const db = getDb()

    const products = db.prepare(`
      SELECT 'product' AS type, p.id, p.name AS title,
        b.name || ' ' || p.model AS subtitle, 'products' AS destination
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      WHERE p.is_deleted = 0
        AND (p.name LIKE ? OR p.model LIKE ? OR b.name LIKE ?)
      LIMIT 20
    `).all(q, q, q)

    const sales = db.prepare(`
      SELECT 'sale' AS type, s.id,
        'Vente #' || s.id AS title,
        COALESCE(s.client_name, 'Anonyme') || ' — ' || s.total || ' FCFA' AS subtitle,
        'sales' AS destination
      FROM sales s
      WHERE s.client_name LIKE ? OR CAST(s.id AS TEXT) LIKE ?
      LIMIT 20
    `).all(q, q)

    const repairs = db.prepare(`
      SELECT 'repair' AS type, r.id,
        'Réparation #' || r.id AS title,
        COALESCE(r.client_name, '—') || ' — ' || r.device_model AS subtitle,
        'repairs' AS destination
      FROM repairs r
      WHERE r.client_name LIKE ? OR r.device_model LIKE ? OR CAST(r.id AS TEXT) LIKE ?
      LIMIT 20
    `).all(q, q, q)

    const history = db.prepare(`
      SELECT 'history' AS type, h.id, h.description AS title,
        h.operation_type AS subtitle, 'history' AS destination
      FROM history_log h
      WHERE h.description LIKE ?
      LIMIT 20
    `).all(q)

    return [...products, ...sales, ...repairs, ...history]
  })
}
