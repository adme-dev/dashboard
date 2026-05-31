// server/utils/email-marketing/segment.ts
// Subscriber segmentation (email Phase 5). A campaign can carry a Segment — a
// match-all / match-any list of field/op/value rules — that narrows the
// materialized recipient set. Pure + side-effect-free so it's unit-testable and
// safe to evaluate in-app over the candidate set (no JSONB→SQL translation, no
// injection surface).
//
// The operator grammar deliberately mirrors the leads routing filters
// (server/utils/leads/filterEval.ts) so operators see ONE consistent
// field/op/value language across the whole product.

export type SegmentOp
  = | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'
    | 'contains' | 'starts_with' | 'ends_with'
    | 'is_empty' | 'is_not_empty' | 'in' | 'not_in'

export interface SegmentRule {
  field: string
  op: SegmentOp
  value?: unknown
}

export interface Segment {
  match: 'all' | 'any'
  rules: SegmentRule[]
}

export interface SegmentSubscriber {
  email: string
  name: string | null
  status: string
  attribs: Record<string, unknown>
}

const TOP_LEVEL = new Set(['email', 'name', 'status'])

/**
 * Resolve a rule's field against a subscriber. email/name/status read the
 * top-level columns; anything else (or an explicit `attribs.` prefix) is a
 * dotted path into the attribs JSONB bag.
 */
export function resolveSubscriberField(sub: SegmentSubscriber, field: string): unknown {
  if (TOP_LEVEL.has(field)) return (sub as unknown as Record<string, unknown>)[field]
  const path = field.startsWith('attribs.') ? field.slice('attribs.'.length) : field
  let cur: unknown = sub.attribs
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
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
  return typeof v === 'string' ? v : String(v)
}

function numCmp(a: unknown, b: unknown, cmp: (x: number, y: number) => boolean): boolean {
  const x = asNumber(a)
  const y = asNumber(b)
  return x !== null && y !== null && cmp(x, y)
}

function strTest(a: unknown, b: unknown, test: (s: string, n: string) => boolean): boolean {
  const s = asString(a)
  const n = asString(b)
  return s !== null && n !== null && test(s.toLowerCase(), n.toLowerCase())
}

const OPS: Record<SegmentOp, (left: unknown, right: unknown) => boolean> = {
  eq: (a, b) => asString(a) === asString(b),
  neq: (a, b) => asString(a) !== asString(b),
  gt: (a, b) => numCmp(a, b, (x, y) => x > y),
  lt: (a, b) => numCmp(a, b, (x, y) => x < y),
  gte: (a, b) => numCmp(a, b, (x, y) => x >= y),
  lte: (a, b) => numCmp(a, b, (x, y) => x <= y),
  contains: (a, b) => strTest(a, b, (s, n) => s.includes(n)),
  starts_with: (a, b) => strTest(a, b, (s, n) => s.startsWith(n)),
  ends_with: (a, b) => strTest(a, b, (s, n) => s.endsWith(n)),
  is_empty: a => a === undefined || a === null || a === '',
  is_not_empty: a => a !== undefined && a !== null && a !== '',
  in: (a, b) => Array.isArray(b) && b.map(asString).includes(asString(a)),
  not_in: (a, b) => Array.isArray(b) && !b.map(asString).includes(asString(a))
}

function evaluateRule(sub: SegmentSubscriber, rule: SegmentRule): boolean {
  const fn = OPS[rule.op]
  if (!fn) return false // unknown operator (e.g. corrupt stored data) → fail safe
  return fn(resolveSubscriberField(sub, rule.field), rule.value)
}

/**
 * Does the subscriber belong to the segment? A null segment or an empty rule
 * set matches everyone (no narrowing). match=all is AND, match=any is OR.
 */
export function evaluateSegment(sub: SegmentSubscriber, segment: Segment | null): boolean {
  if (!segment || !segment.rules.length) return true
  return segment.match === 'any'
    ? segment.rules.some(r => evaluateRule(sub, r))
    : segment.rules.every(r => evaluateRule(sub, r))
}

/** Runtime guard for the value coming back out of the campaigns.filter_rules JSONB column. */
export function isValidSegment(x: unknown): x is Segment {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (s.match !== 'all' && s.match !== 'any') return false
  if (!Array.isArray(s.rules)) return false
  return s.rules.every(r =>
    !!r && typeof r === 'object'
    && typeof (r as SegmentRule).field === 'string'
    && typeof (r as SegmentRule).op === 'string'
    && (r as SegmentRule).op in OPS
  )
}
