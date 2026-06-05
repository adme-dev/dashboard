import { describe, expect, it } from 'vitest'
import {
  checkEmailSendability,
  htmlToPlainText
} from '~~/server/utils/email-marketing/sendability'

describe('checkEmailSendability', () => {
  const validHtml = '<!doctype html><html><body><p>Hello</p><a href="{{ unsubscribe_url }}">Unsubscribe</a></body></html>'

  it('passes clean sendable HTML with subject, preheader, and unsubscribe affordance', () => {
    const report = checkEmailSendability({
      html: validHtml,
      subject: 'Weekly update',
      previewText: 'What changed this week',
      requireUnsubscribe: true
    })

    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.htmlBytes).toBe(Buffer.byteLength(validHtml, 'utf8'))
  })

  it('blocks renderer placeholders and unsafe interactive tags', () => {
    const report = checkEmailSendability({
      html: '<p>[EmailLayout] — available in upcoming update</p><script>alert(1)</script>',
      subject: 'Test',
      previewText: 'Preview'
    })

    expect(report.ok).toBe(false)
    expect(report.errors.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['renderer_placeholder', 'unsafe_tag'])
    )
  })

  it('warns on missing preview text, relative media URLs, and large HTML', () => {
    const report = checkEmailSendability({
      html: `<img src="/email/postcards/glidex/car.png">${'x'.repeat(110 * 1024)}`,
      subject: 'Test',
      maxHtmlBytes: 1024
    })

    expect(report.ok).toBe(true)
    expect(report.warnings.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['missing_preview_text', 'relative_media_url', 'html_size'])
    )
  })

  it('requires an unsubscribe affordance only when requested', () => {
    const report = checkEmailSendability({
      html: '<p>Hello</p>',
      subject: 'Test',
      previewText: 'Preview',
      requireUnsubscribe: true
    })

    expect(report.ok).toBe(false)
    expect(report.errors.map(issue => issue.code)).toContain('missing_unsubscribe')
  })

  it('blocks a missing subject', () => {
    const report = checkEmailSendability({
      html: validHtml,
      previewText: 'Preview'
    })

    expect(report.ok).toBe(false)
    expect(report.errors.map(issue => issue.code)).toContain('missing_subject')
  })
})

describe('htmlToPlainText', () => {
  it('turns basic email HTML into a compact text fallback', () => {
    expect(htmlToPlainText('<h1>Hello</h1><p>View&nbsp;offer<br>today.</p>'))
      .toBe('Hello\n\nView offer\ntoday.')
  })
})
