// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref } from 'vue'
import Rect from '../../app/components/banner/layers/Rect.client.vue'

afterEach(() => vi.unstubAllGlobals())

describe('Banner Studio rectangle fills', () => {
  it('renders imported gradients and updates feed overrides without losing solid colours', async () => {
    const override = ref<string>()
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => override.value }))
    const gradient = 'linear-gradient(0deg, rgba(1,43,94,0) 0%, #012c5f 100%)'
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(Rect, { isActive: false, layer: { id: 1, type: 'rect', fillColor: gradient, opacity: 1, borderRadius: 4 } }) })
    try {
      app.mount(host)
      const element = host.firstElementChild as HTMLElement
      expect(element.style.background).toContain('linear-gradient')
      override.value = '#ff0000'
      await nextTick()
      expect(element.style.background).toMatch(/#ff0000|rgb\(255, 0, 0\)/)
      expect(element.style.background).not.toContain('gradient')
      override.value = undefined
      await nextTick()
      expect(element.style.background).toContain('linear-gradient')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
