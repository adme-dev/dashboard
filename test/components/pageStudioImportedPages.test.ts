// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense, watch } from 'vue'
import Workspace from '~~/app/components/page-studio/PagesWorkspace.client.vue'

let app: ReturnType<typeof createApp> | undefined
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
it('shows the actual imported routes without Dashboard edit or save controls', async () => {
  const refresh = vi.fn()
  const data = ref({ document: null, imported: { checkpointId: 'imported', routes: ['/kia', '/kia/vehicles'], readOnly: true }, pageLimit: 10, revision: 0, updatedAt: null })
  Object.entries({ computed, ref, watch }).forEach(([key, value]) => vi.stubGlobal(key, value))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('usePageStudioLauncher', () => ({ editorOrigin: ref('https://studio.example.test'), launchPageStudio: vi.fn() }))
  vi.stubGlobal('useDocumentVisibility', () => ref('visible'))
  vi.stubGlobal('useFetch', async () => ({ data, status: ref('success'), error: ref(null), refresh }))
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace, { siteId: 'site' }) }) })
  app.component('UButton', { props: ['label'], emits: ['click'], template: '<button @click="$emit(\'click\')">{{ label }}</button>' })
  app.mount(host)
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
  expect([...host.querySelectorAll('code')].map(el => el.textContent)).toEqual(['/kia', '/kia/vehicles'])
  expect(host.textContent).toContain('read-only')
  expect([...host.querySelectorAll('button')].map(el => el.textContent)).toEqual(['Refresh pages'])
  host.querySelector('button')!.click()
  await nextTick()
  expect(refresh).toHaveBeenCalledOnce()
})
