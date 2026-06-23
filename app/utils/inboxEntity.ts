// Maps a notification's `link` (a UI route) to the underlying item it points at,
// so the inbox can fetch + render that item inline instead of navigating away.
// Only the types we have a dedicated preview for resolve; everything else returns
// null and the inbox falls back to the plain message + metadata view.

export type InboxEntityKind = 'task' | 'brief'

export interface InboxEntity {
  kind: InboxEntityKind
  id: string
  /** server route to fetch the full item */
  apiPath: string
  /** human label, e.g. "Task" */
  label: string
}

const ROUTES: Array<{ re: RegExp, kind: InboxEntityKind, api: (id: string) => string, label: string }> = [
  { re: /^\/agency\/tasks\/([^/?#]+)/i, kind: 'task', api: id => `/api/agency/tasks/${id}`, label: 'Task' },
  { re: /^\/agency\/briefs\/([^/?#]+)/i, kind: 'brief', api: id => `/api/agency/briefs/${id}`, label: 'Brief' }
]

export function parseInboxEntity(link: string | null | undefined): InboxEntity | null {
  if (!link || typeof link !== 'string') return null
  const path = link.split(/[?#]/)[0] // drop query/hash
  for (const r of ROUTES) {
    const m = path.match(r.re)
    if (m && m[1]) return { kind: r.kind, id: m[1], apiPath: r.api(m[1]), label: r.label }
  }
  return null
}
