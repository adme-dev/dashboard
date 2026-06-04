// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { sanitizeInlineHtml, extractPlainText } from '~~/app/utils/edmInlineText'

describe('sanitizeInlineHtml', () => {
  it('keeps whitelisted inline formatting tags', () => {
    expect(sanitizeInlineHtml('Hello <b>bold</b> <i>it</i> <strong>s</strong> <em>e</em> <u>u</u>'))
      .toBe('Hello <b>bold</b> <i>it</i> <strong>s</strong> <em>e</em> <u>u</u>')
  })

  it('preserves <br> and span', () => {
    expect(sanitizeInlineHtml('a<br>b<span>c</span>')).toBe('a<br>b<span>c</span>')
  })

  it('strips <script> entirely (tag gone, keeps preceding safe text)', () => {
    const out = sanitizeInlineHtml('safe<script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).toContain('safe')
  })

  it('unwraps disallowed block tags but keeps their text', () => {
    expect(sanitizeInlineHtml('<div onclick="x()">hi <b>there</b></div>')).toBe('hi <b>there</b>')
  })

  it('strips event-handler and style attributes from allowed tags', () => {
    expect(sanitizeInlineHtml('<b onclick="evil()" style="x" class="y">t</b>')).toBe('<b>t</b>')
  })

  it('keeps a safe http/https/mailto href on <a> and adds rel/target', () => {
    const out = sanitizeInlineHtml('<a href="https://x.com" onclick="e()">link</a>')
    expect(out).toContain('href="https://x.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).not.toContain('onclick')
  })

  it('drops an unsafe href (javascript:) but keeps the link text', () => {
    const out = sanitizeInlineHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('x')
    expect(out).not.toContain('href=')
  })

  it('drops an img/onerror payload', () => {
    const out = sanitizeInlineHtml('<img src=x onerror="alert(1)">caption')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('onerror')
    expect(out).toContain('caption')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeInlineHtml('')).toBe('')
  })

  it('normalises non-breaking spaces to regular spaces', () => {
    expect(sanitizeInlineHtml('a b')).toBe('a b')
  })
})

describe('extractPlainText', () => {
  it('collapses whitespace and nbsp, trims', () => {
    expect(extractPlainText('  hello   world  ')).toBe('hello world')
  })
  it('handles empty', () => {
    expect(extractPlainText('')).toBe('')
  })
})
