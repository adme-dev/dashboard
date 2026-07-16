export interface SocialNewsSource {
  sourceKey: string
  displayName: string
  endpointUrl: string
  enabled: boolean
  settings: Record<string, unknown>
}

/** Source adapter boundary: callers never need to know where the feed URL lives. */
export function sourceFromRow(row: Record<string, unknown>): SocialNewsSource {
  return {
    sourceKey: String(row.source_key),
    displayName: String(row.display_name),
    endpointUrl: String(row.endpoint_url),
    enabled: Boolean(row.enabled),
    settings: (row.settings && typeof row.settings === 'object' ? row.settings : {}) as Record<string, unknown>,
  }
}

export function isSafeNewsSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0:0:0:0:0:0:0:1') return false
    const parts = host.split('.').map(Number)
    if (parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const [a, b] = parts
      if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false
    }
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) return false
    return true
  } catch { return false }
}

export interface NewsSourceFetchOptions { fetchImpl?: typeof fetch }

/** Adapter for a JSON feed or an MCP JSON-RPC tools/call endpoint. */
export async function fetchMcpNewsSource(source: SocialNewsSource, options: NewsSourceFetchOptions = {}) {
  if (!source.enabled || !isSafeNewsSourceUrl(source.endpointUrl)) return [] as Record<string, unknown>[]
  const fetchImpl = options.fetchImpl ?? fetch
  const toolName = typeof source.settings.toolName === 'string' ? source.settings.toolName : 'list_stories'
  const params = source.settings.params && typeof source.settings.params === 'object' ? source.settings.params : { limit: 120 }
  let response = await fetchImpl(source.endpointUrl, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: toolName, arguments: params } }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok && response.status === 405) response = await fetchImpl(source.endpointUrl, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) return []
  const payload: any = await response.json()
  const result = payload?.result ?? payload
  const content = Array.isArray(result?.content) ? result.content : result
  if (Array.isArray(content)) {
    const text = content.find(x => x?.type === 'text')?.text
    if (typeof text === 'string') { try { return extractNewsArray(JSON.parse(text)) } catch { return [] } }
    return content.filter(x => x && typeof x === 'object' && !('type' in x))
  }
  return extractNewsArray(content)
}

function extractNewsArray(value: any): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(x => x && typeof x === 'object')
  for (const key of ['items', 'news', 'articles', 'stories', 'data']) {
    if (Array.isArray(value?.[key])) return value[key].filter((x: unknown) => x && typeof x === 'object')
  }
  return []
}
