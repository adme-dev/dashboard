const EMPTY_URL_VALUES = new Set(['null', 'undefined'])

export function safeUrl(value?: string | null, options: { allowRelative?: boolean, protocols?: string[] } = {}) {
  const url = value?.trim()
  if (!url) return undefined

  const lower = url.toLowerCase()
  if (EMPTY_URL_VALUES.has(lower)) return undefined

  if (options.allowRelative && url.startsWith('/') && !url.startsWith('//')) {
    return url
  }

  try {
    const parsed = new URL(url)
    const protocols = options.protocols ?? ['http:', 'https:']
    return protocols.includes(parsed.protocol) ? url : undefined
  } catch {
    return undefined
  }
}

export function safePublicUrl(value?: string | null) {
  return safeUrl(value, { protocols: ['http:', 'https:'] })
}

export function safeMondayUrl(value?: string | null) {
  const url = safePublicUrl(value)
  if (!url) return undefined

  const parsed = new URL(url)
  const hostname = parsed.hostname.toLowerCase()
  return parsed.protocol === 'https:' && (hostname === 'monday.com' || hostname.endsWith('.monday.com'))
    ? url
    : undefined
}

export function safeMediaUrl(value?: string | null) {
  return safeUrl(value, {
    allowRelative: true,
    protocols: ['http:', 'https:', 'blob:', 'data:']
  })
}
