// Source metadata is descriptive content, never an approval or access grant.
// Only known fields cross import/export/copy boundaries; portal credentials and
// query material are never carried into a client document.
export function redactTemplateProvenance<T>(input: T): T {
  if (!input || typeof input !== 'object') return input
  const document = structuredClone(input) as T & { root?: { data?: { props?: Record<string, unknown> } } }
  const props = document.root?.data?.props
  const source = props?.sourceProvenance
  if (!props) return document
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    delete props.sourceProvenance
    return document
  }
  const raw = source as Record<string, unknown>
  const clean: Record<string, string> = {}
  for (const key of ['provider', 'make', 'assetId', 'retrievedAt', 'originalSha256', 'notes', 'importForm']) {
    if (typeof raw[key] === 'string') clean[key] = raw[key].slice(0, key === 'notes' ? 2000 : 200)
  }
  try {
    const url = new URL(typeof raw.sourceUrl === 'string' ? raw.sourceUrl : '')
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && /^[a-z0-9-]+\.sesimi\.app$/.test(url.hostname) && url.pathname.startsWith('/assets/')) {
      url.search = ''
      url.hash = ''
      clean.sourceUrl = url.toString()
    }
  } catch { /* Unknown or credential-bearing links are omitted. */ }
  props.sourceProvenance = clean
  return document
}
