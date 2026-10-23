// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, ref, Suspense, watch } from 'vue'

const mocks = vi.hoisted(() => ({ create: vi.fn(), approval: vi.fn(), toast: vi.fn(), captionFailed: false, content: 'Approved evergreen trailer', query: {} as Record<string, string>, getPost: vi.fn(), replace: vi.fn(), load: vi.fn() }))
vi.mock('~/composables/useSocialPublishing', () => ({ useSocialPublishing: () => ({
  getPost: mocks.getPost, listAccounts: async () => [], createPost: mocks.create, requestApproval: mocks.approval
}) }))
vi.mock('~/composables/useSocialPublishingClient', () => ({ useSocialPublishingClient: () => ({ clientId: ref('client-1'), clients: ref([{ id: 'client-1', name: 'DriveAgent' }]), selectClient: vi.fn() }) }))
vi.mock('~/composables/useSocialComposer', async () => {
  const real = await vi.importActual<typeof import('../../app/composables/useSocialComposer')>('~/composables/useSocialComposer')
  return { ...real, useSocialComposer: () => {
    const state = ref({ ...real.emptyComposerState(), content: mocks.content, metadata: { source: 'banner_studio', renderJobId: 'render-1', bannerSuggestedSchedule: 'Friday afternoon' }, platforms: ['facebook' as const], accountIds: [], scheduleMode: 'now' as const })
    return { state, reset: vi.fn(), loadFromPost: mocks.load, resolved: vi.fn(), toBody: (clientId: string) => real.composerToBody(state.value, clientId) }
  } }
})
Object.assign(globalThis, {
  computed, ref, watch, onMounted, nextTick,
  definePageMeta: vi.fn(), useRoute: () => ({ query: mocks.query }), useRouter: () => ({ replace: mocks.replace }), useToast: () => ({ add: mocks.toast }),
  $fetch: async () => [{ id: 'client-1', name: 'DriveAgent' }]
})
const Compose = (await import('~~/app/pages/agency/social/publishing/compose.vue')).default
let cleanup = () => {}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.query = {}
  mocks.captionFailed = false
  mocks.content = 'Approved evergreen trailer'
})
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  mocks.create.mockResolvedValue({ id: 'post-1', status: 'draft' })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Compose) }) })
  app.component('SocialPublishingShell', { template: '<main><slot /></main>' })
  app.component('ClientOnly', { template: '<slot />' })
  app.component('SocialPublishingPostComposer', { template: '<div />' })
  app.component('SocialPublishingPlatformPreviewPane', { template: '<div />' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}</div>' })
  app.component('UBadge', { template: '<span><slot /></span>' })
  app.component('UButton', { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' })
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  await flush()
  return (label: string) => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === label)!
}
describe('banner social draft handoff', () => {
  it('shows the suggested schedule as review guidance without setting an exact time', async () => {
    await mount()
    expect(document.body.textContent).toContain('Friday afternoon. Choose the exact date, time and timezone')
  })
  it('selects the saved draft client before hydrating its media and caption', async () => {
    mocks.query = { edit: 'banner-draft' }
    const post = { id: 'banner-draft', client_id: 'client-2', status: 'draft' }
    mocks.getPost.mockResolvedValue(post)
    mocks.replace.mockResolvedValue(undefined)
    await mount()
    expect(mocks.replace).toHaveBeenCalledWith({ query: { edit: 'banner-draft', client: 'client-2' } })
    expect(mocks.load).toHaveBeenCalledWith(post)
    expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(mocks.load.mock.invocationCallOrder[0]!)
  })
  it('saves a client draft with its selected network while no account is connected', async () => {
    const button = await mount()
    button('Save draft').click()
    await flush()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', platforms: ['facebook'], accountIds: null, metadata: { source: 'banner_studio', renderJobId: 'render-1', bannerSuggestedSchedule: 'Friday afternoon' } }))
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Draft saved' }))
  })
  it('still blocks approval submission until publishing accounts are selected', async () => {
    const button = await mount()
    button('Send for approval').click()
    await flush()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.approval).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Select publishing accounts' }))
  })
})
