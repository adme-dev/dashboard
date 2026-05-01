// Pure filter evaluator for lead routing rules. No I/O, no imports from the
// app layer, no DB. Designed to be hot-pathable inside the rules engine.

import type { Lead, LeadFilter, LeadFilterOp } from '~~/app/types'

/** Read a dotted-path field from a lead. Returns undefined for missing paths. */
export function resolveField(lead: Lead, path: string): unknown {
  const parts = path.split('.')
  let cur: any = lead
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asString(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  return String(v)
}

const OPS: Record<LeadFilterOp, (left: unknown, right: unknown) => boolean> = {
  eq: (a, b) => asString(a) === asString(b),
  neq: (a, b) => asString(a) !== asString(b),
  gt: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x > y
  },
  lt: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x < y
  },
  gte: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x >= y
  },
  lte: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x <= y
  },
  contains: (a, b) => {
    const s = asString(a), n = asString(b)
    return s !== null && n !== null && s.toLowerCase().includes(n.toLowerCase())
  },
  starts_with: (a, b) => {
    const s = asString(a), n = asString(b)
    return s !== null && n !== null && s.toLowerCase().startsWith(n.toLowerCase())
  },
  ends_with: (a, b) => {
    const s = asString(a), n = asString(b)
    return s !== null && n !== null && s.toLowerCase().endsWith(n.toLowerCase())
  },
  is_empty: (a) => a === undefined || a === null || a === '',
  is_not_empty: (a) => a !== undefined && a !== null && a !== '',
  in: (a, b) => Array.isArray(b) && b.map(asString).includes(asString(a)),
  not_in: (a, b) => Array.isArray(b) && !b.map(asString).includes(asString(a)),
}

export function evaluateFilter(lead: Lead, filter: LeadFilter | null): boolean {
  if (!filter) return true
  const fn = OPS[filter.op]
  if (!fn) return false
  return fn(resolveField(lead, filter.field), filter.value)
}
