// TerriMind — Stable ID utilities

import { v4 as uuidv4 } from 'uuid'
import type { StableId } from '../types/common'

export function generateId(): StableId {
  return uuidv4()
}

export function generateProjectNumber(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(4, '0')}`
}

export function isValidId(id: unknown): id is StableId {
  if (typeof id !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

export function nowISO(): string {
  return new Date().toISOString()
}
