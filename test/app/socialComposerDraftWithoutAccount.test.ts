// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, ref, Suspense, watch } from 'vue'

const mocks = vi.hoisted(() => ({ create: vi.fn(), approval: vi.fn(), toast: vi.fn() }))
vi.mock('~/composables/useSocialPublishing', () => ({ useSocialPublishing: () => ({
  listAccounts: async () => [], createPost: mocks.create, requestApproval: mocks.approval
}) }))
vi.mock('~/composables/useSocialPublishingClient', () => ({ useSocialPublishingClient: () => ({ clientId: ref('client-1'), selectClient: vi.fn() }) }))
vi.mock('~/composables/useSocialComposer', async () => {
  const real = await vi.importActual<typeof import('../../app/composables/useSocialComposer')>('~/composables/useSocialComposer')
  return { ...real, useSocialComposer: () => ({
    state: ref({ ...real.emptyComposerState(), content: 'Approved evergreen trailer', platforms: ['facebook'], accountIds: [], scheduleMode: 'now' }),
    reset: vi.fn(), loadFromPost: vi.fn(), resolved: vi.fn(),
    toBody: () => ({ clientId: 'client-1', content: 'Approved evergreen trailer', platforms: ['facebook'], accountIds: [] })
  }) }
})
Object.assign(globalThis, {
  computed, ref, watch, onMounted, nextTick,
  definePageMeta: vi.fn(), useRoute: () => ({ query: {} }), useToast: () => ({ add: mocks.toast }),
  $fetch: async () => [{ id: 'client-1', name: 'DriveAgent' }]
})
const Compose = (await import('~~/app/pages/agency/social/publishing/compose.vue')).default
let cleanup = () => {}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
  app.component('SocialPublishingPostComposer', { template: '<div />' })
  app.component('SocialPublishingPlatformPreviewPane', { template: '<div />' })
  app.component('UButton', { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' })
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  await flush()
  return (label: string) => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === label)!
}
describe('draft preparation before social account onboarding', () => {
  it('saves a client draft with its selected network while no account is connected', async () => {
    const button = await mount()
    button('Save draft').click()
    await flush()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', platforms: ['facebook'], accountIds: [] }))
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
