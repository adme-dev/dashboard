// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableJavaScriptEvaluation":false}}
import { computed, createApp, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '~~/app/types/banner-studio'
import ButtonLayer from '~~/app/components/banner/layers/Button.client.vue'
import TextLayer from '~~/app/components/banner/layers/Text.client.vue'
import { buildBannerHTML } from '~~/app/utils/banner-html-builder'
import { buildBannerHTML as serverBuilder } from '~~/server/utils/banner/htmlBuilder'

afterEach(() => vi.unstubAllGlobals())
describe('multiline editor/export parity', () => {
  it.each([true, false])('preserves explicit lines, spaces, safe text and wrapping with animation=%s', (includeAnimations) => {
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('nextTick', nextTick)
    vi.stubGlobal('useBannerStudio', () => ({ updateLayer: vi.fn() }))
    vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
    const layer = { id: 1, type: 'text', text: 'First  line\n\nSecond <script>alert(1)</script> & final', x: 0, y: 0, w: 200, h: 150, zIndex: 1 } as Layer
    const root = document.createElement('div')
    const editor = createApp(TextLayer, { layer, isActive: true })
    editor.mount(root)
    const editable = root.querySelector('[contenteditable]') as HTMLElement
    const html = buildBannerHTML('fb_sq', [layer], { includeAnimations })
    expect(serverBuilder('fb_sq', [layer], { includeAnimations })).toBe(html)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const exported = doc.querySelector('[data-id="1"]') as HTMLElement
    expect(exported.textContent).toBe(editable.textContent)
    expect(exported.style.whiteSpace).toBe(editable.style.whiteSpace)
    expect(exported.style.wordBreak).toBe(editable.style.wordBreak)
    expect(exported.style.lineHeight).toBe(editable.style.lineHeight)
    expect(exported.querySelector('script')).toBeNull()
    editor.unmount()
  })

  it.each(['text', 'button'] as const)('quotes imported %s font aliases with numeric hash tokens identically in the editor and exported thumbnail', (type) => {
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('nextTick', nextTick)
    vi.stubGlobal('useBannerStudio', () => ({ updateLayer: vi.fn() }))
    vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
    const layer = { id: 1, type, text: 'AFL Grand Final Weekend', fontFamily: 'Kia Signature XF 381ca12903c8', fontWeight: 600, fontSize: 80.3, x: 0, y: 0, w: 1012, h: 200, zIndex: 1 } as Layer
    const root = document.createElement('div')
    const editor = createApp(type === 'text' ? TextLayer : ButtonLayer, { layer, isActive: true })
    editor.mount(root)
    const editable = root.querySelector(type === 'text' ? '[contenteditable]' : 'span') as HTMLElement
    const html = buildBannerHTML('custom_1080x1080', [layer], { includeAnimations: false, customFonts: [{ family: layer.fontFamily!, weight: 600, format: 'woff2', url: 'https://media.example.com/kia.woff2' }] })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const exported = doc.querySelector('[data-id="1"]') as HTMLElement
    expect(editable.style.fontFamily).toBe('"Kia Signature XF 381ca12903c8", sans-serif')
    expect(editable.style.fontFamily).toBe(exported.style.fontFamily)
    expect(editable.style.fontWeight).toBe(exported.style.fontWeight)
    expect(editable.style.fontSize).toBe(exported.style.fontSize)
    editor.unmount()
  })
})

it('keeps imported button borders, line height and case identical in editor and both exports', () => {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
  const layer = { id: 1, type: 'button', text: 'Find out more', fontFamily: 'Arial', fontWeight: 600, fontSize: 32, lineHeight: 1.4, textTransform: 'none', letterSpacing: '0px', borderWidth: 4, borderColor: '#fff', borderRadius: 50, bgColor: '#eb0a1e', x: 0, y: 0, w: 524, h: 79, zIndex: 1 } as Layer
  const root = document.createElement('div')
  const editor = createApp(ButtonLayer, { layer, isActive: true })
  editor.mount(root)
  try {
    const html = buildBannerHTML('mrec', [layer], { includeAnimations: false })
    expect(serverBuilder('mrec', [layer], { includeAnimations: false })).toBe(html)
    const exported = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-id="1"]') as HTMLElement
    const outer = root.firstElementChild as HTMLElement
    const label = root.querySelector('span')!
    expect(exported.style.border).toBe(outer.style.border)
    expect(exported.style.boxSizing).toBe(outer.style.boxSizing)
    expect(exported.style.lineHeight).toBe(label.style.lineHeight)
    expect(exported.style.textTransform).toBe(label.style.textTransform)
  } finally { editor.unmount() }
})

it('keeps safe superscript runs in editor and exports, and ignores stale runs after a plain text edit', () => {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('nextTick', nextTick)
  vi.stubGlobal('useBannerStudio', () => ({ updateLayer: vi.fn() }))
  vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
  const layer = { id: 1, type: 'text', text: '2nd Dec', textRuns: [{ text: '2' }, { text: 'nd', fontSize: 14, top: -5 }, { text: ' Dec' }], x: 0, y: 0, w: 200, h: 40, zIndex: 1 } as Layer
  const root = document.createElement('div')
  const editor = createApp(TextLayer, { layer, isActive: true })
  editor.mount(root)
  try {
    const html = buildBannerHTML('mrec', [layer], { includeAnimations: false })
    expect(serverBuilder('mrec', [layer], { includeAnimations: false })).toBe(html)
    const exported = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-id="1"]') as HTMLElement
    const spans = [...root.querySelectorAll('[contenteditable] span')]
    expect(exported.textContent).toBe('2nd Dec')
    expect([...exported.children].map(el => (el as HTMLElement).style.cssText)).toEqual(spans.map(el => (el as HTMLElement).style.cssText))
    expect(buildBannerHTML('mrec', [{ ...layer, text: 'New date' }], { includeAnimations: false })).not.toContain('top:-5px')
  } finally { editor.unmount() }
})

it('exports a new text layer before any text or runs have been set', () => {
  const layer = { id: 1, type: 'text', x: 0, y: 0, w: 200, h: 40, zIndex: 1 } as Layer
  expect(() => buildBannerHTML('mrec', [layer], { includeAnimations: false })).not.toThrow()
  expect(serverBuilder('mrec', [layer], { includeAnimations: false })).toBe(buildBannerHTML('mrec', [layer], { includeAnimations: false }))
})
