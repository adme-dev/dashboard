// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- Run production composer functions with isolated external I/O. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, computed, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { figflowTemplateCapability } from '../../app/utils/edmFigflowLibrary'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const source = readFileSync(resolve('app/components/email/builder/EdmFlyhubBuilder.client.vue'), 'utf8')
// Mount the real toolbar/recovery markup and execute the real save/open/recovery
// functions. Only Nuxt UI rendering and network/navigation I/O are substituted.
const toolbar = [...source.matchAll(/<UButton\b[\s\S]*?\/>|<UAlert\b[\s\S]*?\/>/g)]
  .map(match => match[0]).filter(node => node.includes('label="Edit in FigFlow"') || node.includes('designFlow.error.value') || node.includes('figflowSourceUnsupported')).join('\n')
const ast = ts.createSourceFile('composer.ts', source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1]!, ts.ScriptTarget.Latest, true)
const declarations = (names: string[]) => ast.statements.filter(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(ast))))
  .map(statement => statement.getText(ast)).join('\n')
const validation = declarations(['hasValidTemplateClient', 'hasValidDesignDraftClient'])
const functions = (names: string[]) => ast.statements.filter(statement => ts.isFunctionDeclaration(statement)
  && statement.name && names.includes(statement.name.text)).map(statement => statement.getText(ast)).join('\n')
