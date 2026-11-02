/** Review-only outline of a saved Email Studio document. Never renders or
 * mutates the document; block IDs are the stable comment anchors. Only blocks
 * reachable from the root are "present" — a comment whose block is missing is
 * orphaned and is never reassigned to another block. */

export const REVIEW_BLOCK_ID = /^[A-Za-z0-9_-]{1,128}$/
export const REVIEW_LIMITS = {
  blocks: 2000,
  depth: 32,
  labelChars: 80,
  commentChars: 2000,
  noteChars: 2000
} as const

export interface ReviewBlock {
  id: string
  type: string
  depth: number
  label: string
}

type Block = { type?: unknown, data?: { childrenIds?: unknown, props?: Record<string, unknown> } }

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

function children(block: Block): string[] {
  const data = record(block.data) ? block.data : {}
  if (block.type === 'ColumnsContainer') {
    const columns = record(data.props) ? data.props.columns : undefined
    return Array.isArray(columns) ? columns.flatMap(column => record(column) ? ids(column.childrenIds) : []) : []
  }
  return ids(data.childrenIds)
}

/** Plain bounded excerpt for a reviewer; never HTML. */
export function reviewBlockLabel(block: Block): string {
  const props = record(block.data) && record(block.data.props) ? block.data.props : {}
  const raw = [props.text, props.title, props.alt, props.label, props.url]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? ''
  const text = raw.slice(0, 4000).replace(/<[^>]{0,500}>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > REVIEW_LIMITS.labelChars ? `${text.slice(0, REVIEW_LIMITS.labelChars - 1)}…` : text
}

export function outlineReviewBlocks(source: unknown): ReviewBlock[] {
  if (!record(source) || !record(source.root)) return []
  const document = source as Record<string, Block>
  const out: ReviewBlock[] = []
  const seen = new Set<string>(['root'])
  const stack: Array<{ id: string, depth: number }> = children(document.root!).reverse().map(id => ({ id, depth: 1 }))
  while (stack.length && out.length < REVIEW_LIMITS.blocks) {
    const node = stack.pop()!
    if (seen.has(node.id) || !REVIEW_BLOCK_ID.test(node.id) || node.depth > REVIEW_LIMITS.depth) continue
    const block = Object.hasOwn(document, node.id) ? document[node.id] : undefined
    if (!record(block) || typeof block.type !== 'string') continue
    seen.add(node.id)
    out.push({ id: node.id, type: block.type.slice(0, 64), depth: node.depth, label: reviewBlockLabel(block) })
    for (const child of children(block).reverse()) stack.push({ id: child, depth: node.depth + 1 })
  }
  return out
}
