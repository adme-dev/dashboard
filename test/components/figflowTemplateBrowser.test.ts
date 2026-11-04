// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Browser from '../../app/components/email/FigflowTemplateBrowser.client.vue'

const fetch = vi.fn()
const navigate = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const document = (text: string) => ({ root: { type: 'EmailLayout', data: { childrenIds: ['heading'] } }, heading: { type: 'Heading', data: { props: { text } } } })
const row = () => ({ id: '10000000-0000-4000-8000-000000000001', name: 'Team template', template_kind: 'template', client_id: null, body_source: document('Listed copy') })
const scope = { clients: [], canUseSharedTemplates: true }
const flush = async () => {
  for (let n = 0; n < 12; n++) await Promise.resolve()
  await nextTick()
}
async function mount() {
  const host = globalThis.document.createElement('div')
  globalThis.document.body.append(host)
  const app = createApp(Browser)
  const wrapper = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
  for (const name of ['UFormField', 'UCard', 'UBadge', 'EmailBuilderEdmDocumentThumbnail']) app.component(name, wrapper)
  app.component('UAlert', defineComponent({ props: ['title', 'description'], setup: p => () => h('p', `${p.title || ''} ${p.description || ''}`) }))
  app.component('UButton', defineComponent({ props: ['label', 'disabled', 'to'], emits: ['click'], setup: (p, { emit }) => () => h('button', { 'disabled': p.disabled, 'data-to': JSON.stringify(p.to), 'onClick': () => emit('click') }, p.label) }))
  app.component('UModal', defineComponent({ props: ['open'], setup: (p, { slots }) => () => p.open ? h('section', slots.content?.()) : null }))
  app.component('UInput', defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('input', { value: p.modelValue, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }) }))
  app.component('USelect', defineComponent({ props: ['modelValue', 'items'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('select', { value: p.modelValue, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLSelectElement).value) }, p.items.map((o: { value: string, label: string }) => h('option', { value: o.value }, o.label))) }))
  app.component('UTabs', defineComponent({ props: ['items'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('div', p.items.map((o: { value: string, label: string }) => h('button', { onClick: () => emit('update:modelValue', o.value) }, o.label))) }))
  app.mount(host)
  apps.push(app)
  await flush()
  return { host, click: async (label: string) => {
    const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent === label)
    expect(button, label).toBeDefined()
    button!.click()
    await flush()
  } }
}
beforeEach(() => {
  vi.stubGlobal('useRoute', () => ({ query: {} }))
  fetch.mockReset()
  navigate.mockReset()
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('navigateTo', navigate)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  globalThis.document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('FigFlow email template browser', () => {
  it('copies fresh authorized source into a draft and opens only its confirmed saved ID', async () => {
    const original = row()
    const before = JSON.stringify(original)
    fetch.mockResolvedValueOnce({ items: [original] }).mockResolvedValueOnce(scope)
    const { click } = await mount()
    await click('Use in FigFlow')
    fetch.mockResolvedValueOnce({ template: { ...original, body_source: document('Fresh source') } }).mockResolvedValueOnce({ template: { id: 'confirmed-draft' } })
    await click('Create draft and open FigFlow')
    expect(fetch.mock.calls[2][0]).toBe(`/api/email/templates/${original.id}`)
    const create = fetch.mock.calls[3]
    expect(create[0]).toBe('/api/email/templates')
    expect(create[1].body).toMatchObject({ template_kind: 'draft', client_id: null, body_source: { heading: { data: { props: { text: 'Fresh source' } } } } })
    expect(JSON.stringify(original)).toBe(before)
    expect(navigate).toHaveBeenCalledWith({ path: '/agency/email/compose', query: { id: 'confirmed-draft', workspace: 'figflow', openDesign: '1' } })
  })
  it('offers composer fallback rather than native editing for HTML-only source', async () => {
    fetch.mockResolvedValueOnce({ items: [{ ...row(), body_source: { root: { type: 'EmailLayout', data: { childrenIds: ['html'] } }, html: { type: 'Html', data: { props: { contents: '<p>Legacy</p>' } } } } }] }).mockResolvedValueOnce(scope)
    const { host } = await mount()
    expect(host.textContent).toContain('Editable FigFlow conversion is not available')
    expect(host.textContent).toContain('Open composer copy')
    expect(host.textContent).not.toContain('Use in FigFlow')
    const fallback = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Open composer copy')!
    expect(fallback.dataset.to).toContain('workspace=figflow')
  })
  it('blocks blind retries after an uncertain create and lets the user check drafts', async () => {
    fetch.mockResolvedValueOnce({ items: [row()] }).mockResolvedValueOnce(scope)
    const { host, click } = await mount()
    await click('Use in FigFlow')
    fetch.mockResolvedValueOnce({ template: row() }).mockRejectedValueOnce(new Error('lost reply'))
    await click('Create draft and open FigFlow')
    expect(host.textContent).toContain('Check Drafts')
    expect(host.textContent).not.toContain('Create draft and open FigFlow')
    expect(navigate).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce(scope)
    await click('Check Drafts')
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
    expect(host.textContent).toContain('previous save was not confirmed')
  })
  it('clears stale template data when a fresh access/list read fails', async () => {
    fetch.mockResolvedValueOnce({ items: [row()] }).mockResolvedValueOnce(scope)
    const { host, click } = await mount()
    expect(host.textContent).toContain('Team template')
    fetch.mockRejectedValueOnce({ statusCode: 403 }).mockResolvedValueOnce(scope)
    await click('Refresh')
    expect(host.textContent).toContain('could not load')
    expect(host.textContent).not.toContain('Team template')
    expect(host.textContent).not.toContain('Use in FigFlow')
  })
})

describe('versioned template browser copy', () => {
  it('uses canonical copy and exact reconciliation instead of legacy body copying', async () => {
    const original = { ...row(), template_kind: 'template', design_document_id: '10000000-0000-4000-8000-000000000001', revision_schema_version: 1, head_revision_id: '20000000-0000-4000-8000-000000000001' }
    fetch.mockResolvedValueOnce({ items: [original] }).mockResolvedValueOnce(scope)
    const { host, click } = await mount()
    await click('Use in FigFlow')
    fetch.mockResolvedValueOnce({ template: original }).mockRejectedValueOnce(new Error('lost canonical reply'))
    await click('Create draft and open FigFlow')
    expect(host.textContent).toContain('Reconcile template copy')
    expect(fetch.mock.calls.filter(([url]) => url === '/api/email/templates')).toHaveLength(1)
    const originalAction = fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')![1].body
    expect(originalAction).toMatchObject({ command: 'copy-template-draft', revisionId: original.head_revision_id })
    expect(originalAction).not.toHaveProperty('body_source')
    const receipt = { templateId: 'copied-template', documentId: 'new-document', revisionId: 'new-revision', published: false }
    fetch.mockResolvedValueOnce(receipt).mockResolvedValueOnce({ draft: { documentId: receipt.documentId, headRevisionId: receipt.revisionId } })
    await click('Reconcile template copy')
    expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates').map(([, options]) => options.body)).toEqual([originalAction, originalAction])
    expect(navigate).toHaveBeenCalledWith({ path: '/agency/email/compose', query: { id: receipt.templateId, workspace: 'figflow', openDesign: '1' } })
  })
})
