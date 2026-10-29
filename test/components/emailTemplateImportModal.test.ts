/* eslint-disable @stylistic/max-statements-per-line -- Compact mocked UI/API fixtures. */
// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from '../../app/components/email/TemplateImportModal.vue'

const fetcher = vi.fn(), toast = vi.fn(), imported = vi.fn(), close = vi.fn()
let cleanup: () => void
async function flush() { for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick() } }
async function mount() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Modal, { 'open': true, 'onImported': imported, 'onUpdate:open': close }) })
  app.component('UModal', { template: '<div><slot name="content" /></div>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading'], template: '<button :disabled="disabled || loading">{{ label }}</button>' })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('UTextarea', { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('UFormField', {props:['label'],template:'<label :data-label="label"><slot /></label>'})
  app.component('USelect', {props:['modelValue','items'],emits:['update:modelValue'],template:'<select :value="modelValue" @change="$emit(\'update:modelValue\',$event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>'})
  for (const name of ['UFileUpload', 'UAlert']) app.component(name, { props: ['title'], template: '<div>{{ title }}<slot /></div>' })
  app.mount(host); cleanup = () => app.unmount(); await flush(); return host
}
const click = (host: HTMLElement, label: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === label)!.click()
beforeEach(() => { vi.clearAllMocks(); fetcher.mockReset(); fetcher.mockImplementation((url: string) => url === '/api/email/template-clients' ? Promise.resolve({ clients: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Client A' }], canUseSharedTemplates: false }) : Promise.reject(new Error('Unexpected request'))); vi.stubGlobal('$fetch', fetcher); vi.stubGlobal('useToast', () => ({ add: toast })) })
afterEach(() => { cleanup?.(); vi.unstubAllGlobals() })
describe('template import modal', () => {
  it('cancels without any request', async () => { const host = await mount(); click(host, 'Cancel'); expect(close).toHaveBeenCalledWith(false); expect(fetcher.mock.calls.filter(call => call[0] === '/api/email/templates/import')).toHaveLength(0) })
  it('previews before explicit save and emits reactive row and feedback', async () => {
    const host = await mount()
    const input = host.querySelector('textarea')!
    input.value = '<p>Hello</p>'; input.dispatchEvent(new Event('input')); await flush()
    fetcher.mockResolvedValueOnce({ html: '<p>Hello</p>', blocks: 1 })
    click(host, 'Preview import'); await flush()
    expect(fetcher.mock.calls.filter(call => call[0] === '/api/email/templates/import')[0][1].body.save).toBe(false)
    expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe('')
    input.value = '<p>Changed</p>'
    input.dispatchEvent(new Event('input'))
    await flush()
    expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === 'Import template')).toBe(false)
    fetcher.mockResolvedValueOnce({ html: '<p>Changed</p>', blocks: 1 })
    click(host, 'Preview import')
    await flush()
    fetcher.mockResolvedValueOnce({ template: { id: 'imported' } })
    click(host, 'Import template'); await flush()
    expect(fetcher.mock.calls.filter(call => call[0] === '/api/email/templates/import')[2][1].body.save).toBe(true)
    expect(fetcher.mock.calls.filter(call => call[0] === '/api/email/templates/import')[2][1].body.client_id).toBe('11111111-1111-4111-8111-111111111111')
    expect(imported).toHaveBeenCalledWith({ id: 'imported' })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Template imported' }))
  })
  it('reuses its request key after an uncertain save response', async () => {
    const host = await mount(); const input=host.querySelector('textarea')!
    input.value='<p>Retry me</p>';input.dispatchEvent(new Event('input'));await flush()
    fetcher.mockResolvedValueOnce({html:'<p>Retry me</p>',blocks:1});click(host,'Preview import');await flush()
    fetcher.mockRejectedValueOnce(new Error('response lost'));click(host,'Import template');await flush()
    fetcher.mockResolvedValueOnce({template:{id:'confirmed'}});click(host,'Import template');await flush()
    const saves=fetcher.mock.calls.filter(call=>call[0]==='/api/email/templates/import'&&call[1].body.save)
    expect(saves).toHaveLength(2)
    expect(saves[0][1].body.request_key).toBeTruthy()
    expect(saves[1][1].body.request_key).toBe(saves[0][1].body.request_key)
  })

  it('restores backup metadata while retaining the explicitly authorised client choice', async () => {
    const host=await mount();const format=host.querySelector<HTMLSelectElement>('[data-label="Format"] select')!
    format.value='json';format.dispatchEvent(new Event('change'))
    const input=host.querySelector('textarea')!
    input.value=JSON.stringify({format:'xeroflow-email-template',version:1,template:{name:'OEM reference',subject:'Launch',preview_text:'Coming soon',template_kind:'draft',folder_name:'Official OEM / Geely',client_id:'foreign',body_source:{root:{type:'EmailLayout',data:{childrenIds:[]}}}}})
    input.dispatchEvent(new Event('input'));await flush()
    expect(host.querySelector<HTMLInputElement>('[data-label="Template name"] input')!.value).toBe('OEM reference')
    fetcher.mockResolvedValueOnce({html:'<p>OEM</p>',blocks:0});click(host,'Preview import');await flush()
    const body=fetcher.mock.calls.find(call=>call[0]==='/api/email/templates/import')![1].body
    expect(body).toMatchObject({subject:'Launch',preview_text:'Coming soon',template_kind:'draft',folder_name:'Official OEM / Geely',client_id:'11111111-1111-4111-8111-111111111111'})
  })

})