const save = functions(['save'])
const design = declarations(['figflowSourceUnsupported']) + '\n' + functions(['beginFigflow', 'editInFigflow', 'reconcileDesignAction', 'reconnectDesignService'])
const fetch = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const id = '10000000-0000-4000-8000-000000000001'
const revision = '20000000-0000-4000-8000-000000000001'
const documentSource = () => validateEmailDesign(structuredDesign())
const draft = () => ({ state: 'structured' as const, templateId: id, documentId: id, headRevisionId: revision, projectionRevisionId: revision, projection: { state: 'current' as const }, source: documentSource() })
const handoff = () => ({ id, draftId: id, templateId: id, baseRevisionId: revision, state: 'open' as const, source: documentSource(), proposal: null, proposalRevisionId: null, appliedRevisionId: null, expiresAt: '2026-11-03T00:00:00Z', editorUrl: 'https://creative.xeroflow.io/figflow/0.11.2-edm1/' })
const htmlSource = () => ({ root: { type: 'EmailLayout', data: { childrenIds: ['html'] } }, html: { type: 'Html', data: { props: { documentMode: 'email', contents: '<html><body>Geely source</body></html>' } } } })
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve()
  await nextTick()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function mount() {
  const flow = useEdmDesignRoundtrip()
  const args = {
    computed, figflowTemplateCapability, designFlow: flow,
    conditionSaving: ref(false), conditionPending: ref(null), brandFlow: { busy: ref(false), hasPending: ref(false), error: ref('') },
    libraryBaseline: null, acceptLibraryAction: vi.fn(),
    saving: ref(false), templateLoading: ref(false), templateLoadError: ref(''),
    loadingTemplateClients: ref(false), templateClientsError: ref(false), templateClientOptions: ref([{ label: 'Shared default', value: '__shared__' }]),
    templateId: ref<string | null>(id), templateKind: ref('draft'), templateClient: ref('__shared__'),
    name: ref('Independent draft'), subject: ref('Subject'), previewText: ref('Preview'), templateFolderName: ref('Automotive'), campaignId: ref(null),
    showSaveModal: ref(false), showDesignDraftCopy: ref(false), showFigflow: ref(false), showDiscardFigflow: ref(false),
    designDraftName: ref('Design copy'), designDraftClient: ref('__shared__'), designDraftError: ref(''), draftCopyUnconfirmed: ref(false),
    designRevisionRequired: ref(false), designServiceUnavailable: ref(false), designLocalConflict: ref(false), loadedDesignRevisionId: ref(null),
    store: { document: ref<any>(documentSource().blocks), canUndo: ref(false), canRedo: ref(false), applyDesignReturn: vi.fn(() => true) },
    apiFetch: fetch, route: { query: { id, workspace: 'figflow' } }, router: { replace: vi.fn(async () => {}) },
    toast: { add: vi.fn() }, workspaceLeave: { saving: ref(false) }, workspaceSavedSnapshot: ref('original'), workspaceSnapshot: () => 'saved', markWorkspaceDocumentSaved: vi.fn(),
    saveCampaignContent: vi.fn(), figflowEnabled: true, viewMode: ref('editor'), activeDevice: ref('desktop'), VIEW_TABS: [], DEVICE_TABS: []
  }
  const capabilityExport = source.includes('const figflowSourceUnsupported =') ? ', figflowSourceUnsupported' : ''
  const script = ts.transpile(`${validation}\n${save}\n${design}\nreturn { save, beginFigflow, editInFigflow, reconcileDesignAction, reconnectDesignService ${capabilityExport} }`, { target: ts.ScriptTarget.ES2022 })
  const state = { ...args, ...new Function(...Object.keys(args), script)(...Object.values(args)) }
  const app = createApp(defineComponent({ setup: () => state, template: `<div>${toolbar}</div>` }))
  app.component('UBadge', defineComponent({ setup: () => () => h('span') }))
  app.component('UButton', defineComponent({ props: ['label', 'disabled', 'loading'], emits: ['click'], setup: (p, { emit }) => () => h('button', { disabled: p.disabled || p.loading, onClick: () => emit('click') }, p.label) }))
  app.component('UAlert', defineComponent({ props: ['title', 'description', 'color', 'actions'], setup: p => () => h('section', { 'role': 'alert', 'data-color': p.color }, [p.title, p.description, ...(p.actions || []).map((action: any) => h('button', { onClick: action.onClick }, action.label))]) }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  apps.push(app)
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === label)!
  return { state, flow, host, button, click: async (label: string) => {
    button(label).click()
    await flush()
  }, errors: () => host.querySelectorAll('[data-color="error"]') }
}
beforeEach(() => {
  fetch.mockReset()
  vi.stubGlobal('$fetch', fetch)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('live FigFlow composer save and source admission', () => {
  it('does not call an in-flight open or its readback unconfirmed, and prevents duplicate opens', async () => {
    const m = mount()
    const request = deferred<any>()
    const readback = deferred<any>()
    fetch.mockResolvedValueOnce({}).mockReturnValueOnce(request.promise).mockReturnValueOnce(readback.promise)
    await m.click('Edit in FigFlow')
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(0)
    expect(m.button('Edit in FigFlow').disabled).toBe(true)
    await m.state.beginFigflow()
    expect(fetch).toHaveBeenCalledTimes(2)
    request.resolve({ handoff: handoff() })
    await flush()
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(0)
    readback.resolve({ draft: draft() })
    await flush()
    expect(m.flow.hasPending.value).toBe(false)
    expect(m.state.showFigflow.value).toBe(true)
    expect(m.errors()).toHaveLength(0)
  })

  it('keeps structured content and metadata saves quiet until their exact readbacks finish', async () => {
    const m = mount()
    m.flow.draft.value = draft()
    const contentRead = deferred<any>()
    const metadataRead = deferred<any>()
    fetch.mockResolvedValueOnce({ revisionId: revision }).mockReturnValueOnce(contentRead.promise)
      .mockResolvedValueOnce({ revisionId: revision }).mockReturnValueOnce(metadataRead.promise)
    const saving = m.state.save()
    await flush()
    expect(m.state.saving.value).toBe(true)
    expect(m.flow.busy.value).toBe(false)
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(0)
    contentRead.resolve({ draft: draft() })
    await flush()
    expect(fetch.mock.calls[2][0]).toContain('/metadata')
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(0)
    metadataRead.resolve({ draft: draft() })
    expect(await saving).toBe(true)
    await flush()
    expect(m.flow.hasPending.value).toBe(false)
    expect(m.errors()).toHaveLength(0)
  })

  it.each(['transport', 'readback'])('exposes recovery after %s failure and replays only the retained operation', async (failure) => {
    const m = mount()
    const before = JSON.stringify(m.state.store.document.value)
    fetch.mockResolvedValueOnce({})
    if (failure === 'transport') fetch.mockRejectedValueOnce(new Error('lost reply'))
    else fetch.mockResolvedValueOnce({ handoff: handoff() }).mockRejectedValueOnce(new Error('readback unavailable'))
    await m.click('Edit in FigFlow')
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(1)
    const retained = JSON.parse(JSON.stringify(fetch.mock.calls[1][1].body))
    const count = fetch.mock.calls.length
    expect(await m.state.save()).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(count)
    const retry = deferred<any>()
    fetch.mockReturnValueOnce(retry.promise).mockResolvedValueOnce({ draft: draft() })
    await m.click('Reconcile saved action')
    expect(m.errors()).toHaveLength(0)
    expect(fetch.mock.calls[count][1].body).toEqual(retained)
    retry.resolve({ handoff: handoff() })
    await flush()
    expect(m.flow.hasPending.value).toBe(false)
    expect(m.state.showFigflow.value).toBe(true)
    expect(JSON.stringify(m.state.store.document.value)).toBe(before)
  })

  it('keeps a definite rejection visible when idle without offering a retained-write retry', async () => {
    const m = mount()
    fetch.mockResolvedValueOnce({}).mockRejectedValueOnce({ statusCode: 403 })
    await m.click('Edit in FigFlow')
    expect(m.errors()).toHaveLength(1)
    expect(m.flow.hasPending.value).toBe(false)
    expect(m.host.textContent).toContain('design access')
    expect(m.button('Reconcile saved action')).toBeUndefined()
  })

  it.each(['content', 'metadata'])('shows an idle unknown %s save and retains its receipt through recovery', async (kind) => {
    const m = mount()
    m.flow.draft.value = draft()
    if (kind === 'metadata') fetch.mockResolvedValueOnce({ revisionId: revision }).mockResolvedValueOnce({ draft: draft() })
    fetch.mockResolvedValueOnce({ revisionId: revision }).mockRejectedValueOnce(new Error('lost readback'))
    expect(await m.state.save()).toBe(false)
    await flush()
    expect(m.state.saving.value).toBe(false)
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(1)
    expect(m.host.textContent).toContain('last save is unconfirmed')
    const retained = JSON.parse(JSON.stringify(fetch.mock.calls.at(-2)![1].body))
    fetch.mockResolvedValueOnce({ revisionId: revision }).mockResolvedValueOnce({ draft: draft() })
    await m.click('Reconcile saved action')
    expect(fetch.mock.calls.at(-2)![1].body).toEqual(retained)
    expect(m.flow.hasPending.value).toBe(false)
    expect(m.errors()).toHaveLength(0)
  })

  it('keeps receipt recovery reachable when local source becomes unsupported after an unknown open', async () => {
    const m = mount()
    fetch.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('lost reply'))
    await m.click('Edit in FigFlow')
    const retained = JSON.parse(JSON.stringify(fetch.mock.calls[1][1].body))
    m.state.store.document.value = htmlSource()
    m.state.templateKind.value = 'template'
    await flush()
    expect(m.button('Edit in FigFlow').disabled).toBe(false)
    fetch.mockResolvedValueOnce({ handoff: handoff() }).mockResolvedValueOnce({ draft: draft() })
    await m.click('Edit in FigFlow')
    expect(fetch.mock.calls[2][1].body).toEqual(retained)
    expect(m.flow.hasPending.value).toBe(false)
    expect(m.state.showDesignDraftCopy.value).toBe(false)
    expect(m.state.showFigflow.value).toBe(true)
  })

  it('guides HTML-only source to the composer before creating a copy or starting native editing', async () => {
    const m = mount()
    m.state.store.document.value = htmlSource()
    m.state.templateKind.value = 'template'
    await flush()
    const before = JSON.stringify(m.state.store.document.value)
    expect(m.host.textContent).toContain('Continue editing this source in the composer')
    expect(m.button('Edit in FigFlow').disabled).toBe(true)
    m.state.editInFigflow()
    await m.state.beginFigflow(true)
    expect(m.state.showDesignDraftCopy.value).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(m.state.store.document.value)).toBe(before)
    fetch.mockResolvedValueOnce({})
    expect(await m.state.save()).toBe(true)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/email/templates/${id}`, expect.objectContaining({
      method: 'PATCH', body: expect.objectContaining({ body_source: m.state.store.document.value })
    }))
  })

  it.each(['open', 'proposed'] as const)('allows reopening an existing %s handoff even with HTML-only composer source', async (state) => {
    const m = mount()
    m.state.store.document.value = htmlSource()
    m.flow.handoff.value = { ...handoff(), state }
    await flush()
    expect(m.button('Edit in FigFlow').disabled).toBe(false)
    await m.click('Edit in FigFlow')
    expect(m.state.showFigflow.value).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the stored versioned policy instead of inferring new permission from composer blocks', async () => {
    const m = mount()
    const versioned = draft()
    versioned.source.policy.editableFields = []
    m.flow.draft.value = versioned
    await flush()
    expect(m.button('Edit in FigFlow').disabled).toBe(true)
    await m.state.beginFigflow()
    expect(fetch).not.toHaveBeenCalled()
    // Existing permitted policy is authoritative even when the local projection
    // is not admissible as a new conversion; the server still authorizes open.
    m.flow.draft.value = draft()
    m.state.store.document.value = htmlSource()
    await flush()
    expect(m.button('Edit in FigFlow').disabled).toBe(false)
  })
})
