// @vitest-environment happy-dom
import { computed, createApp, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '~~/app/types/banner-studio'
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
})
