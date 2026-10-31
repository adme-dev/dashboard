// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import Preview from '../../app/components/banner/BrandKitPreview.vue'

it('labels unavailable detected fonts and never asks Google to load their names', () => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  const loadUsedFonts = vi.fn()
  vi.stubGlobal('useBannerFonts', () => ({ loadUsedFonts, getCustomFont: () => undefined, getFont: () => undefined }))
  const host = document.createElement('div')
  const app = Vue.createApp(Preview, { kit: { name: 'Detected', colors: [], logos: [], fonts: [{ role: 'heading', family: 'Private Website Font', weights: [400] }] } })
  try {
    app.mount(host)
    expect(host.textContent).toContain('Font preview pending upload')
    expect(loadUsedFonts).toHaveBeenCalledWith([])
  } finally {
    app.unmount()
    vi.unstubAllGlobals()
  }
})
