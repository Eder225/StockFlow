import { ipcMain } from 'electron'
import { getDb } from '../db'
import { REPAIR_STATUSES_WITH_STOCK, formatAmount, mergeQuantityLines, validateNonNegativeInt, validateQuantity, validateRepairStatus, validateString } from '../validators'
import { applyStockMovement } from '../stockMovement'
import { now } from './common'

export function registerRepairsHandlers() {
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

    let err: string | null
    if ((err = validateString(data.device_model, 'Le modèle de l\'appareil', 150))) return { success: false, error: err }
    if (!validateRepairStatus(data.status)) return { success: false, error: 'Statut invalide' }
    if (data.status === 'cancelled') return { success: false, error: 'Une réparation ne peut pas être créée annulée' }
    if ((err = validateNonNegativeInt(data.labor_cost, 'La main d\'œuvre'))) return { success: false, error: err }
    if ((err = validateNonNegativeInt(data.amount_paid, 'Le montant payé'))) return { success: false, error: err }
    if (data.client_name && (err = validateString(data.client_name, 'Le nom du client', 100))) return { success: false, error: err }
    if (!Array.isArray(data.parts)) return { success: false, error: 'Liste de pièces invalide' }
    for (const p of data.parts) {
      if (typeof p.product_id !== 'number' || !Number.isInteger(p.product_id) || p.product_id < 1) return { success: false, error: 'Produit invalide' }
      if ((err = validateQuantity(p.quantity, 'La quantité'))) return { success: false, error: err }
    }
    // Merge duplicate lines so stock is validated and decremented once per product.
    const parts = mergeQuantityLines(data.parts)
    const partProductIds = parts.map((p) => p.product_id)

    const transaction = db.transaction(() => {
      // Validate parts stock and calculate total
      let totalParts = 0
      const partRows: Array<{ product_id: number; unit_price: number; quantity: number; stock_before: number; stock_after: number }> = []

      if (partProductIds.length > 0) {
        const placeholders = partProductIds.map(() => '?').join(', ')
        const products = db.prepare(`SELECT id, name, sale_price, quantity FROM products WHERE id IN (${placeholders}) AND is_deleted = 0`)
          .all(...partProductIds) as Array<{ id: number; name: string; sale_price: number; quantity: number }>
        const productMap = new Map(products.map((p) => [p.id, p]))

        for (const p of parts) {
          const product = productMap.get(p.product_id)
          if (!product) throw new Error(`Produit #${p.product_id} introuvable`)
          if (p.quantity > product.quantity) throw new Error(`Stock insuffisant pour ${product.name} : ${product.quantity} disponible(s), ${p.quantity} demandé(s)`)
          totalParts += product.sale_price * p.quantity
          partRows.push({ product_id: p.product_id, unit_price: product.sale_price, quantity: p.quantity, stock_before: product.quantity, stock_after: product.quantity - p.quantity })
        }
      }

      const totalDue = totalParts + data.labor_cost
      const amountPaid = Math.min(data.amount_paid, totalDue)
      const remaining = totalDue - amountPaid

      if (data.status === 'delivered' && remaining > 0) throw new Error('Le paiement doit être complet avant la livraison')

      const repairInfo = db.prepare(`
        INSERT INTO repairs (client_name, device_model, status, labor_cost, amount_paid, total_due, remaining, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.client_name || null, data.device_model.trim(), data.status, data.labor_cost, amountPaid, totalDue, remaining, timestamp, timestamp)
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

      if (data.status === 'delivered') {
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
    // 'cancelled' is excluded on purpose: it must go through repairs:cancel,
    // which restocks the parts.
    if (newStatus !== 'pending' && newStatus !== 'in_progress' && newStatus !== 'completed' && newStatus !== 'delivered') {
      return { success: false, error: 'Statut invalide' }
    }

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
    `).run(id, `Paiement de ${formatAmount(capped)} FCFA reçu pour réparation #${id}`, timestamp)

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
          if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(part.product_id)) continue

          applyStockMovement(db, {
            productId: part.product_id,
            movementType: 'in',
            quantity: part.quantity,
            reason: 'repair_cancellation',
            referenceType: 'repair',
            referenceId: id,
            timestamp,
          })
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

      const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id) as {
        status: string; device_model: string; total_due: number; amount_paid: number; client_name: string | null
      } | undefined
      if (!repair) return { success: false, error: 'Réparation introuvable' }

      db.transaction(() => {
        // Parts are restocked only if they are still in the workshop. A delivered
        // repair already gave its parts to the customer; a cancelled one was
        // restocked at cancellation time.
        if ((REPAIR_STATUSES_WITH_STOCK as readonly string[]).includes(repair.status)) {
          const parts = db.prepare('SELECT * FROM repair_parts WHERE repair_id = ?').all(id) as Array<{
            product_id: number; quantity: number
          }>

          for (const part of parts) {
            if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(part.product_id)) continue

            applyStockMovement(db, {
              productId: part.product_id,
              movementType: 'in',
              quantity: part.quantity,
              reason: 'repair_deletion',
              referenceType: 'repair',
              referenceId: id,
              timestamp,
            })
          }
        }

        db.prepare('DELETE FROM repair_parts WHERE repair_id = ?').run(id)
        db.prepare('DELETE FROM repairs WHERE id = ?').run(id)

        db.prepare(`
          INSERT INTO history_log (operation_type, entity_type, entity_id, description, created_at)
          VALUES ('repair_deleted', 'repair', ?, ?, ?)
        `).run(id, `Réparation #${id} supprimée (${repair.device_model}, ${repair.status}, ${formatAmount(repair.amount_paid)}/${formatAmount(repair.total_due)} FCFA payés)`, timestamp)
      })()

      return { success: true }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })
}
