export interface PageStudioVersionComparison {
  siteId: string
  siteName: string
  version: { id: string, checkpointId: string, digest: string, status: string, summary: string, authorId: string, authorRole: string, createdAt: string, current: boolean }
  live: { releaseId: string, hostname: string, checkpointId: string, digest: string } | null
  releases: Array<{ releaseId: string, hostname: string }>
  before: unknown
  after: unknown
}

export interface PageStudioContentChange {
  path: string
  kind: 'added' | 'removed' | 'changed'
  before?: string
  after?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function identified(values: unknown[]): values is Array<Record<string, unknown> & { id: string }> {
  return values.every(value => record(value) && typeof value.id === 'string')
    && new Set(values.map(value => (value as { id: string }).id)).size === values.length
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/** Pure client-side comparison of already verified immutable checkpoint data. */
export function comparePageStudioContent(before: unknown, after: unknown, limit = 10_000) {
  const changes: PageStudioContentChange[] = []
  let complete = true
  const add = (path: string, a: unknown, b: unknown) => {
    if (changes.length >= limit) {
      complete = false
      return
    }
    changes.push({ path: path || 'Website', kind: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed', before: text(a), after: text(b) })
  }
  const walk = (a: unknown, b: unknown, path: string, depth: number) => {
    if (!complete || a === b) return
    if (depth > 64) {
      complete = false
      return
    }
    if (a === undefined && Array.isArray(b) && b.length && identified(b)) a = []
    if (b === undefined && Array.isArray(a) && a.length && identified(a)) b = []
    const child = (key: string) => path ? `${path} › ${key}` : key
    if (Array.isArray(a) && Array.isArray(b) && identified(a) && identified(b)) {
      const left = new Map(a.map((value, index) => [value.id, { value, index }]))
      const right = new Map(b.map((value, index) => [value.id, { value, index }]))
      for (const id of new Set([...left.keys(), ...right.keys()])) {
        const old = left.get(id), next = right.get(id)
        walk(old?.value, next?.value, child(id), depth + 1)
        if (old && next && old.index !== next.index) add(`${child(id)} › Position`, old.index + 1, next.index + 1)
        if (!complete) break
      }
    } else if (record(a) && record(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        walk(a[key], b[key], child(key), depth + 1)
        if (!complete) break
      }
    } else if (JSON.stringify(a) !== JSON.stringify(b)) add(path, a, b)
  }
  walk(before ?? {}, after ?? {}, '', 0)
  return { changes, complete }
}
