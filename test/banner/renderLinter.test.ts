import { describe, expect, it } from 'vitest'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { classifyBannerRenderError, sanitizeDiagnosticUrl } from '~~/server/utils/banner/renderDiagnostics'
import { hasRenderLintErrors, lintBannerRenderFormat } from '~~/server/utils/banner/renderLinter'

const params = { fps: 30, quality: 1, crf: 23 }

describe('lintBannerRenderFormat', () => {
  it('accepts generated HTML with the render runtime contract', () => {
    const findings = lintBannerRenderFormat({
      key: 'story',
      width: 1080,
      height: 1920,
      html: '<script>window.__engagrFrame={ready:true}</script><img src="https://cdn.example.com/a.png">',
    }, params)
    expect(hasRenderLintErrors(findings)).toBe(false)
  })

  it('accepts real generated Banner Studio HTML', () => {
    const html = buildBannerHTML('fb_story', [
      { id: 'text-1', type: 'text', text: 'Hello', x: 10, y: 10, w: 200, h: 50, opacity: 1, zIndex: 1, startTime: 0, endTime: 3 }
    ] as any)

    const findings = lintBannerRenderFormat({ key: 'fb_story', width: 1080, height: 1920, html }, params)

    expect(findings.filter(finding => finding.severity === 'error')).toEqual([])
  })

  it('blocks HTML without runtime or legacy GSAP timeline', () => {
    const findings = lintBannerRenderFormat({ key: 'story', width: 1080, height: 1920, html: '<div>static</div>' }, params)
    expect(findings).toContainEqual(expect.objectContaining({ code: 'missing_runtime_contract', severity: 'error' }))
  })

  it('warns for legacy GSAP fallback and blocks unsafe media', () => {
    const findings = lintBannerRenderFormat({
      key: 'story',
      width: 1080,
      height: 1920,
      html: '<script>const tl = gsap.timeline()</script><img src="javascript:alert(1)">',
    }, params)
    expect(findings).toContainEqual(expect.objectContaining({ code: 'legacy_gsap_fallback', severity: 'warning' }))
    expect(findings).toContainEqual(expect.objectContaining({ code: 'unsafe_media_url', severity: 'error' }))
  })
})

describe('render diagnostics helpers', () => {
  it('sanitizes sensitive URL parts', () => {
    expect(sanitizeDiagnosticUrl('https://user:pass@example.com/a.png?token=secret#frag')).toBe('https://example.com/a.png')
    expect(sanitizeDiagnosticUrl('data:image/png;base64,abcd')).toBe('data:[redacted]')
  })

  it('classifies common render failures', () => {
    expect(classifyBannerRenderError('runtime_not_ready after 2000ms')).toBe('runtime_not_ready')
    expect(classifyBannerRenderError('seek_failed: bad time')).toBe('seek_failed')
    expect(classifyBannerRenderError('ffmpeg exit 1')).toBe('ffmpeg_failed')
  })
})
