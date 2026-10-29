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
  for (const name of ['UFormField', 'USelect', 'UFileUpload', 'UAlert']) app.component(name, { props: ['title'], template: '<div>{{ title }}<slot /></div>' })
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
})
