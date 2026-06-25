import type { BannerFormat } from './renderJob'
import type { RenderLintFinding } from '~~/app/utils/banner-render-runtime'

export type BannerRenderLintParams = {
  fps: number
  quality: number
  crf: number
  maxDimension?: number
  maxDurationSec?: number
}

export function lintBannerRenderFormat(format: BannerFormat, params: BannerRenderLintParams): RenderLintFinding[] {
  const findings: RenderLintFinding[] = []
  const html = format.html ?? ''

  if (!format.key) {
    findings.push(error('missing_format_key', 'Format key is required.'))
  }
  if (!Number.isFinite(format.width) || format.width <= 0 || !Number.isFinite(format.height) || format.height <= 0) {
    findings.push(error('invalid_dimensions', 'Banner dimensions must be positive finite numbers.'))
  }
  const maxDimension = params.maxDimension ?? 2000
  if (format.width > maxDimension || format.height > maxDimension) {
    findings.push(error('format_too_large', `Banner dimensions must be ${maxDimension}px or smaller.`))
  }
  if (!Number.isFinite(params.fps) || params.fps < 12 || params.fps > 60) {
    findings.push(error('invalid_fps', 'FPS must be between 12 and 60.'))
  }
  if (!Number.isFinite(params.crf) || params.crf < 0 || params.crf > 51) {
    findings.push(error('invalid_crf', 'CRF must be between 0 and 51.'))
  }
  if (params.quality !== 1 && params.quality !== 2) {
    findings.push(error('invalid_quality', 'Render quality must be 1x or 2x.'))
  }
  if (!html.trim()) {
    findings.push(error('empty_html', 'Render HTML is empty.'))
    return findings
  }

  const hasRuntime = html.includes('window.__engagrFrame')
  const hasLegacyGsap = html.includes('gsap.timeline') || html.includes('gsap.globalTimeline')
  if (!hasRuntime && !hasLegacyGsap) {
    findings.push(error(
      'missing_runtime_contract',
      'Banner HTML does not expose the render runtime or a recognized GSAP timeline.',
      'Regenerate the banner HTML before exporting MP4.'
    ))
  } else if (!hasRuntime) {
    findings.push({
      code: 'legacy_gsap_fallback',
      severity: 'warning',
      message: 'Banner HTML will render through the legacy GSAP fallback.'
    })
  }

  for (const src of extractMediaSrcs(html)) {
    if (!src.value.trim()) {
      findings.push(error('missing_media_src', `${src.tag} media source is empty.`, 'Choose a valid asset for this layer.'))
      continue
    }
    if (!isSafeMediaUrl(src.value)) {
      findings.push(error('unsafe_media_url', `${src.tag} media source uses an unsupported URL protocol.`, 'Use HTTPS, HTTP, data, blob, or relative asset URLs.'))
    }
  }

  for (const fontUrl of extractCssUrls(html)) {
    if (!isSafeFontUrl(fontUrl)) {
      findings.push(error('unsafe_font_url', 'A font URL uses an unsupported protocol.', 'Use HTTPS or HTTP font URLs.'))
    }
  }

  return findings
}

export function hasRenderLintErrors(findings: RenderLintFinding[]): boolean {
  return findings.some(finding => finding.severity === 'error')
}

function error(code: string, message: string, fixHint?: string): RenderLintFinding {
  return { code, severity: 'error', message, fixHint }
}

function extractMediaSrcs(html: string): Array<{ tag: string, value: string }> {
  const results: Array<{ tag: string, value: string }> = []
  const mediaTag = /<(img|video|audio|source)\b[^>]*\bsrc\s*=\s*(['"])(.*?)\2/gi
  let match: RegExpExecArray | null
  while ((match = mediaTag.exec(html))) {
    results.push({ tag: match[1].toLowerCase(), value: decodeHtmlAttribute(match[3]) })
  }
  return results
}

function extractCssUrls(html: string): string[] {
  const urls: string[] = []
  const cssUrl = /url\(\s*(['"]?)(.*?)\1\s*\)/gi
  let match: RegExpExecArray | null
  while ((match = cssUrl.exec(html))) {
    urls.push(decodeHtmlAttribute(match[2]))
  }
  return urls
}

function isSafeMediaUrl(value: string): boolean {
  if (/^(https?:|data:image\/|data:video\/|data:audio\/|blob:)/i.test(value)) return true
  if (/^[./]/.test(value) || value.startsWith('/')) return true
  return !/^[a-z][a-z0-9+.-]*:/i.test(value)
}

function isSafeFontUrl(value: string): boolean {
  if (/^https?:/i.test(value)) return true
  if (/^[./]/.test(value) || value.startsWith('/')) return true
  return !/^[a-z][a-z0-9+.-]*:/i.test(value)
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
