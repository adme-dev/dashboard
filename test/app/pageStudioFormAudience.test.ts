// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, reactive, computed, watch, onBeforeUnmount, onScopeDispose, type App, type Component } from 'vue'
import Workspace from '~~/app/components/page-studio/CustomerFormsWorkspace.client.vue'
import Settings from '~~/app/components/page-studio/FormSettingsEditor.client.vue'
import Recipients from '~~/app/components/page-studio/FormRecipientsEditor.client.vue'
import Template from '~~/app/components/page-studio/EmailTemplateEditor.client.vue'
import Media from '~~/app/components/page-studio/EmailMediaPicker.client.vue'
import { useEmailTemplatePreview } from '~~/app/composables/useEmailTemplatePreview'
import type { FormApiAudience } from '~~/app/utils/pageStudioFormApi'
import { defaultFormOutcomes } from '~~/shared/pageStudio/formOutcomes'

let app: App, host: HTMLElement
const readValues = new Map<string, unknown>()
const reads: string[] = [], mutate = vi.fn(), guards: Array<() => Promise<boolean>> = []
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
  button(label).click()
  await flush()
}
async function mount(component: Component = Workspace, componentProps: Record<string, unknown> = props) {
  host = document.createElement('div')
  app = createApp({ components: { Target: component }, setup: () => ({ componentProps }), template: '<Target v-bind="componentProps"/>' })
  for (const [name, component] of Object.entries({ PageStudioFormSettingsEditor: Settings, PageStudioFormRecipientsEditor: Recipients, PageStudioEmailTemplateEditor: Template, PageStudioEmailMediaPicker: Media })) app.component(name, component)
  app.component('UButton', { props: ['disabled', 'loading', 'label'], template: '<button :disabled="disabled || loading">{{ label }}<slot/></button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}<slot name="actions"/></div>' })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
  app.component('UTextarea', { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
  app.component('UModal', { props: ['open'], template: '<div v-if="open"><slot name="body"/><slot name="footer"/></div>' })
  app.component('PageStudioFormOutcomeInput', { props: ['modelValue'], emits: ['update:modelValue'], template: '<button @click="$emit(\'update:modelValue\', {type: \'message\', message: \'Changed draft\'})">Change outcome</button>' })
  for (const name of ['UFormField', 'USkeleton', 'UBadge', 'UIcon', 'UPagination', 'PageStudioFormOutcomePreview', 'PageStudioEmailImageFields']) app.component(name, { template: '<div><slot/></div>' })
  app.component('USelect', { props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>' })
  app.component('UAccordion', { template: '<div/>' })
  app.component('UTabs', { props: ['items'], emits: ['update:modelValue'], template: '<div><button v-for="item in items" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>' })
  app.mount(host)
  await flush()
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  readValues.clear()
  reads.length = 0
  guards.length = 0
  props.siteId = 'owned'
  props.apiAudience = 'customer'
  props.canEdit = true
  vi.stubGlobal('useFetch', (url: string) => {
    reads.push(url)
    const value = readValues.get(url) ?? (url.endsWith('/settings') ? { canEdit: true, record: { settings: defaultFormOutcomes(), revision: 1 } } : { canEdit: true, record: null })
    return { data: ref(value), pending: ref(false), error: ref(null), refresh: vi.fn().mockResolvedValue(undefined) }
  })
  vi.stubGlobal('useState', () => ref(false))
  vi.stubGlobal('onBeforeRouteLeave', (guard: () => Promise<boolean>) => {
    guards.push(guard)
  })
  for (const [name, fn] of Object.entries({ ref, computed, watch, onBeforeUnmount, onScopeDispose, useEmailTemplatePreview, $fetch: mutate })) vi.stubGlobal(name, fn)
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
      expect(reads.at(-1)).toBe(`/api/portal/page-studio/customer/sites/owned/forms/shared/email-templates/${audience}`)
      await vi.advanceTimersByTimeAsync(450)
      await flush()
      expect(mutate.mock.calls.at(-1)![0]).toBe(`/api/portal/page-studio/customer/sites/owned/email-templates/${audience}/preview`)
    }
    expect(host.textContent).toContain('Enquiries are not available')
    await click('Website email defaults')
    expect(reads.at(-1)).toBe('/api/portal/page-studio/customer/sites/owned/forms/recipients')
    for (const label of ['Team template', 'Customer template']) {
      await click(label)
      expect(reads.at(-1)).toBe(`/api/portal/page-studio/customer/sites/owned/email-templates/${label === 'Team template' ? 'team' : 'customer'}`)
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
    expect(reads.at(-1)).toBe('/api/portal/page-studio/sites/owned/email-templates/team')
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
    expect(reads.at(-1)).toBe('/api/portal/page-studio/customer/sites/other/email-templates/team')
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
