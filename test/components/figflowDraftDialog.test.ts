// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- Execute the actual composer entry functions with isolated I/O. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, computed, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'

const source = readFileSync(resolve('app/components/email/builder/EdmFlyhubBuilder.client.vue'), 'utf8')
const begin = source.slice(source.indexOf('async function beginFigflow('), source.indexOf('function sameDesignSource('))
const edit = source.slice(source.indexOf('function editInFigflow()'), source.indexOf('async function proposeFigflow('))
const scriptSource = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1]!
const scriptAst = ts.createSourceFile('builder.ts', scriptSource, ts.ScriptTarget.Latest, true)
// Extract the actual two declarations, not every later composable introduced
// between validation and the client-loader function.
const validation = scriptAst.statements.filter(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => ['hasValidTemplateClient', 'hasValidDesignDraftClient'].includes(declaration.name.getText(scriptAst))))
  .map(statement => statement.getText(scriptAst)).join('\n')
const start = source.lastIndexOf('<UModal', source.indexOf('v-model:open="showDesignDraftCopy"'))
const modal = source.slice(start, source.indexOf('</UModal>', start) + '</UModal>'.length)
const apps: ReturnType<typeof createApp>[] = []
const flush = async () => {
  for (let n = 0; n < 8; n++) await Promise.resolve()
  await nextTick()
}
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
})

async function mount() {
  const designFlow = {
    busy: ref(false), error: ref(''), mode: ref('content'), designerAuthoring: ref({ available: false }), hasPending: ref(false), handoff: ref(null), draft: ref(null),
    open: vi.fn(async () => ({ id: 'handoff' })),
    run: async (action: () => Promise<void>) => {
      designFlow.busy.value = true
      try {
        await action()
      } catch {
        designFlow.error.value = 'Could not confirm action'
      } finally {
        designFlow.busy.value = false
      }
    }
  }
  const args = {
    computed, designFlow, conditionSaving: ref(false), conditionPending: ref(null), brandFlow: { busy: ref(false), hasPending: ref(false) }, saving: ref(false), templateLoading: ref(false), templateLoadError: ref(''),
    figflowSourceUnsupported: ref(false), // Source eligibility is covered by emailComposerSaveWarning.test.ts.
    loadingTemplateClients: ref(false), templateClientsError: ref(false),
    templateClientOptions: ref([{ label: 'Allowed client', value: 'allowed' }, { label: 'Shared default', value: '__shared__' }]),
    templateId: ref<string | null>('library-original'), templateKind: ref('template'),
    name: ref('Geely (copy)'), templateClient: ref<string | undefined>(),
    subject: ref('Subject'), previewText: ref('Preview'), templateFolderName: ref('Automotive'),
    showSaveModal: ref(false), showDesignDraftCopy: ref(false), showFigflow: ref(false),
    designDraftName: ref(''), designDraftClient: ref<string | undefined>(), designDraftError: ref(''), draftCopyUnconfirmed: ref(false),
    designRevisionRequired: ref(false), designServiceUnavailable: ref(false), designLocalConflict: ref(false),
    workspaceSavedSnapshot: ref('original'), workspaceSnapshot: () => 'saved-draft',
    store: { document: ref({ root: { type: 'EmailLayout', data: { childrenIds: [] } } }) },
    apiFetch: vi.fn(async () => ({ template: { id: 'confirmed-draft' } })),
    route: { query: { copy: 'library-original', workspace: 'figflow' } }, router: { replace: vi.fn(async () => {}) },
    save: vi.fn(async () => true), reconcileDesignAction: vi.fn()
  }
  const script = ts.transpile(`${validation}\n${begin}\n${edit}\nreturn { beginFigflow, editInFigflow, hasValidDesignDraftClient }`, { target: ts.ScriptTarget.ES2022 })
  const functions = new Function(...Object.keys(args), script)(...Object.values(args))
  const state = { ...args, ...functions }
  const app = createApp(defineComponent({
    setup: () => state,
    // Render the actual draft modal markup and both relevant open states.
    template: `<UButton label="Edit in FigFlow" @click="editInFigflow" /><UModal :open="showSaveModal" title="Save template" />${modal}`
  }))
  app.component('UModal', defineComponent({
    props: ['open', 'title', 'close'], emits: ['update:open'],
    setup: (p, { slots, emit }) => () => p.open
      ? h('section', { 'role': 'dialog', 'aria-label': p.title }, [
          p.close !== false ? h('button', { 'aria-label': 'Close dialog', 'onClick': () => emit('update:open', false) }, 'Close dialog') : null,
          slots.body?.(), slots.footer?.()
        ])
      : null
  }))
  app.component('UButton', defineComponent({ props: ['label', 'disabled', 'loading'], emits: ['click'], setup: (p, { emit }) => () => h('button', { disabled: p.disabled || p.loading, onClick: () => emit('click') }, p.label) }))
  app.component('UFormField', defineComponent({ props: ['label', 'error'], setup: (p, { slots }) => () => h('label', [p.label, slots.default?.(), p.error]) }))
  app.component('UInput', defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('input', { value: p.modelValue, disabled: p.disabled, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }) }))
  app.component('USelect', defineComponent({ props: ['modelValue', 'disabled', 'items'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('select', { value: p.modelValue, disabled: p.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLSelectElement).value) }, p.items.map((o: any) => h('option', { value: o.value }, o.label))) }))
  app.component('UAlert', defineComponent({ props: ['title'], setup: p => () => h('p', { role: 'alert' }, p.title) }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  apps.push(app)
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === label)!
  const click = async (label: string) => {
    button(label).click()
    await flush()
  }
  return { state, host, button, click }
}

