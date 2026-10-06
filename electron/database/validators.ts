export const MAX_STR_LEN = 200
export const MIN_PASSWORD_LEN = 6
export const MAX_PRICE = 999999999
export const MAX_QUANTITY = 1000000

export const REPAIR_STATUSES = ['pending', 'in_progress', 'completed', 'delivered', 'cancelled'] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

/** Statuses for which parts are still in the workshop (safe to restock). */
export const REPAIR_STATUSES_WITH_STOCK = ['pending', 'in_progress', 'completed'] as const

export function validateString(val: unknown, name: string, maxLen = MAX_STR_LEN): string | null {
  if (typeof val !== 'string' || !val.trim()) return `${name} est obligatoire`
  if (val.trim().length > maxLen) return `${name} ne doit pas dépasser ${maxLen} caractères`
  return null
}

/** Accepts integers >= 0 (amounts, ids). */
export function validateNonNegativeInt(val: unknown, name: string): string | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) return `${name} doit être un entier ≥ 0`
  if (val > MAX_PRICE) return `${name} ne doit pas dépasser ${MAX_PRICE}`
  return null
}

/** Accepts integers >= 1 (stock quantities). */
export function validateQuantity(val: unknown, name: string): string | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 1) return `${name} doit être un entier ≥ 1`
  if (val > MAX_QUANTITY) return `${name} ne doit pas dépasser ${MAX_QUANTITY}`
  return null
}

export function validateRepairStatus(val: unknown): val is RepairStatus {
  return typeof val === 'string' && (REPAIR_STATUSES as readonly string[]).includes(val)
}

/**
 * Groups digits with a narrow no-break space, independently of the process
 * locale (toLocaleString in the main process would depend on the OS locale).
 */
export function formatAmount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F')
}

/**
 * Merges cart lines that reference the same product, so stock is validated and
 * decremented once per product instead of once per line (which would allow
 * overselling and record wrong stock_before/stock_after pairs).
 */
export function mergeQuantityLines<T extends { product_id: number; quantity: number }>(
  lines: T[]
): Array<{ product_id: number; quantity: number }> {
  const merged = new Map<number, number>()
  for (const line of lines) {
    merged.set(line.product_id, (merged.get(line.product_id) ?? 0) + line.quantity)
  }
  return Array.from(merged, ([product_id, quantity]) => ({ product_id, quantity }))
}
