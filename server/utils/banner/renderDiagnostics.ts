export type BannerRenderFailureCategory
  = 'invalid_composition'
    | 'unreachable_media'
    | 'runtime_not_ready'
    | 'seek_failed'
    | 'browser_transient'
    | 'browser_crash'
    | 'ffmpeg_failed'
    | 'container_timeout'
    | 'unknown'

export function sanitizeDiagnosticUrl(value: string): string {
  if (!value) return value
  if (/^(data|blob):/i.test(value)) return `${value.split(':', 1)[0]}:[redacted]`
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return value.replace(/([?][^\s#]*)/g, '?[redacted]').replace(/(#[^\s]*)/g, '#[redacted]')
  }
}

export function classifyBannerRenderError(message: string): BannerRenderFailureCategory {
  const m = message.toLowerCase()
  if (m.includes('invalid composition') || m.includes('missing_runtime_contract')) return 'invalid_composition'
  if (m.includes('failed request') || m.includes('unreachable') || m.includes('net::err')) return 'unreachable_media'
  if (m.includes('runtime_not_ready') || m.includes('runtime not ready')) return 'runtime_not_ready'
  if (m.includes('seek_failed') || m.includes('seek failed')) return 'seek_failed'
  if (m.includes('target closed') || m.includes('browser has disconnected') || m.includes('browser crash')) return 'browser_crash'
  if (m.includes('timeout') || m.includes('timed out')) return 'container_timeout'
  if (m.includes('ffmpeg')) return 'ffmpeg_failed'
  if (m.includes('protocol error') || m.includes('navigation failed')) return 'browser_transient'
  return 'unknown'
}
