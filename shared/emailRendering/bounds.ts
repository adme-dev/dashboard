export const MAX_RENDER_REQUEST_BYTES = 8 * 1024 * 1024
export const MAX_RENDER_OUTPUT_BYTES = 16 * 1024 * 1024
const encoder = new TextEncoder()
export class RenderBoundaryError extends Error {
  constructor(public readonly code: 'INVALID_INPUT' | 'LIMIT_EXCEEDED') {
    super(code === 'INVALID_INPUT' ? 'Invalid email rendering input.' : 'Email rendering limit exceeded.')
  }
}
const invalid = (): never => {
  throw new RenderBoundaryError('INVALID_INPUT')
}
const exceeded = (): never => {
  throw new RenderBoundaryError('LIMIT_EXCEEDED')
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Validate before recursive schema parsing/JSON serialization. Repeated references
 * are allowed; only references to an active ancestor constitute a cycle. */
export function snapshotRenderInput<T>(value: T, maxBytes = MAX_RENDER_REQUEST_BYTES): T {
  let bytes = 0
  let nodes = 1
  const active = new Set<object>()
  const stack: Array<{ value: unknown, depth: number, exit?: boolean }> = [{ value, depth: 0 }]
  const charge = (count: number) => {
    bytes += count
    if (bytes > maxBytes) exceeded()
  }
  const stringBytes = (text: string) => {
    if (text.length > maxBytes) exceeded()
    return encoder.encode(JSON.stringify(text)).byteLength
  }
  while (stack.length) {
    const item = stack.pop()!
    if (item.exit) {
      active.delete(item.value as object)
      continue
    }
    if (item.depth > 64) exceeded()
    const current = item.value
    if (current === null) {
      charge(4)
      continue
    }
    if (typeof current === 'string') {
      charge(stringBytes(current))
      continue
    }
    if (typeof current === 'boolean') {
      charge(current ? 4 : 5)
      continue
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) invalid()
      charge(JSON.stringify(current).length)
      continue
    }
    if (typeof current !== 'object') invalid()
    if (active.has(current)) invalid()
    const prototype = Object.getPrototypeOf(current)
    if (Array.isArray(current) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) invalid()
    if (Object.getOwnPropertySymbols(current).length) invalid()
    active.add(current)
    stack.push({ value: current, depth: item.depth, exit: true })
    if (Array.isArray(current) && current.length + nodes > 100_000) exceeded()
    const keys = Object.getOwnPropertyNames(current)
    const childCount = Array.isArray(current) ? current.length : keys.length
    nodes += childCount
    if (nodes > 100_000) exceeded()
    if (Array.isArray(current) && keys.length !== current.length + 1) invalid()
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!
      if (descriptor.get || descriptor.set || (!descriptor.enumerable && !(Array.isArray(current) && key === 'length'))) invalid()
    }
    if (Array.isArray(current)) {
      charge(2 + Math.max(0, current.length - 1))
      for (let i = current.length - 1; i >= 0; i--) {
        if (!Object.hasOwn(current, i)) invalid()
        stack.push({ value: current[i], depth: item.depth + 1 })
      }
    } else {
      charge(2 + Math.max(0, keys.length - 1))
      for (const key of keys) {
        charge(stringBytes(key) + 1)
        stack.push({ value: Object.getOwnPropertyDescriptor(current, key)!.value, depth: item.depth + 1 })
      }
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function createRenderBudget(maxBytes = MAX_RENDER_OUTPUT_BYTES) {
  let remaining = maxBytes
  return { charge(value: string) {
    if (value.length > remaining) exceeded()
    remaining -= encoder.encode(value).byteLength
    if (remaining < 0) exceeded()
  } }
}

/** Traverse the expanded render graph, rather than only unique stored block IDs. */
export function validateDocumentGraph(value: unknown): void {
  if (!record(value) || !Object.hasOwn(value, 'root')) invalid()
  const entries = Object.entries(value)
  if (entries.length > 2048) exceeded()
  const edges = new Map<string, string[]>()
  const children = (input: unknown): string[] => {
    if (input == null) return []
    if (!Array.isArray(input) || input.some(id => typeof id !== 'string')) invalid()
    return input as string[]
  }
  for (const [id, block] of entries) {
    if (!record(block) || typeof block.type !== 'string' || !record(block.data)) invalid()
    const data = block.data
    if (data.props != null && !record(data.props)) invalid()
    if (block.type === 'review-stars') {
      const maximum = (data.props as Record<string, unknown> | undefined)?.maxStars
      if (typeof maximum === 'number' && maximum > 4096) exceeded()
    }
    if (id === 'root' && block.type !== 'EmailLayout') invalid()
    let ids: string[] = []
    if (['EmailLayout', 'Container'].includes(block.type)) ids = children(data.childrenIds)
    if (block.type === 'ColumnsContainer') {
      const columns = (data.props as Record<string, unknown> | undefined)?.columns
      if (columns != null) {
        if (!Array.isArray(columns)) invalid()
        ids = columns.flatMap((column) => {
          if (!record(column)) return invalid()
          return children(column.childrenIds)
        })
      }
    }
    edges.set(id, ids)
  }
  const stack = [{ id: 'root', depth: 1, exit: false }]
  const active = new Set<string>()
  let visits = 0
  while (stack.length) {
    const node = stack.pop()!
    if (node.exit) {
      active.delete(node.id)
      continue
    }
    if (!edges.has(node.id)) continue
    if (active.has(node.id)) invalid()
    if (node.depth > 32 || ++visits > 4096) exceeded()
    active.add(node.id)
    stack.push({ ...node, exit: true })
    for (const id of edges.get(node.id)!) stack.push({ id, depth: node.depth + 1, exit: false })
  }
}
