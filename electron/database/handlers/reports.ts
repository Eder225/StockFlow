import { ipcMain } from 'electron'
import { getDb } from '../db'
import { validateNonNegativeInt } from '../validators'

export function registerReportsHandlers() {
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
    const err = validateNonNegativeInt(categoryId, 'Catégorie')
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
    const err = validateNonNegativeInt(brandId, 'Marque')
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
    const err = validateNonNegativeInt(categoryId, 'Catégorie')
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
    const err = validateNonNegativeInt(brandId, 'Marque')
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
}
