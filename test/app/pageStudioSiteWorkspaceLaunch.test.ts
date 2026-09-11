// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import SiteWorkspace from '~~/app/components/page-studio/SiteWorkspace.vue'
import type { PageStudioSiteSummary } from '~/types'

const launch = vi.fn()
const notify = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { pageStudioEditorUrl: 'https://studio.example.test' } }))
  vi.stubGlobal('useToast', () => ({ add: notify }))
  vi.stubGlobal('usePageStudioLauncher', () => ({ launchPageStudio: launch }))
})

afterEach(() => vi.unstubAllGlobals())

function mountWorkspace() {
  const host = document.createElement('div')
  const app = createApp(SiteWorkspace, {
    audience: 'portal', total: 1, page: 1, pageSize: 10,
    sites: [{ id: 'site-1', name: 'Test website', route: '/', status: 'draft', updatedAt: '2026-09-11', starterVersion: 'limousine-v1' }] as PageStudioSiteSummary[]
  })
  const slot = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
  for (const name of ['UCard', 'UBadge', 'UAlert']) app.component(name, slot)
  for (const name of ['UIcon', 'USkeleton', 'UPagination', 'UModal', 'UFormField', 'UInput', 'USelect', 'USelectMenu', 'UTextarea', 'PageStudioAgencySiteCreate']) {
    app.component(name, defineComponent({ setup: () => () => null }))
  }
  app.component('UButton', defineComponent({
    props: ['label', 'loading', 'disabled'],
    setup: (props, { attrs }) => () => h('button', { ...attrs, disabled: props.loading || props.disabled }, props.label)
  }))
  app.mount(host)
  const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Launch Studio')!
  return { app, button }
}

describe('Page Studio launch availability', () => {
  it.each(['success', 'failure'] as const)('allows another launch after %s', async (outcome) => {
    let resolveLaunch!: () => void
    let rejectLaunch!: (error: Error) => void
    launch.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
      resolveLaunch = resolve
      rejectLaunch = reject
    })).mockResolvedValue(undefined)
    const { app, button } = mountWorkspace()
    try {
      button.click()
      await nextTick()
      expect(button.disabled).toBe(true)
      button.click()
      expect(launch).toHaveBeenCalledTimes(1)
      if (outcome === 'success') resolveLaunch()
      else rejectLaunch(new Error('Popup blocked'))
      await Promise.resolve()
      await nextTick()
      expect(button.disabled).toBe(false)
      expect(notify).toHaveBeenCalledTimes(outcome === 'failure' ? 1 : 0)
      button.click()
      await Promise.resolve()
      await nextTick()
      expect(launch).toHaveBeenCalledTimes(2)
    } finally {
      app.unmount()
    }
  })
})
