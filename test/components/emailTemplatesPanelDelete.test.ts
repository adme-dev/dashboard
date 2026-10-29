// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, Suspense } from 'vue'
import TemplatesPanel from '~~/app/components/email/TemplatesPanel.vue'

const fetchMock = vi.fn()
const toast = vi.fn()
const rows = [
  { id: 'one', name: 'Delete me', template_kind: 'template', folder_name: 'Only folder', updated_at: '' },
  { id: 'two', name: 'Keep me', template_kind: 'draft', updated_at: '' }
]
let cleanup: () => void
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ items: rows })
  toast.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('useToast', () => ({ add: toast }))
})
afterEach(() => { cleanup?.(); vi.unstubAllGlobals() })
async function flush() {
  for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick() }
}
async function mount() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(TemplatesPanel) }) })
  app.component('UButton', {
    props: ['label', 'icon', 'disabled', 'loading'],
    template: '<button :data-icon="icon" :disabled="disabled || loading"><slot />{{ label }}</button>'
  })
  app.component('UModal', { props: ['open'], template: '<div v-if="open" class="modal"><slot name="content" /></div>' })
  for (const name of ['UIcon', 'UBadge', 'USelect', 'UInput', 'UTooltip', 'UFormField', 'EmailBuilderEdmTemplateThumbnail', 'EmailBuilderEdmDocumentThumbnail']) {
    app.component(name, { template: '<div><slot /></div>' })
  }
  app.mount(host)
  cleanup = () => app.unmount()
  await flush()
  return host
}
function openDelete(host: HTMLElement) {
  Array.from(host.querySelectorAll<HTMLElement>('.saved-template-card')).find(card => card.textContent?.includes('Delete me'))!.querySelector<HTMLButtonElement>('[data-icon="i-lucide-trash-2"]')!.click()
}
function confirm(host: HTMLElement) {
  host.querySelector<HTMLButtonElement>('.modal [data-icon="i-lucide-trash-2"]')!.click()
}
describe('saved template deletion', () => {
  it('requires confirmation and cancel leaves the list unchanged', async () => {
    const host = await mount()
    openDelete(host); await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(host.querySelector('.modal')?.textContent).toContain('Delete me')
    Array.from(host.querySelectorAll<HTMLButtonElement>('.modal button')).find(b => b.textContent === 'Cancel')!.click()
    await flush()
    expect(host.querySelector('.modal')).toBeNull()
    expect(host.querySelectorAll('.saved-template-card')).toHaveLength(2)
  })
  it('removes only the confirmed card and empty group without a list refetch', async () => {
    const host = await mount()
    openDelete(host); await flush()
    fetchMock.mockResolvedValueOnce({ ok: true })
    confirm(host); await flush()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/email/templates/one', { method: 'DELETE' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(host.querySelectorAll('.saved-template-card')).toHaveLength(1)
    expect(host.textContent).toContain('Keep me')
    expect(host.textContent).not.toContain('Only folder')
    expect(host.textContent).toContain('1 template(s)')
    expect(host.querySelector('.modal')).toBeNull()
  })
  it('keeps failed deletions available for retry and prevents duplicate requests', async () => {
    const host = await mount()
    openDelete(host); await flush()
    let reject!: (error: Error) => void
    fetchMock.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
    confirm(host); confirm(host); await flush()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    reject(new Error('Forbidden')); await flush()
    expect(host.querySelectorAll('.saved-template-card')).toHaveLength(2)
    expect(host.querySelector('.modal')).not.toBeNull()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete failed' }))
    fetchMock.mockResolvedValueOnce({ ok: true })
    confirm(host); await flush()
    expect(host.querySelectorAll('.saved-template-card')).toHaveLength(1)
  })
})
