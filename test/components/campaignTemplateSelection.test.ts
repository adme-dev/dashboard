// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import Modal from '../../app/components/email/CampaignTemplateCreateModal.vue'
import { useEdmCampaignTemplateSelection } from '../../app/composables/useEdmCampaignTemplateSelection'

const id = '10000000-0000-4000-8000-000000000001'
const revision = '20000000-0000-4000-8000-000000000001'
const fetch = vi.fn()
let unmount: (() => void) | undefined
const flush = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
afterEach(() => {
  unmount?.()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  fetch.mockReset()
})
async function mount() {
  vi.stubGlobal('$fetch', fetch)
  const open = ref(false), created = vi.fn()
  const app = createApp({ render: () => h(Modal, { 'open': open.value, 'onUpdate:open': (value: boolean) => {
    open.value = value
  }, 'onCreated': created }) })
  app.component('UModal', defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? h('section', { role: 'dialog' }, slots.content?.()) : null }))
  app.component('UFormField', defineComponent({ props: ['label'], setup: (props, { slots }) => () => h('label', [props.label, slots.default?.()]) }))
  app.component('UInput', defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('input', { value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) }))
  app.component('USelect', defineComponent({ props: ['modelValue', 'items'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('select', { value: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value) }, props.items.map((item: { value: string, label: string }) => h('option', { value: item.value }, item.label))) }))
  app.component('UButton', defineComponent({ props: ['label', 'disabled', 'loading'], emits: ['click'], setup: (props, { emit }) => () => h('button', { disabled: props.disabled || props.loading, onClick: () => emit('click') }, props.label) }))
  app.component('UAlert', defineComponent({ props: ['title'], setup: props => () => h('p', { role: 'alert' }, props.title) }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmount = () => app.unmount()
  fetch.mockResolvedValueOnce({ items: [
    { id, name: 'Published R1', client_id: id, head_revision_id: revision, revision_schema_version: 1, template_kind: 'template' },
    { id: 'draft-only', name: 'Draft must stay hidden', client_id: id, head_revision_id: revision, revision_schema_version: 1, template_kind: 'draft' }
  ] }).mockResolvedValueOnce({ clients: [{ id, name: 'Synthetic client' }] })
  open.value = true
  await flush()
  const choose = async (index: number, value: string) => {
    const element = host.querySelectorAll('select')[index]!
    element.value = value
    element.dispatchEvent(new Event('change'))
    await flush()
  }
  const name = async (value: string) => {
    const element = host.querySelector('input')!
    element.value = value
    element.dispatchEvent(new Event('input'))
    await flush()
  }
  const click = async (label: string) => {
    Array.from(host.querySelectorAll('button')).find(button => button.textContent === label)!.click()
    await flush()
  }
  return { host, created, choose, name, click }
}
it('selects an exact published revision for the destination client and navigates only after its receipt', async () => {
  const m = await mount()
  await m.choose(0, id)
  await m.choose(1, id)
  await m.name('Campaign A')
  expect(m.host.textContent).not.toContain('Draft must stay hidden')
  expect(m.host.textContent).toContain(revision)
  fetch.mockResolvedValueOnce({ campaignId: id, documentId: id, revisionId: revision })
  await m.click('Create campaign')
  expect(fetch.mock.calls.at(-1)).toEqual(['/api/email/design/campaigns', { method: 'POST', body: { version: 1, command: 'create-from-template', operationId: expect.any(String), templateId: id, revisionId: revision, clientId: id, campaign: { name: 'Campaign A' } } }])
  expect(m.created).toHaveBeenCalledWith(id)
})
it('keeps the same exact create operation after an unconfirmed reply', async () => {
  const m = await mount()
  await m.choose(0, id)
  await m.choose(1, id)
  await m.name('Original campaign')
  fetch.mockRejectedValueOnce(new Error('committed reply lost'))
  await m.click('Create campaign')
  const original = structuredClone(fetch.mock.calls.at(-1)![1].body)
  expect(m.created).not.toHaveBeenCalled()
  expect(m.host.textContent).toContain('Retry original action')
  await m.name('Later local name')
  fetch.mockResolvedValueOnce({ campaignId: id, documentId: id, revisionId: revision })
  await m.click('Retry original action')
  expect(fetch.mock.calls.at(-1)![1].body).toEqual(original)
  expect(m.created).toHaveBeenCalledTimes(1)
})
it('retains an uncertain creation even when a later replay is denied', async () => {
  vi.stubGlobal('$fetch', fetch)
  const flow = useEdmCampaignTemplateSelection(), selection = { templateId: id, revisionId: revision, clientId: id, name: 'Original' }
  fetch.mockRejectedValueOnce(new Error('reply lost'))
  await expect(flow.create(selection)).rejects.toThrow()
  const original = structuredClone(fetch.mock.calls.at(-1)![1].body)
  fetch.mockRejectedValueOnce({ statusCode: 403 })
  await expect(flow.create({ ...selection, name: 'Changed' })).rejects.toBeDefined()
  expect(flow.pending.value).toBe(true)
  fetch.mockResolvedValueOnce({ campaignId: id, documentId: id, revisionId: revision })
  await flow.create({ ...selection, name: 'Changed' })
  expect(fetch.mock.calls.at(-1)![1].body).toEqual(original)
})
