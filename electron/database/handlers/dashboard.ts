import { ipcMain } from 'electron'
import { getDb } from '../db'
import { now } from './common'

export function registerDashboardHandlers() {
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
}
