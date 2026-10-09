// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, reactive, computed, watch, onBeforeUnmount, onScopeDispose, type App, type Component } from 'vue'
import Workspace from '~~/app/components/page-studio/CustomerFormsWorkspace.client.vue'
import Settings from '~~/app/components/page-studio/FormSettingsEditor.client.vue'
import Recipients from '~~/app/components/page-studio/FormRecipientsEditor.client.vue'
import Template from '~~/app/components/page-studio/EmailTemplateEditor.client.vue'
import SavedHistory from '~~/app/components/page-studio/EmailTemplateHistory.client.vue'
import Media from '~~/app/components/page-studio/EmailMediaPicker.client.vue'
import { useEmailTemplatePreview } from '~~/app/composables/useEmailTemplatePreview'
import { useEmailTemplateProposal } from '~~/app/composables/useEmailTemplateProposal'
import type { FormApiAudience } from '~~/app/utils/pageStudioFormApi'
import { defaultFormOutcomes } from '~~/shared/pageStudio/formOutcomes'
import { starterEmailTemplate } from '~~/shared/pageStudio/emailTemplates'

let app: App, host: HTMLElement
const readValues = new Map<string, unknown>()
const reads: string[] = [], mutate = vi.fn(), guards: Array<() => Promise<boolean>> = []
const readRequests: Array<{ url: string, query: unknown }> = []
const templateReads = () => reads.filter(url => /\/email-templates\/(team|customer)$/.test(url))
const props = reactive({ siteId: 'owned', apiAudience: 'customer' as FormApiAudience | undefined, canEdit: true, assets: [{ id: 'photo', mediaType: 'image/png', previewAvailable: true, size: 100, altText: 'Logo', fileName: 'logo.png' }], checkpointId: 'saved', pages: [{ id: 'page', title: 'Home', route: '/', visibility: 'public', seo: {}, forms: [{ id: 'placement', name: 'Enquiry', fields: [{ id: 'name', name: 'Name', type: 'text' }] }] }], formLibrary: { schemaVersion: 1, definitions: [{ id: 'shared', revision: 1, form: { id: 'placement', name: 'Enquiry', fields: [{ id: 'name', name: 'Name', type: 'text' }] }, placements: [{ pageId: 'page', formId: 'placement', fieldIds: { name: 'name' } }] }] }, reloadWorkspace: vi.fn().mockResolvedValue(undefined) })
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(label: string) {
  return [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
}
async function click(label: string) {
  expect(button(label), `Expected button: ${label}`).toBeTruthy()
  button(label).click()
  await flush()
}
async function mount(component: Component = Workspace, componentProps: Record<string, unknown> = props) {
  host = document.createElement('div')
  app = createApp({ components: { Target: component }, setup: () => ({ componentProps }), template: '<Target v-bind="componentProps"/>' })
  for (const [name, component] of Object.entries({ PageStudioFormSettingsEditor: Settings, PageStudioFormRecipientsEditor: Recipients, PageStudioEmailTemplateEditor: Template, PageStudioEmailMediaPicker: Media, PageStudioEmailTemplateHistory: SavedHistory })) app.component(name, component)
  app.component('UButton', { props: ['disabled', 'loading', 'label'], template: '<button :disabled="disabled || loading">{{ label }}<slot/></button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}<slot name="actions"/></div>' })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
  app.component('UTextarea', { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
  app.component('USlideover', { props: ['open'], template: '<aside v-if="open"><slot name="body"/><slot name="footer"/></aside>' })
  app.component('UModal', { props: ['open'], template: '<div v-if="open"><slot name="body"/><slot name="footer"/></div>' })
  app.component('PageStudioFormOutcomeInput', { props: ['modelValue'], emits: ['update:modelValue'], template: '<button @click="$emit(\'update:modelValue\', {type: \'message\', message: \'Changed draft\'})">Change outcome</button>' })
  for (const name of ['UFormField', 'USkeleton', 'UBadge', 'UIcon', 'UPagination', 'PageStudioFormOutcomePreview', 'PageStudioEmailImageFields']) app.component(name, { template: '<div><slot/></div>' })
  app.component('USelect', { props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>' })
  app.component('UAccordion', { props: ['items'], data: () => ({ open: false }), template: '<div><button @click="open = !open">{{ items[0].label }}</button><slot v-if="open" :name="items[0].slot"/></div>' })
  app.component('UTabs', { props: ['items'], emits: ['update:modelValue'], template: '<div><button v-for="item in items" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>' })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  readValues.clear()
  reads.length = 0
  readRequests.length = 0
  guards.length = 0
  props.siteId = 'owned'
  props.apiAudience = 'customer'
  props.canEdit = true
  vi.stubGlobal('useFetch', (url: string, options: { immediate?: boolean, query?: { value: unknown }, transform?: (value: unknown) => unknown } = {}) => {
    const data = ref<unknown>(), pending = ref(false), error = ref(null), status = ref('idle')
    const read = () => {
      reads.push(url)
      readRequests.push({ url, query: options.query?.value })
      const value = readValues.get(url) ?? (url.endsWith('/fields')
        ? { available: false, reason: 'Saved field insertion is unavailable for this fixture.' }
        : url.endsWith('/ai')
          ? { available: false, reason: 'AI design is unavailable for this fixture.', models: [], allowance: null }
          : url.endsWith('/settings') ? { canEdit: true, record: { settings: defaultFormOutcomes(), revision: 1 } } : { canEdit: true, record: null })
      data.value = options.transform ? options.transform(value) : value
      status.value = 'success'
    }
    // Nuxt registers lazy reads at setup, but only requests data on refresh.
    // Keep that distinction so opening an editor never pretends to fetch AI options.
    if (options.immediate !== false) read()
    const refresh = vi.fn(async () => {
      read()
    })
    return { data, pending, error, status, refresh }
  })
  vi.stubGlobal('useState', () => ref(false))
  vi.stubGlobal('onBeforeRouteLeave', (guard: () => Promise<boolean>) => {
    guards.push(guard)
  })
  for (const [name, fn] of Object.entries({ ref, computed, watch, onBeforeUnmount, onScopeDispose, useEmailTemplatePreview, useEmailTemplateProposal, $fetch: mutate })) vi.stubGlobal(name, fn)
  mutate.mockResolvedValue({ canEdit: true, record: null, html: '<p>Preview</p>', subject: 'Preview', preheader: '' })
})
afterEach(() => {
  app?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('shared Forms API audience', () => {
  const editors = [
    { name: 'outcomes', component: Settings, save: 'Save draft settings', path: 'pages/page/forms/placement/settings' },
    { name: 'recipients', component: Recipients, save: 'Save recipient draft', path: 'forms/recipients' },
    { name: 'templates', component: Template, save: 'Save template draft', path: 'email-templates/team' }
  ]
  function editorProps() {
    return { siteId: 'owned', checkpointId: 'saved', pageId: 'page', formId: 'placement', fields: props.pages[0]!.forms[0]!.fields, pages: props.pages, assets: props.assets, audience: 'team', forms: [{ key: 'shared', definitionId: 'shared', name: 'Enquiry', pageId: 'page', formId: 'placement' }], reloadWorkspace: props.reloadWorkspace }
  }
  async function changeDraft(name: string) {
    if (name === 'outcomes') await click('Change outcome')
    else if (name === 'recipients') {
      const addresses = host.querySelector('textarea')!
      addresses.value = 'portal@example.test'
      addresses.dispatchEvent(new Event('input'))
      await flush()
    }
  }
  function obsoleteTemplateFixture() {
    const template = starterEmailTemplate('team')
    const state = { canEdit: true, activation: 'draft_only', removedDefinitionIds: ['removed'], record: { revision: 4, template, overrides: [{ definitionId: 'removed', template: { ...template, subject: 'Old booking reply' } }, { definitionId: 'unused_but_saved', template }] } }
    readValues.set('/api/portal/page-studio/sites/owned/email-templates/team', state)
    return state
  }
  function historyFixture(apiAudience = 'portal', definitionId?: string) {
    const base = `/api/portal/page-studio/${apiAudience === 'customer' ? 'customer/' : ''}sites/owned`
    const url = `${base}/${definitionId ? `forms/${definitionId}/` : ''}email-templates/team`
    const current = { ...starterEmailTemplate('team'), subject: 'Current default' }
    const historical = { ...starterEmailTemplate('team'), subject: 'Historical design' }
    readValues.set(url, { canEdit: true, activation: 'draft_only', record: { revision: 14, template: current, overrides: definitionId ? [{ definitionId, template: { ...current, subject: 'Current custom' } }] : [] } })
    mutate.mockImplementation(async (target, options) => {
      if (target === `${url}/history`) return { audience: 'team', canEdit: true, revisions: options?.query?.beforeRevision ? [{ revision: 4, updatedAt: '2026-09-01T00:00:00.000Z' }] : Array.from({ length: 10 }, (_, index) => ({ revision: 14 - index, updatedAt: '2026-10-01T00:00:00.000Z' })), nextBeforeRevision: options?.query?.beforeRevision ? null : 5 }
      if (target === `${url}/history/14`) return { revision: 14, updatedAt: '2026-10-01T00:00:00.000Z', template: historical }
      if (target.includes('/history/')) return { revision: Number(target.split('/').at(-1)), updatedAt: '2026-09-01T00:00:00.000Z', template: null }
      if (options?.method === 'PUT') return { canEdit: true, record: { revision: 15, template: current, overrides: [] } }
      return { html: `<p>${options?.body?.template?.subject}</p>`, subject: options?.body?.template?.subject, preheader: '', warnings: [] }
    })
    return { url, historical, current }
  }
  async function editSubject(value: string) {
    const subject = host.querySelector('input')!
    subject.value = value
    subject.dispatchEvent(new Event('input'))
    await flush()
  }
  it.each(['portal', 'customer'])('keeps AI options lazy and respects the %s availability boundary', async (apiAudience) => {
    const base = `/api/portal/page-studio/${apiAudience === 'customer' ? 'customer/' : ''}sites/owned/email-templates/team`
    await mount(Template, { ...editorProps(), apiAudience })
    expect(reads).not.toContain(`${base}/ai`)
    expect(mutate).not.toHaveBeenCalled()
    await click('AI design')
    if (apiAudience === 'customer') {
      expect(reads).not.toContain(`${base}/ai`)
      expect(host.textContent).toContain('AI email design is not available in this preview')
    } else {
      expect(reads.at(-1)).toBe(`${base}/ai`)
      expect(host.textContent).toContain('AI design is unavailable for this fixture.')
    }
    expect(button('Generate proposal')).toBeUndefined()
    expect(mutate).not.toHaveBeenCalled()
    expect(button('Save template draft').disabled).toBe(false)
  })
  it.each(['portal', 'customer'])('inserts an admitted saved field as an unsaved edit, then saves and reloads through the %s API', async (apiAudience) => {
    const url = `/api/portal/page-studio/${apiAudience === 'customer' ? 'customer/' : ''}sites/owned/email-templates/team`
    const initial = { canEdit: true, record: { revision: 4, template: starterEmailTemplate('team'), overrides: [] } }
    readValues.set(url, initial)
    readValues.set(`${url}/fields`, { available: true, siteId: 'owned', apiAudience, checkpointId: 'saved', formKey: 'shared', fields: [{ fieldId: 'name', label: 'Name', type: 'text' }] })
    await mount(Template, { ...editorProps(), apiAudience })
    expect(readRequests.at(-1)).toEqual({ url: `${url}/fields`, query: { pageId: 'page', formId: 'placement' } })
    await click('Personalise with website details')
    const picker = host.querySelector('[aria-label="Form field text"]')!
    const field = picker.querySelector('select')!
    field.value = 'name'
    field.dispatchEvent(new Event('change'))
    await flush()
    const fallback = picker.querySelector('input')!
    fallback.value = 'there'
    fallback.dispatchEvent(new Event('input'))
    await flush()
    expect(button('Save template draft').disabled).toBe(true)
    await click('Insert field')
    expect(host.querySelector('input')?.value).toContain('{{field.shared.name}}')
    expect(button('Save template draft').disabled).toBe(false)
    expect(mutate).not.toHaveBeenCalled()
    const leave = guards.at(-1)!()
    await flush()
    await click('Keep editing')
    expect(await leave).toBe(false)
    mutate.mockImplementationOnce(async (target, options) => {
      expect(target).toBe(url)
      const saved = { canEdit: true, record: { revision: 5, template: options.body.template, overrides: [] } }
      readValues.set(url, saved)
      return saved
    })
    await click('Save template draft')
    expect(mutate.mock.calls.at(-1)).toEqual([url, expect.objectContaining({ method: 'PUT', body: expect.objectContaining({ checkpointId: 'saved', expectedRevision: 4,
      template: expect.objectContaining({ schemaVersion: 2, subject: expect.stringContaining('{{field.shared.name}}'), fieldBindings: [{ formKey: 'shared', fieldId: 'name', type: 'text', fallback: 'there' }] }) }) })])
    await editSubject('Discard this local edit')
    await click('Discard edits and reload')
    expect(props.reloadWorkspace).toHaveBeenCalledTimes(1)
    expect(host.querySelector('input')?.value).toContain('{{field.shared.name}}')
    expect(picker.querySelectorAll('input')[1]?.value).toBe('there')
    expect(button('Save template draft').disabled).toBe(true)
    expect(mutate).toHaveBeenCalledTimes(1)
  })
  it.each(['portal', 'customer'])('browses and pages %s history lazily without changing edits, then explicitly restores an unsaved legacy draft', async (apiAudience) => {
    const { url, historical } = historyFixture(apiAudience)
    await mount(Template, { ...editorProps(), apiAudience })
    expect(mutate).not.toHaveBeenCalled()
    await editSubject('My manual edits')
    await click('Revision history')
    expect(mutate.mock.calls.at(-1)![0]).toBe(`${url}/history`)
    expect(host.textContent).toContain('other form templates')
    await click('Revision 14')
    expect(host.querySelector('input')?.value).toBe('My manual edits')
    await vi.advanceTimersByTimeAsync(450)
    await flush()
    expect(host.querySelector('iframe[title="Saved revision preview with example answers"]')?.getAttribute('srcdoc')).toContain('Historical design')
    expect(mutate.mock.calls.findLast(call => call[0] === `${url}/preview`)![1].body).toEqual({ template: historical, pageId: 'page', formId: 'placement' })
    await click('Load older')
    expect(mutate.mock.calls.at(-1)).toEqual([`${url}/history`, expect.objectContaining({ query: { beforeRevision: 5 } })])
    expect(button('Revision 4')).toBeTruthy()
    await click('Use this version')
    expect(host.querySelector('input')?.value).toBe('Historical design')
    expect(host.textContent).toContain('Unsaved changes')
    expect(mutate.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0)
    const decision = guards.at(-1)!()
    await flush()
    await click('Keep editing')
    expect(await decision).toBe(false)
    await click('Save template draft')
    expect(mutate.mock.calls.at(-1)).toEqual([url, expect.objectContaining({ method: 'PUT', body: { checkpointId: 'saved', expectedRevision: 14, template: historical } })])
    expect(mutate.mock.calls.at(-1)![1].body.template).not.toHaveProperty('identity')
  })
  it('restores only the current form and uses the current default for historical inheritance', async () => {
    const { url } = historyFixture('customer', 'shared')
    await mount(Template, { ...editorProps(), apiAudience: 'customer', definitionId: 'shared' })
    await click('Revision history')
    await click('Revision 13')
    await vi.advanceTimersByTimeAsync(450)
    await flush()
    expect(host.textContent).toContain('current website default')
    expect(host.querySelector('iframe[title="Saved revision preview with example answers"]')?.getAttribute('srcdoc')).toContain('Current default')
    await click('Use this version')
    expect(host.querySelector('input')).toBeNull()
    await click('Save template draft')
    expect(mutate.mock.calls.at(-1)).toEqual([url, expect.objectContaining({ body: { checkpointId: 'saved', expectedRevision: 14, template: null } })])
  })
  it('keeps staged cleanup when restoring a website revision and does not copy old overrides', async () => {
    const { url, historical } = historyFixture()
    const state = obsoleteTemplateFixture()
    await mount(Template, editorProps())
    await click('Remove template')
    await click('Revision history')
    await click('Revision 14')
    await click('Use this version')
    await click('Save template draft')
    expect(mutate.mock.calls.at(-1)![1].body).toEqual({ checkpointId: 'saved', expectedRevision: 4, template: historical, removeOverrideDefinitionIds: ['removed'] })
    expect(mutate.mock.calls.at(-1)![0]).toBe(url)
    expect(state.record.overrides).toHaveLength(2)
  })
  it('allows read-only browsing but prevents applying even if history grants edit access', async () => {
    historyFixture()
    await mount(Template, { ...editorProps(), canEdit: false })
    await click('Revision history')
    await click('Revision 14')
    expect(button('Use this version').disabled).toBe(true)
    await click('Use this version')
    expect(host.querySelector('input')?.value).toBe('Current default')
  })
  it('preserves a restored draft after conflict and discards it only on reload', async () => {
    historyFixture()
    await mount(Template, editorProps())
    await click('Revision history')
    await click('Revision 14')
    await click('Use this version')
    mutate.mockRejectedValueOnce({ statusCode: 409 })
    await click('Save template draft')
    expect(host.querySelector('input')?.value).toBe('Historical design')
    expect(button('Save template draft').disabled).toBe(true)
    await click('Discard edits and reload')
    expect(host.querySelector('input')?.value).toBe('Current default')
    expect(mutate.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1)
  })
  it('clears selected details during loads, ignores stale responses and cancels on close/unmount', async () => {
    const { url } = historyFixture()
    await mount(Template, editorProps())
    await click('Revision history')
    let finish!: (value: unknown) => void
    mutate.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await click('Revision 14')
    const signal = mutate.mock.calls.at(-1)![1].signal as AbortSignal
    await click('Revision 13')
    expect(signal.aborted).toBe(true)
    finish({ revision: 14, updatedAt: '2026-10-01T00:00:00.000Z', template: { ...starterEmailTemplate('team'), subject: 'STALE SECRET' } })
    await flush()
    expect(host.textContent).not.toContain('STALE SECRET')
    expect(button('Use this version').disabled).toBe(true) // Null is invalid for a website default.
    mutate.mockImplementationOnce(() => new Promise(() => {}))
    await click('Revision 14')
    const closeSignal = mutate.mock.calls.at(-1)![1].signal as AbortSignal
    await click('Close history')
    expect(closeSignal.aborted).toBe(true)
    await click('Revision history')
    const request = mutate.mock.calls.findLast(call => call[0] === `${url}/history`)!
    app.unmount()
    expect(request[1].signal.aborted).toBe(true)
  })
  it('shows actionable history errors without falling back to latest or allowing apply', async () => {
    historyFixture()
    await mount(Template, editorProps())
    mutate.mockRejectedValueOnce({ statusCode: 503 })
    await click('Revision history')
    expect(host.textContent).toContain('History is unavailable')
    expect(button('Retry history')).toBeTruthy()
    await click('Retry history')
    mutate.mockRejectedValueOnce({ statusCode: 503 })
    await click('Revision 14')
    expect(host.textContent).toContain('Could not load this revision')
    expect(button('Use this version').disabled).toBe(true)
    expect(host.querySelector('input')?.value).toBe('Current default')
  })
  it('marks a restored current design as unsaved so Save can append a revision', async () => {
    const { current } = historyFixture()
    await mount(Template, editorProps())
    await click('Revision history')
    mutate.mockResolvedValueOnce({ revision: 14, updatedAt: '2026-10-01T00:00:00.000Z', template: current })
    await click('Revision 14')
    expect(button('Save template draft').disabled).toBe(true)
    await click('Use this version')
    expect(button('Save template draft').disabled).toBe(false)
    await click('Save template draft')
    expect(mutate.mock.calls.at(-1)![1].body.template).toEqual(current)
  })
  it('keeps custom form restores targeted and retains legacy fields with no placement preview', async () => {
    const { url, historical } = historyFixture('portal', 'shared')
    await mount(Template, { ...editorProps(), definitionId: 'shared', forms: [] })
    await click('Revision history')
    await click('Revision 14')
    expect(host.textContent).toContain('no page placement')
    await click('Use this version')
    await click('Save template draft')
    expect(mutate.mock.calls.at(-1)).toEqual([url, expect.objectContaining({ body: { checkpointId: 'saved', expectedRevision: 14, template: historical } })])
  })
  it('clears a previous preview when another revision is loading and ignores stale preview responses', async () => {
    historyFixture()
    await mount(Template, editorProps())
    await click('Revision history')
    await click('Revision 14')
    await vi.advanceTimersByTimeAsync(450)
    await flush()
    let finish!: (value: unknown) => void
    const request = mutate.getMockImplementation()!
    mutate.mockImplementation((target, options) => target.endsWith('/preview') && options?.body?.template?.subject === 'Historical design'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : request(target, options))
    await click('Revision 14')
    await vi.advanceTimersByTimeAsync(450)
    await flush()
    const previewSignal = mutate.mock.calls.at(-1)![1].signal as AbortSignal
    await click('Revision 13')
    expect(host.querySelector('iframe[title="Saved revision preview with example answers"]')).toBeNull()
    expect(previewSignal.aborted).toBe(true)
    finish({ html: '<p>STALE PREVIEW</p>', subject: 'STALE PREVIEW', preheader: '' })
    await flush()
    expect(host.textContent).not.toContain('STALE PREVIEW')
  })
  it('requires fresh history permission and preserves the draft when history is closed', async () => {
    const { url } = historyFixture()
    await mount(Template, editorProps())
    await editSubject('Keep this local edit')
    mutate.mockResolvedValueOnce({ audience: 'team', canEdit: false, revisions: [{ revision: 14, updatedAt: '2026-10-01T00:00:00.000Z' }], nextBeforeRevision: null })
    await click('Revision history')
    await click('Revision 14')
    expect(button('Use this version').disabled).toBe(true)
    await click('Close history')
    expect(host.querySelector('input')?.value).toBe('Keep this local edit')
    expect(mutate.mock.calls.filter(call => call[0] === url && call[1]?.method === 'PUT')).toHaveLength(0)
  })
  it('shows historical missing-image warnings and preserves restored edits when an ordinary save rejects images', async () => {
    historyFixture()
    await mount(Template, editorProps())
    await click('Revision history')
    await click('Revision 14')
    const request = mutate.getMockImplementation()!
    mutate.mockImplementation((target, options) => target.endsWith('/preview') && options?.body?.template?.subject === 'Historical design' ? Promise.resolve({ html: '<p>Historical image missing</p>', subject: 'Historical design', preheader: '', warnings: ['An image is no longer available.'] }) : request(target, options))
    await vi.advanceTimersByTimeAsync(450)
    await flush()
    expect(host.textContent).toContain('An image is no longer available.')
    await click('Use this version')
    mutate.mockRejectedValueOnce({ statusCode: 400, data: { statusMessage: 'Replace the unavailable image before saving.' } })
    await click('Save template draft')
    expect(host.textContent).toContain('Replace the unavailable image before saving.')
    expect(host.querySelector('input')?.value).toBe('Historical design')
  })
  it('cancels list/detail loads and rejects stale site/audience replies in the history panel', async () => {
    let finish!: (value: unknown) => void
    mutate.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const historyProps = reactive({ url: '/api/portal/page-studio/customer/sites/owned/email-templates/team', websiteUrl: '/api/portal/page-studio/customer/sites/owned/email-templates/team', audience: 'team', isForm: false, canApply: true, currentDefault: starterEmailTemplate('team'), previewForm: { pageId: 'page', formId: 'placement' } })
    await mount(SavedHistory, historyProps)
    const signal = mutate.mock.calls.at(-1)![1].signal as AbortSignal
    mutate.mockResolvedValueOnce({ audience: 'customer', canEdit: true, revisions: [{ revision: 2, updatedAt: '2026-10-01T00:00:00.000Z' }], nextBeforeRevision: null })
    historyProps.url = '/api/portal/page-studio/sites/other/email-templates/customer'
    historyProps.websiteUrl = historyProps.url
    historyProps.audience = 'customer'
    await flush()
    finish({ audience: 'team', canEdit: true, revisions: [{ revision: 999, updatedAt: '2026-10-01T00:00:00.000Z' }], nextBeforeRevision: null })
    await flush()
    expect(signal.aborted).toBe(true)
    expect(button('Revision 999')).toBeUndefined()
    expect(button('Revision 2')).toBeTruthy()
    mutate.mockResolvedValueOnce({ revision: 3, updatedAt: '2026-10-01T00:00:00.000Z', template: starterEmailTemplate('customer') })
    await click('Revision 2')
    expect(button('Use this version').disabled).toBe(true)
    expect(host.textContent).toContain('Could not load this revision')
  })
  it('stages explicit obsolete template removal with undo and saves only the selected IDs', async () => {
    const state = obsoleteTemplateFixture()
    await mount(Template, editorProps())
    expect(host.textContent).toContain('Old booking reply')
    expect(host.textContent).not.toContain('unused_but_saved')
    expect(button('Save template draft').disabled).toBe(true)
    await click('Remove template')
    expect(button('Save template draft').disabled).toBe(false)
    expect(mutate).not.toHaveBeenCalled()
    await click('Undo removal')
    expect(button('Save template draft').disabled).toBe(true)
    await click('Remove template')
    mutate.mockResolvedValueOnce({ ...state, removedDefinitionIds: [], record: { ...state.record, revision: 5, overrides: state.record.overrides.slice(1) } })
    await click('Save template draft')
    expect(mutate).toHaveBeenCalledWith('/api/portal/page-studio/sites/owned/email-templates/team', expect.objectContaining({ method: 'PUT', body: expect.objectContaining({ expectedRevision: 4, removeOverrideDefinitionIds: ['removed'] }) }))
    expect(mutate.mock.calls[0]![1].body.template).toEqual(state.record.template)
    expect(host.textContent).not.toContain('Old booking reply')
  })
  it('preserves cleanup edits on conflict, does not replay, and clears them on discard', async () => {
    obsoleteTemplateFixture()
    await mount(Template, editorProps())
    await click('Remove template')
    mutate.mockRejectedValueOnce({ statusCode: 409 })
    await click('Save template draft')
    expect(host.textContent).toContain('Your edits are preserved')
    expect(button('Undo removal').disabled).toBe(true)
    expect(button('Save template draft').disabled).toBe(true)
    await click('Save template draft')
    expect(mutate).toHaveBeenCalledTimes(1)
    await click('Discard edits and reload')
    expect(button('Remove template').disabled).toBe(false)
    expect(button('Save template draft').disabled).toBe(true)
  })
  it('prevents read-only template cleanup', async () => {
    obsoleteTemplateFixture()
    await mount(Template, { ...editorProps(), canEdit: false })
    expect(button('Remove template').disabled).toBe(true)
    await click('Remove template')
    expect(button('Save template draft').disabled).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
  })
  it('keeps the legacy portal workspace editable when both optional props are omitted', async () => {
    const portalProps = Object.fromEntries(Object.entries(props).filter(([key]) => !['apiAudience', 'canEdit'].includes(key)))
    await mount(Workspace, portalProps)
    expect(reads[0]).toBe('/api/portal/page-studio/sites/owned/pages/page/forms/placement/settings')
    expect(host.querySelector('fieldset')?.disabled).toBe(false)
    expect(button('View enquiries')).toBeTruthy()
    await click('Website email defaults')
    expect(host.querySelector('fieldset')?.disabled).toBe(false)
    await click('Team template')
    expect(host.querySelector('fieldset')?.disabled).toBe(false)
    expect(button('Save template draft').disabled).toBe(false)
  })
  it.each(editors)('lets the reused portal $name editor save with an omitted cap and fresh API edit access', async ({ component, name, save, path }) => {
    await mount(component, editorProps())
    expect(host.querySelector('fieldset')?.disabled).toBe(false)
    await changeDraft(name)
    expect(button(save).disabled).toBe(false)
    await click(save)
    expect(mutate).toHaveBeenCalledWith(`/api/portal/page-studio/sites/owned/${path}`, expect.objectContaining({ method: 'PUT' }))
  })
  it.each(editors)('blocks the $name editor with an explicit false cap even when the API grants edit access', async ({ component, name, save }) => {
    await mount(component, { ...editorProps(), canEdit: false })
    expect(host.querySelector('fieldset')?.disabled).toBe(true)
    await changeDraft(name)
    expect(button(save).disabled).toBe(true)
    await click(save)
    expect(mutate.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0)
  })
  it.each(editors)('requires fresh API edit access in the $name editor even when the cap permits editing', async ({ component, name, save, path }) => {
    readValues.set(`/api/portal/page-studio/sites/owned/${path}`, { canEdit: false, record: null })
    await mount(component, { ...editorProps(), canEdit: true })
    expect(host.querySelector('fieldset')?.disabled).toBe(true)
    await changeDraft(name)
    expect(button(save).disabled).toBe(true)
    await click(save)
    expect(mutate.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0)
  })
  it('propagates native targets through outcomes, recipients, overrides, both templates, preview and media', async () => {
    await mount()
    expect(reads).toContain('/api/portal/page-studio/customer/sites/owned/pages/page/forms/placement/settings')
    await click('Change outcome')
    await click('Save draft settings')
    expect(mutate.mock.calls[0]![0]).toContain('/customer/sites/owned/pages/page/forms/placement/settings')
    await click('Email recipients')
    expect(reads.at(-1)).toBe('/api/portal/page-studio/customer/sites/owned/forms/recipients')
    for (const label of ['Team template', 'Customer template']) {
      await click(label)
      const audience = label === 'Team template' ? 'team' : 'customer'
      expect(templateReads().at(-1)).toBe(`/api/portal/page-studio/customer/sites/owned/forms/shared/email-templates/${audience}`)
      expect(readRequests.at(-1)).toEqual({ url: `/api/portal/page-studio/customer/sites/owned/forms/shared/email-templates/${audience}/fields`, query: { pageId: 'page', formId: 'placement' } })
      await vi.advanceTimersByTimeAsync(450)
      await flush()
      expect(mutate.mock.calls.at(-1)![0]).toBe(`/api/portal/page-studio/customer/sites/owned/email-templates/${audience}/preview`)
    }
    expect(host.textContent).toContain('Enquiries are not available')
    await click('Website email defaults')
    expect(reads.at(-1)).toBe('/api/portal/page-studio/customer/sites/owned/forms/recipients')
    for (const label of ['Team template', 'Customer template']) {
      await click(label)
      expect(templateReads().at(-1)).toBe(`/api/portal/page-studio/customer/sites/owned/email-templates/${label === 'Team template' ? 'team' : 'customer'}`)
    }
    await click('Details')
    await click('Choose logo')
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/api/portal/page-studio/customer/sites/owned/assets/photo/content')
    expect(button('View enquiries')).toBeUndefined()
  })
  it.each(['customer', 'portal'])('saves defaults and overrides to the selected %s session endpoints', async (apiAudience) => {
    props.apiAudience = apiAudience as FormApiAudience
    await mount()
    const base = `/api/portal/page-studio/${apiAudience === 'customer' ? 'customer/' : ''}sites/owned`
    await click('Website email defaults')
    const addresses = host.querySelector('textarea')!
    addresses.value = 'draft@example.test'
    addresses.dispatchEvent(new Event('input'))
    await flush()
    await click('Save recipient draft')
    expect(mutate.mock.calls.at(-1)![0]).toBe(`${base}/forms/recipients`)
    expect(mutate.mock.calls.at(-1)![1].body.settings.recipients).toEqual(['draft@example.test'])
    for (const label of ['Team template', 'Customer template']) {
      await click(label)
      await click('Save template draft')
      expect(mutate.mock.calls.at(-1)![0]).toBe(`${base}/email-templates/${label === 'Team template' ? 'team' : 'customer'}`)
      expect(mutate.mock.calls.at(-1)![1].body.expectedRevision).toBe(0)
    }
    await click('Back to forms')
    for (const label of ['Team template', 'Customer template']) {
      await click(label)
      await click('Customise for this form')
      const subject = host.querySelector('input')!
      subject.value = 'My custom draft'
      subject.dispatchEvent(new Event('input'))
      await flush()
      await click('Save template draft')
      expect(mutate.mock.calls.at(-1)![0]).toBe(`${base}/forms/shared/email-templates/${label === 'Team template' ? 'team' : 'customer'}`)
      expect(mutate.mock.calls.at(-1)![1].body.template.subject).toBe('My custom draft')
    }
  })
  it('preserves existing overrides when saving defaults and targets one shared form when saving custom recipients', async () => {
    const url = '/api/portal/page-studio/customer/sites/owned/forms/recipients'
    readValues.set(url, { canEdit: true, record: { revision: 5, settings: { recipients: ['default@example.test'], overrides: [{ definitionId: 'another', recipients: ['override@example.test'] }] } } })
    await mount()
    await click('Website email defaults')
    let addresses = host.querySelector('textarea')!
    addresses.value = 'changed@example.test'
    addresses.dispatchEvent(new Event('input'))
    await flush()
    await click('Save recipient draft')
    expect(mutate.mock.calls.at(-1)![1].body).toMatchObject({ expectedRevision: 5, settings: { recipients: ['changed@example.test'], overrides: [{ definitionId: 'another', recipients: ['override@example.test'] }] } })
    await click('Back to forms')
    await click('Email recipients')
    const mode = [...host.querySelectorAll('select')].find(item => item.querySelector('option[value="custom"]'))!
    mode.value = 'custom'
    mode.dispatchEvent(new Event('change'))
    await flush()
    addresses = host.querySelector('textarea')!
    addresses.value = 'shared@example.test'
    addresses.dispatchEvent(new Event('input'))
    await flush()
    await click('Save recipient draft')
    expect(mutate.mock.calls.at(-1)![0]).toBe(url)
    expect(mutate.mock.calls.at(-1)![1].body.settings).toEqual({ recipients: ['default@example.test'], overrides: [{ definitionId: 'another', recipients: ['override@example.test'] }, { definitionId: 'shared', recipients: ['shared@example.test'] }] })
  })
  it('preserves a conflicting draft until explicit readback and does not replay its mutation', async () => {
    await mount()
    await click('Website email defaults')
    const addresses = host.querySelector('textarea')!
    addresses.value = 'keep@example.test'
    addresses.dispatchEvent(new Event('input'))
    await flush()
    mutate.mockRejectedValueOnce({ statusCode: 409 })
    await click('Save recipient draft')
    expect(host.textContent).toContain('Your edits are preserved')
    expect(host.querySelector('textarea')?.value).toBe('keep@example.test')
    expect(button('Save recipient draft').disabled).toBe(true)
    await click('Save recipient draft')
    expect(mutate).toHaveBeenCalledTimes(1)
    await click('Discard edits and reload')
    expect(props.reloadWorkspace).toHaveBeenCalledTimes(1)
    expect(host.querySelector('textarea')?.value).toBe('')
    expect(mutate).toHaveBeenCalledTimes(1)
  })
  it('preserves default portal endpoints and enquiries', async () => {
    props.apiAudience = undefined
    await mount()
    expect(reads[0]).toBe('/api/portal/page-studio/sites/owned/pages/page/forms/placement/settings')
    expect(button('View enquiries')).toBeTruthy()
    await click('Website email defaults')
    await click('Team template')
    expect(templateReads().at(-1)).toBe('/api/portal/page-studio/sites/owned/email-templates/team')
  })
  it('remounts secret draft state on site changes and cancels stale previews', async () => {
    await mount()
    await click('Website email defaults')
    await click('Team template')
    let finish!: (value: unknown) => void
    mutate.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    await vi.advanceTimersByTimeAsync(450)
    props.siteId = 'other'
    await flush()
    expect(templateReads().at(-1)).toBe('/api/portal/page-studio/customer/sites/other/email-templates/team')
    finish({ html: '<p>OLD PRIVATE PREVIEW</p>', subject: 'Old secret', preheader: '' })
    await flush()
    expect(host.querySelector('iframe')?.getAttribute('srcdoc') ?? '').not.toContain('OLD PRIVATE PREVIEW')
  })
  it('remounts the editor when the authenticated API audience changes on the same site', async () => {
    await mount()
    props.apiAudience = 'portal'
    await flush()
    expect(reads.at(-1)).toBe('/api/portal/page-studio/sites/owned/pages/page/forms/placement/settings')
    expect(button('View enquiries')).toBeTruthy()
  })
  it('keeps read-only saves disabled across every editor branch', async () => {
    props.canEdit = false
    await mount()
    expect(button('Save draft settings').disabled).toBe(true)
    await click('Email recipients')
    expect(button('Save recipient draft').disabled).toBe(true)
    await click('Team template')
    expect(button('Save template draft').disabled).toBe(true)
    expect(button('Customise for this form').disabled).toBe(true)
    await click('Website email defaults')
    await click('Customer template')
    expect(button('Save template draft').disabled).toBe(true)
    expect(mutate.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0)
  })
  it('preserves dirty selection and explicit leave confirmation', async () => {
    await mount()
    await click('Change outcome')
    expect(button('Website email defaults').disabled).toBe(true)
    const decision = guards.at(-1)!()
    await flush()
    expect(button('Keep editing')).toBeTruthy()
    await click('Keep editing')
    expect(await decision).toBe(false)
    const leave = guards.at(-1)!()
    await flush()
    await click('Discard and leave')
    expect(await leave).toBe(true)
  })
})
