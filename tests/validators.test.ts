import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  mergeQuantityLines,
  validateNonNegativeInt,
  validateQuantity,
  validateRepairStatus,
  validateString,
} from '../electron/database/validators'

describe('mergeQuantityLines', () => {
  it('merges the same product and keeps the order of first appearance', () => {
    expect(
      mergeQuantityLines([
        { product_id: 3, quantity: 2 },
        { product_id: 1, quantity: 5 },
        { product_id: 3, quantity: 4 },
      ])
    ).toEqual([
      { product_id: 3, quantity: 6 },
      { product_id: 1, quantity: 5 },
    ])
  })

  it('returns an empty list unchanged', () => {
    expect(mergeQuantityLines([])).toEqual([])
  })
})

describe('validateQuantity', () => {
  it('accepts whole numbers >= 1', () => {
    expect(validateQuantity(1, 'La quantité')).toBeNull()
    expect(validateQuantity(50, 'La quantité')).toBeNull()
  })

  it.each([0, -3, 1.5, NaN, '3' as unknown as number])('rejects %s', (value) => {
    expect(validateQuantity(value, 'La quantité')).toBeTruthy()
  })
})

describe('validateNonNegativeInt', () => {
  it('accepts 0 and positive whole numbers', () => {
    expect(validateNonNegativeInt(0, 'Le prix')).toBeNull()
    expect(validateNonNegativeInt(1200, 'Le prix')).toBeNull()
  })

  it.each([-1, 10.5, NaN])('rejects %s', (value) => {
    expect(validateNonNegativeInt(value, 'Le prix')).toBeTruthy()
  })
})

describe('validateString', () => {
  it('rejects empty and oversized strings', () => {
    expect(validateString('', 'Le nom')).toBeTruthy()
    expect(validateString('   ', 'Le nom')).toBeTruthy()
    expect(validateString('a'.repeat(11), 'Le nom', 10)).toBeTruthy()
    expect(validateString('ok', 'Le nom', 10)).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(validateString(42 as unknown as string, 'Le nom')).toBeTruthy()
    expect(validateString(null as unknown as string, 'Le nom')).toBeTruthy()
  })
})

describe('validateRepairStatus', () => {
  it.each(['pending', 'in_progress', 'completed', 'delivered', 'cancelled'])('accepts %s', (s) => {
    expect(validateRepairStatus(s)).toBe(true)
  })

  it.each(['', 'DONE', 'pending ', 'unknown'])('rejects %s', (s) => {
    expect(validateRepairStatus(s)).toBe(false)
  })
})

describe('formatAmount', () => {
  it('groups thousands independently of the locale', () => {
    expect(formatAmount(1250000)).toBe('1\u202F250\u202F000')
    expect(formatAmount(999)).toBe('999')
    expect(formatAmount(0)).toBe('0')
  })
})
