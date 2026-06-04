// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { sanitizeInlineHtml, extractPlainText, safeInlineHref } from '~~/app/utils/edmInlineText'

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

  it('drops SVG/MATH foreign-content subtrees wholesale (incl. nested svg <a>/script)', () => {
    // NB: exact placement of text around foreign content is parser-dependent
    // (happy-dom vs real browsers differ) — we assert SAFETY, not text layout.
    const svg = sanitizeInlineHtml('before<svg><a href="javascript:alert(1)">x</a><script>y</script></svg>')
    expect(svg).not.toContain('javascript')
    expect(svg).not.toContain('<a')
    expect(svg).not.toContain('<svg')
    expect(svg).not.toContain('<script')
    expect(svg).toContain('before')
    expect(sanitizeInlineHtml('<math><mi>x</mi></math>')).not.toContain('<math')
  })

  it('drops style/template/noscript/textarea content entirely (no text leak)', () => {
    expect(sanitizeInlineHtml('a<style>.x{color:red}</style>b')).toBe('ab')
    expect(sanitizeInlineHtml('a<template><b>hidden</b></template>b')).toBe('ab')
    expect(sanitizeInlineHtml('a<noscript>ns</noscript>b')).toBe('ab')
    expect(sanitizeInlineHtml('a<textarea><b>t</b></textarea>b')).toBe('ab')
  })

  it('rejects hrefs containing backticks or whitespace', () => {
    expect(sanitizeInlineHtml('<a href="https://x.com/`onmouseover=alert(1)`">x</a>')).not.toContain('href=')
    expect(sanitizeInlineHtml('<a href="https://x.com/ a">x</a>')).not.toContain('href=')
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

describe('safeInlineHref', () => {
  it('normalises safe http, https, and mailto links for toolbar insertion', () => {
    expect(safeInlineHref(' https://x.com/a ')).toBe('https://x.com/a')
    expect(safeInlineHref('mailto:team@example.com')).toBe('mailto:team@example.com')
  })

  it('rejects unsafe links before creating a contenteditable anchor', () => {
    expect(safeInlineHref('javascript:alert(1)')).toBe('')
    expect(safeInlineHref('https://x.com/`onmouseover=alert(1)`')).toBe('')
    expect(safeInlineHref('https://x.com/ a')).toBe('')
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
