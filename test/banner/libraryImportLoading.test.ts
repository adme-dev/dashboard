// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import ImportModal from '../../app/components/banner/TheBriefImportModal.client.vue'

let app: Vue.App | undefined
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})

it('loads the import catalog when first mounted open after lazy loading', async () => {
  for (const [key, value] of Object.entries(Vue)) vi.stubGlobal(key, value)
  const fetch = vi.fn().mockResolvedValue([])
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('useAuth', () => ({ canWrite: Vue.ref(true) }))
  vi.stubGlobal('useBannerFonts', () => ({ uploadCustomFont: vi.fn(), refreshCustomFonts: vi.fn() }))
  app = Vue.createApp(ImportModal, { open: true })
  for (const name of ['UModal', 'UAlert', 'UBadge', 'UButton', 'UCalendar', 'UCheckbox', 'UCollapsible', 'UFileUpload', 'UFormField', 'UPopover', 'USelectMenu']) {
    app.component(name, { render: () => null })
  }
  app.mount(document.createElement('div'))
  await Vue.nextTick()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch).toHaveBeenCalledWith('/api/agency/clients')
  expect(fetch).toHaveBeenCalledWith('/api/agency/banner-studio/folders')
})
