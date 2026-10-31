// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h } from 'vue'
import Rect from '../../app/components/banner/layers/Rect.client.vue'

afterEach(() => vi.unstubAllGlobals())

describe('Banner Studio rectangle shape', () => {
  it('draws an ellipse with its blur in the editor and ignores the corner radius', () => {
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(Rect, { isActive: false, layer: { id: 1, type: 'rect', fillColor: '#141414', opacity: 1, borderRadius: 4, rectShape: 'ellipse', visualFilter: 'blur(8px)' } }) })
    try {
      app.mount(host)
      const element = host.firstElementChild as HTMLElement
      expect(element.style.borderRadius).toBe('50%')
      expect(element.style.filter).toBe('blur(8px)')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
