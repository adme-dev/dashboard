// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import Workspace from '~~/app/pages/studio/sites/[siteId]/index.vue'

let app: ReturnType<typeof createApp> | undefined
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
it('shows imported saved page count and routes without offering an unsupported editor', async () => {
  const launch = vi.fn()
  const data = ref({ canEdit: true, assets: [], document: {
    id: 'site', site: { id: 'site', clientId: 'client', name: 'Kia', route: 'kia' },
    document: null, imported: { checkpointId: 'saved', routes: ['/kia', '/kia/vehicles'], readOnly: true },
    pageLimit: 10, revision: 0, updatedAt: null
  } })
  Object.entries({ computed, ref }).forEach(([key, value]) => vi.stubGlobal(key, value))
  vi.stubGlobal('definePageMeta', () => {})
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('useRoute', () => ({ params: { siteId: 'site' } }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('usePageStudioLauncher', () => ({ editorOrigin: ref('https://studio.example.test'), launchPageStudio: launch }))
  vi.stubGlobal('useFetch', async () => ({ data, pending: ref(false), error: ref(null), refresh: vi.fn() }))
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Suspense, null, { default: () => h(Workspace) }) })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' })
  for (const name of ['UBadge', 'USkeleton', 'PageStudioStagingWorkspace', 'PageStudioCustomerMediaBrowser', 'PageStudioCustomerFormsWorkspace', 'PageStudioCustomerLaunchStatus', 'PageStudioDomainsWorkspace', 'PageStudioFormSubmissionsWorkspace']) app.component(name, { render: () => null })
  app.component('PageStudioCustomerPageBrowser', { props: ['pages', 'canEdit'], template: '<div><code v-for="page in pages" :key="page.id">{{ page.route }}</code><button v-if="canEdit">Edit page</button></div>' })
  app.mount(host)
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
  expect(host.textContent).toContain('Editing this imported website is not available')
  const buttons = () => [...host.querySelectorAll('button')]
  const open = buttons().find(button => button.textContent === 'Open Page Studio')!
  expect(open.disabled).toBe(true)
  const saved = buttons().find(button => button.textContent === 'Saved pages')!
  expect(saved.parentElement?.textContent?.trim()).toMatch(/^2\s*Saved pages$/)
  saved.click()
  await nextTick()
  expect([...host.querySelectorAll('code')].map(element => element.textContent)).toEqual(['/kia', '/kia/vehicles'])
  expect(host.textContent).not.toContain('Edit page')
  open.click()
  expect(launch).not.toHaveBeenCalled()
})
