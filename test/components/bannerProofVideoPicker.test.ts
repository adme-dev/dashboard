// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import ShareModal from '../../app/components/banner/ProjectShareModal.client.vue'
import Picker from '../../app/components/banner/ProofVideoPicker.client.vue'

let cleanup = () => {}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const option = { id: 'job:reels_9x16', formatKey: 'custom_1080x1920', revision: 'revision', title: 'Suzuki', createdAt: '2026-11-22T02:00:00Z', duration: 40.18, previewUrl: '/render' }
async function mountProof(required: boolean, fail = false) {
  for (const [name, value] of Object.entries({ ref, computed, onMounted, watch: (await import('vue')).watch })) vi.stubGlobal(name, value)
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  let ready = false
  const fetch = vi.fn(async (url: string, init?: { method?: string }) => {
    if (url.includes('proof-video')) {
      if (fail) throw new Error('unavailable')
      if (init?.method === 'POST') ready = true
      return { options: required ? [option] : [], required, ready }
    }
    return []
  })
  vi.stubGlobal('$fetch', fetch)
  const app = createApp(ShareModal, { open: true, project: { id: 'banner', name: 'Suzuki' } })
  app.component('BannerProofVideoPicker', Picker)
  app.component('UModal', defineComponent({ setup: (_, { slots }) => () => h('div', slots.body?.()) }))
  app.component('UButton', defineComponent({ props: ['label', 'disabled', 'to'], setup: (p, { attrs, slots }) => () => h('button', { ...attrs, disabled: p.disabled }, p.label || slots.default?.()) }))
  app.component('UFormField', defineComponent({ setup: (_, { slots }) => () => h('label', slots.default?.()) }))
  app.component('USelect', defineComponent({ setup: () => () => h('span', 'Video selection') }))
  app.component('UAlert', defineComponent({ props: ['description'], setup: p => () => h('p', p.description) }))
  app.component('USkeleton', { template: '<div />' })
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  for (let i = 0; i < 12; i++) await nextTick()
  const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!
  return { host, button, fetch }
}
describe('client proof readiness', () => {
  it('keeps normal banner sharing available', async () => {
    const { button, host } = await mountProof(false)
    expect(button('Create client link').disabled).toBe(false)
    expect(host.textContent).not.toContain('Full-length proof video')
  })
  it('requires the full video before creating a link and refreshes after attachment', async () => {
    const { button, host, fetch } = await mountProof(true)
    expect(button('Create client link').disabled).toBe(true)
    expect(button('Review video')).toBeTruthy()
    button('Use rendered video').click()
    for (let i = 0; i < 15; i++) await nextTick()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('proof-video'), expect.objectContaining({ method: 'POST', body: { id: option.id, revision: option.revision } }))
    expect(host.textContent).toContain('ready for client proofs')
    expect(button('Create client link').disabled).toBe(false)
  })
  it('does not create an unchecked proof link after a readiness failure', async () => {
    const { button, host } = await mountProof(false, true)
    expect(button('Create client link').disabled).toBe(true)
    expect(host.textContent).toContain('Could not check the proof video')
  })
})
