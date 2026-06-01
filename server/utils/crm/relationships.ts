// server/utils/crm/relationships.ts
// Pure helpers for CRM relationships: inverse-type derivation (so one stored row
// surfaces on both ends) and company-hierarchy cycle detection.

// Asymmetric pairs (each direction maps to the other). Everything not listed and
// not symmetric falls back to 'related_to'.
const INVERSES: Record<string, string> = {
  parent: 'child',
  child: 'parent',
  reports_to: 'manages',
  manages: 'reports_to',
  referrer: 'referred_by',
  referred_by: 'referrer',
  parent_of: 'subsidiary_of',
  subsidiary_of: 'parent_of',
  works_at: 'employs',
  employs: 'works_at',
  decision_maker_at: 'has_decision_maker',
  has_decision_maker: 'decision_maker_at',
}

const SYMMETRIC = new Set(['spouse', 'partner', 'sibling', 'colleague', 'related_to'])

export function inverseOf(type: string): string {
  if (SYMMETRIC.has(type)) return type
  return INVERSES[type] ?? 'related_to'
}

// edges: [parentId, childId] pairs from existing parent_of relationships.
// Adding (newParent parent_of newChild) creates a cycle iff newParent is already a
// descendant of newChild (reachable from newChild via parent→child edges), or it's
// a self-edge.
export function wouldCreateCycle(edges: [string, string][], newParent: string, newChild: string): boolean {
  if (newParent === newChild) return true
  const children = new Map<string, string[]>()
  for (const [p, c] of edges) {
    const arr = children.get(p) ?? []
    arr.push(c)
    children.set(p, arr)
  }
  const seen = new Set<string>()
  const stack = [newChild]
  while (stack.length) {
    const node = stack.pop() as string
    if (node === newParent) return true
    if (seen.has(node)) continue
    seen.add(node)
    for (const c of children.get(node) ?? []) stack.push(c)
  }
  return false
}
