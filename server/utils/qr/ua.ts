export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown'
export interface QrUaInfo { deviceType: DeviceType, os: string, browser: string }

export function classifyQrUserAgent(ua: string | null | undefined): QrUaInfo {
  if (!ua) return { deviceType: 'unknown', os: 'Other', browser: 'Other' }
  const s = ua
  if (/bot|crawler|spider|slurp|facebookexternalhit|preview/i.test(s)) return { deviceType: 'bot', os: 'Other', browser: 'Other' }

  const os =
    /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Android/.test(s) ? 'Android'
    : /Windows/.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/.test(s) ? 'macOS'
    : /CrOS/.test(s) ? 'ChromeOS'
    : /Linux/.test(s) ? 'Linux'
    : 'Other'

  const browser =
    /Edg\//.test(s) ? 'Edge'
    : /OPR\/|Opera/.test(s) ? 'Opera'
    : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : 'Other'

  const deviceType: DeviceType =
    /iPad|Tablet|(?=.*Android)(?!.*Mobile)/.test(s) ? 'tablet'
    : /Mobi|iPhone|iPod|Android/.test(s) ? 'mobile'
    : 'desktop'

  return { deviceType, os, browser }
}
