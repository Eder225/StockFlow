import { ipcMain } from 'electron'
import { getDb } from '../db'
import { validateNonNegativeInt, validateQuantity, validateString } from '../validators'
import { applyStockMovement } from '../stockMovement'
import { now, resolveBrandId } from './common'

export function registerCatalogHandlers() {
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
    if ((err = validateNonNegativeInt(data.purchase_price, 'Le prix d\'achat'))) return { success: false, error: err }
    if ((err = validateNonNegativeInt(data.sale_price, 'Le prix de vente'))) return { success: false, error: err }
    if ((err = validateNonNegativeInt(data.initial_quantity, 'La quantité initiale'))) return { success: false, error: err }
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
        applyStockMovement(db, {
          productId,
          movementType: 'in',
          quantity: data.initial_quantity,
          reason: 'initial_stock',
          timestamp,
        })
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
    if ((err = validateNonNegativeInt(data.purchase_price, 'Le prix d\'achat'))) return { success: false, error: err }
    if ((err = validateNonNegativeInt(data.sale_price, 'Le prix de vente'))) return { success: false, error: err }
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

  // ── Products: adjust stock ──
  ipcMain.handle('products:adjustStock', (_event, data: {
    product_id: number
    movement_type: 'in' | 'out'
    quantity: number
    reason?: string
    justification?: string
  }) => {
    let err: string | null
    if (data.movement_type !== 'in' && data.movement_type !== 'out') return { success: false, error: 'Type de mouvement invalide' }
    if ((err = validateQuantity(data.quantity, 'La quantité'))) return { success: false, error: err }
    if (data.justification != null && typeof data.justification === 'string' && data.justification.length > 500) {
      return { success: false, error: 'La justification ne doit pas dépasser 500 caractères' }
    }

    const db = getDb()
    const timestamp = now()

    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(data.product_id) as { quantity: number; name: string } | undefined
      if (!product) return { success: false, error: 'Produit introuvable' }

      if (data.movement_type === 'out' && data.quantity > product.quantity) {
        return { success: false, error: `Stock insuffisant. Stock actuel : ${product.quantity}.` }
      }

      let stockBefore = 0
      let stockAfter = 0

      db.transaction(() => {
        const movement = applyStockMovement(db, {
          productId: data.product_id,
          movementType: data.movement_type,
          quantity: data.quantity,
          reason: 'manual_adjustment',
          justification: data.justification || null,
          timestamp,
        })
        stockBefore = movement.stockBefore
        stockAfter = movement.stockAfter

        const justifPart = data.justification ? ` [${data.justification}]` : ''
        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('stock_adjusted', 'product', ?, ?, ?)
        `).run(data.product_id, `Stock ajusté pour « ${product.name} » : ${data.movement_type === 'in' ? '+' : '-'}${data.quantity}${justifPart}`, timestamp)
      })()

      return { success: true, stock_before: stockBefore, stock_after: stockAfter }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
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
