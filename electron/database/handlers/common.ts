import { getDb } from '../db'

export function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function resolveBrandId(brandId: number): number {
  if (brandId >= 1) return brandId
  const db = getDb()
  const existing = db.prepare('SELECT id FROM brands WHERE name = ? COLLATE NOCASE').get('Autre') as { id: number } | undefined
  if (existing) return existing.id
  const info = db.prepare('INSERT INTO brands (name, is_predefined, created_at) VALUES (?, 0, ?)').run('Autre', now())
  return info.lastInsertRowid as number
}

