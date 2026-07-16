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
    return url.protocol === 'https:' && Boolean(url.hostname)
  } catch { return false }
}