describe('composer Create a design draft dialog', () => {
  it('keeps the required client reachable in one dialog, then creates and opens only the independent draft', async () => {
    const { state: s, host, button, click } = await mount()
    s.showSaveModal.value = true
    await click('Edit in FigFlow')
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(host.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('Create a design draft')
    expect(host.textContent).toContain('Draft name')
    expect(host.querySelector('input')!.value).toBe('Geely (copy) (design draft)')
    expect(host.querySelector('select')).not.toBeNull()
    expect(button('Create draft and open FigFlow').disabled).toBe(true)
    await s.beginFigflow(true) // Invalid direct submission also stays in this dialog.
    expect(s.showSaveModal.value).toBe(false)
    expect(s.apiFetch).not.toHaveBeenCalled()
    expect(s.designDraftError.value).toContain('choose an available client')
    const client = host.querySelector('select')!
    client.value = 'allowed'
    client.dispatchEvent(new Event('change'))
    await flush()
    expect(button('Create draft and open FigFlow').disabled).toBe(false)
    await click('Create draft and open FigFlow')
    expect(s.apiFetch).toHaveBeenCalledExactlyOnceWith('/api/email/templates', expect.objectContaining({
      method: 'POST', body: expect.objectContaining({ name: 'Geely (copy) (design draft)', client_id: 'allowed', template_kind: 'draft', subject: 'Subject', preview_text: 'Preview', folder_name: 'Automotive', body_source: s.store.document.value })
    }))
    expect(s.save).not.toHaveBeenCalled()
    expect(s.designFlow.open).toHaveBeenCalledExactlyOnceWith('confirmed-draft', 'allowed', false)
    expect(s.router.replace.mock.calls[0][0]).toEqual({ query: { id: 'confirmed-draft', workspace: 'figflow' } })
    expect(s.showDesignDraftCopy.value).toBe(false)
    expect(s.showSaveModal.value).toBe(false)
  })

  it('leaves composer metadata and the original template identity intact when cancelled', async () => {
    const { state: s, host, click } = await mount()
    s.templateClient.value = 'allowed'
    await click('Edit in FigFlow')
    const input = host.querySelector('input')!
    input.value = 'Different draft'
    input.dispatchEvent(new Event('input'))
    s.designDraftClient.value = '__shared__'
    await click('Cancel')
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(0)
    expect(s.templateId.value).toBe('library-original')
    expect(s.name.value).toBe('Geely (copy)')
    expect(s.templateClient.value).toBe('allowed')
    expect(s.apiFetch).not.toHaveBeenCalled()
    expect(s.save).not.toHaveBeenCalled()
  })

  it.each(['', 'foreign'])('never opens Save or writes for missing/unauthorized client %s', async (client) => {
    const { state: s, click } = await mount()
    await click('Edit in FigFlow')
    s.designDraftClient.value = client
    await s.beginFigflow(true)
    expect(s.showDesignDraftCopy.value).toBe(true)
    expect(s.showSaveModal.value).toBe(false)
    expect(s.draftCopyUnconfirmed.value).toBe(false)
    expect(s.apiFetch).not.toHaveBeenCalled()
  })

  it('blocks unavailable choices and invalid names before any write, and accepts an explicit shared destination', async () => {
    const { state: s, click } = await mount()
    await click('Edit in FigFlow')
    s.designDraftClient.value = '__shared__'
    for (const field of [s.loadingTemplateClients, s.templateClientsError]) {
      field.value = true
      await s.beginFigflow(true)
      field.value = false
    }
    for (const name of ['', ' '.repeat(4), 'a'.repeat(201)]) {
      s.designDraftName.value = name
      await s.beginFigflow(true)
    }
    expect(s.apiFetch).not.toHaveBeenCalled()
    expect(s.showSaveModal.value).toBe(false)
    s.designDraftName.value = ' Shared draft '
    await s.beginFigflow(true)
    expect(s.apiFetch.mock.calls[0][1].body).toMatchObject({ name: 'Shared draft', client_id: null })
    expect(s.designFlow.open).toHaveBeenCalledWith('confirmed-draft', null, false)
  })

  it.each([400, 403])('allows correction after a definite %s rejection without opening Save', async (status) => {
    const { state: s, host, click } = await mount()
    await click('Edit in FigFlow')
    s.designDraftClient.value = 'allowed'
    const failure = status === 400 ? { statusCode: status } : { status }
    s.apiFetch.mockRejectedValueOnce(failure)
    await s.beginFigflow(true)
    await flush()
    expect(s.draftCopyUnconfirmed.value).toBe(false)
    expect(s.templateId.value).toBe('library-original')
    expect(s.showSaveModal.value).toBe(false)
    expect(s.showDesignDraftCopy.value).toBe(true)
    expect(host.textContent).toContain('The draft was rejected')
    expect(host.querySelector('input')!.disabled).toBe(false)
    expect(host.querySelector('select')!.disabled).toBe(false)
    expect(s.designFlow.open).not.toHaveBeenCalled()
    s.designDraftName.value = 'Corrected draft'
    await s.beginFigflow(true)
    expect(s.apiFetch).toHaveBeenCalledTimes(2)
    expect(s.designFlow.open).toHaveBeenCalledExactlyOnceWith('confirmed-draft', 'allowed', false)
    expect(s.templateId.value).toBe('confirmed-draft')
  })

  it('prevents duplicate creates while pending and after an uncertain response', async () => {
    const { state: s, host, click, button } = await mount()
    await click('Edit in FigFlow')
    s.designDraftClient.value = 'allowed'
    let reject!: (error: Error) => void
    s.apiFetch.mockImplementationOnce(() => new Promise((_, fail) => {
      reject = fail
    }))
    const pending = s.beginFigflow(true)
    await flush()
    expect(button('Cancel').disabled).toBe(true)
    expect(host.querySelector('[aria-label="Close dialog"]')).toBeNull()
    await s.beginFigflow(true)
    expect(s.apiFetch).toHaveBeenCalledTimes(1)
    reject(new Error('Lost reply'))
    await pending
    await flush()
    await s.beginFigflow(true)
    expect(s.apiFetch).toHaveBeenCalledTimes(1)
    expect(s.showSaveModal.value).toBe(false)
    expect(button('Create draft and open FigFlow').disabled).toBe(true)
    expect(host.querySelector('[aria-label="Close dialog"]')).not.toBeNull()
  })
})
