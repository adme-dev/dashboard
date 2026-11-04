// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import Library from '../../app/components/email/builder/EdmDesignLibraryPanel.vue'
import History from '../../app/components/email/builder/EdmDesignHistoryPanel.vue'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const id = '10000000-0000-4000-8000-000000000001'
const revisionId = '20000000-0000-4000-8000-000000000001'
const fetcher = vi.fn()
const apps: Array<ReturnType<typeof createApp>> = []
const module = {
  id,
  name: 'Published hero',
  revision_schema_version: 1,
  head_revision_id: revisionId,
  design_document_id: id,
  client_id: null
}
const source = () => validateEmailDesign(structuredDesign())
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(component: typeof Library | typeof History, publisher = true) {
  const flow = useEdmDesignRoundtrip()
  flow.draft.value = {
    state: 'structured',
    documentId: id,
    templateId: id,
    headRevisionId: revisionId,
    projectionRevisionId: revisionId,
    source: source(),
    projection: { state: 'current' }
  }
  flow.libraryAuthoring.value = { available: true, publisher }
  const blocked = ref(false),
    saved = ref(true),
    actions = vi.fn()
  const app = createApp({
    render: () =>
      h(component, {
        flow,
        blocked: blocked.value,
        saved: saved.value,
        selectedId: 'heading',
        onModule: actions,
        onRestore: actions
      })
  })
  app.component('UButton', {
    props: ['label', 'disabled'],
    template: '<button :disabled="disabled"><slot />{{ label }}</button>'
  })
  app.component('UFormField', { props: ['label'], template: '<label :data-label="label">{{ label }}<slot /></label>' })
  app.component('USelect', {
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>'
  })
  app.component('UCheckbox', {
    props: ['modelValue', 'label', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<label>{{ label }}<input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" /></label>'
  })
  for (const control of ['UInput', 'UTextarea'])
    app.component(control, {
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue'],
      template:
        '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    })
  app.component('UBadge', { props: ['label'], template: '<span>{{ label }}</span>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p>{{ title }}{{ description }}</p>' })
  app.component('EmailBuilderEdmDocumentThumbnail', { template: '<div data-preview />' })
  app.component('EmailBuilderEdmImageLibraryPicker', { template: '<div />' })
  const host = document.createElement('div')
  app.mount(host)
  apps.push(app)
  await flush()
  const button = (label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === label)!
  return { host, flow, blocked, saved, actions, button }
}
beforeEach(() => {
  fetcher.mockReset()
  vi.stubGlobal('$fetch', fetcher)
  const state = new Map<string, unknown>()
  vi.stubGlobal('useState', (key: string, initial: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initial()))
    return state.get(key)
  })
  fetcher.mockImplementation(async (url: string, options?: { body?: { command?: string } }) => {
    if (url === '/api/agency/email/modules') return { items: [module] }
    if (url.startsWith('/api/email/design/modules/'))
      return {
        moduleId: id,
        revisionId,
        design: {
          ...source(),
          kind: 'module',
          blocks: { heading: source().blocks.heading },
          rootChildrenIds: ['heading'],
          policy: { version: 1, editableFields: ['heading.data.props.text'] },
          lineage: [source().lineage[0]]
        }
      }
    if (options?.body?.command === 'list-revisions')
      return {
        currentRevisionId: revisionId,
        revisions: [{ id, schema_version: 1, created_at: '2026-11-01T00:00:00Z', subject: 'Earlier offer' }],
        nextRevisionId: null
      }
    if (options?.body?.command === 'preview-revision')
      return {
        revisionId: id,
        expectedRevisionId: revisionId,
        design: source(),
        restorable: true,
        blockedReason: null,
        subject: 'Earlier offer',
        previewText: null
      }
    return { assets: [] }
  })
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  vi.unstubAllGlobals()
})
describe('canonical library and history panels', () => {
  it('previews an exact module and emits canonical insert; local edits and sibling pending guards block actions', async () => {
    const ui = await mount(Library)
    const select = ui.host.querySelector<HTMLSelectElement>('[data-label="Module"] select')!
    select.value = id
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(fetcher).toHaveBeenCalledWith(`/api/email/design/modules/${id}/${revisionId}?preview=1`)
    expect(ui.host.querySelector('[data-preview]')).not.toBeNull()
    ui.button('Insert selected version').click()
    expect(ui.actions).toHaveBeenCalledWith({
      command: 'insert-module',
      moduleId: id,
      revisionId,
      parentId: 'root',
      index: 2
    })
    ui.blocked.value = true
    await flush()
    expect(ui.button('Insert selected version').disabled).toBe(true)
    ui.blocked.value = false
    ui.saved.value = false
    await flush()
    expect(ui.button('Insert selected version').disabled).toBe(true)
    expect(ui.host.textContent).toContain('Save local changes first')
  })
  it('hides publication without trusted publisher discovery and uses labelled form fields', async () => {
    const ui = await mount(Library, false)
    expect(ui.host.textContent).not.toContain('Publish full template')
    expect(ui.host.textContent).not.toContain('Publish module')
    expect(ui.host.querySelector('[data-label="Module"]')).not.toBeNull()
    expect(ui.host.querySelector('.overflow-y-auto')).not.toBeNull()
  })
  it('requires another explicit review after the instance update choice changes', async () => {
    const ui = await mount(Library)
    if (ui.flow.draft.value?.state !== 'structured') throw new Error('structured draft required')
    ui.flow.draft.value.source.moduleInstances = [{
      instanceId: 'linked-heading', moduleId: id, revisionId, rootBlockIds: ['heading'], overrides: {}
    }]
    const select = ui.host.querySelector<HTMLSelectElement>('[data-label="Module"] select')!
    select.value = id
    select.dispatchEvent(new Event('change'))
    await flush()
    const review = Array.from(ui.host.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))
      .find(input => input.parentElement?.textContent?.includes('I reviewed the selected version'))!
    review.checked = true
    review.dispatchEvent(new Event('change'))
    await flush()
    expect(ui.button('Update this instance').disabled).toBe(false)
    const choice = ui.host.querySelector<HTMLSelectElement>('[data-label="Local changes when updating"] select')!
    choice.value = 'discard'
    choice.dispatchEvent(new Event('change'))
    await flush()
    expect(ui.button('Update this instance').disabled).toBe(true)
    expect(review.checked).toBe(false)
  })
  it('loads server history and previews before emitting a strict restore selection', async () => {
    const ui = await mount(History)
    const entry = Array.from(ui.host.querySelectorAll('button')).find(b => b.textContent?.includes('Earlier offer'))!
    entry.click()
    await flush()
    expect(fetcher).toHaveBeenLastCalledWith('/api/email/design/history', {
      method: 'POST',
      body: { version: 1, command: 'preview-revision', draftId: id, expectedRevisionId: revisionId, revisionId: id }
    })
    expect(ui.host.querySelector('[data-preview]')).not.toBeNull()
    ui.button('Restore this version').click()
    expect(ui.actions).toHaveBeenCalledWith(id)
    ui.flow.hasPending.value = true
    await flush()
    expect(ui.button('Restore this version').disabled).toBe(true)
  })
})
