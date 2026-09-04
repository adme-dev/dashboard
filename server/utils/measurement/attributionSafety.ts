export function safeMeasurementSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const safeUrl = `${url.origin}${url.pathname}`
    return safeUrl.length <= 2048 ? safeUrl : null
  } catch {
    return null
  }
}

export function safeMeasurementUserAgent(value: string | null | undefined): string | null {
  const candidate = value?.trim()
  return candidate ? candidate.slice(0, 1024) : null
}
