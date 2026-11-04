// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- Run production composer functions with isolated external I/O. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, computed, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { vueScriptDeclarations } from '../helpers/vueScriptDeclarations'
import { sameDesignSource } from '../../app/utils/edmDesignEquality'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { figflowTemplateCapability, figflowWorkspaceRoute } from '../../app/utils/edmFigflowLibrary'
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
const functions = (names: string[]) => vueScriptDeclarations(source, names)
const save = functions(['save'])
const design = declarations(['figflowSourceUnsupported', 'canonicalSaved']) + '\n' + functions(['beginFigflow', 'editInFigflow', 'reconcileDesignAction', 'reconnectDesignService'])
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
function mount(realWorkspace = false) {
  const flow = useEdmDesignRoundtrip()
  const args = {
    computed, figflowTemplateCapability, figflowWorkspaceRoute, sameDesignSource, navigateTo: vi.fn(async () => {}), designFlow: flow,
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
  const script = ts.transpile(`${validation}\n${save}\n${design}\n${realWorkspace ? functions(['workspaceSnapshot']) : ''}\nreturn { save, beginFigflow, editInFigflow, reconcileDesignAction, reconnectDesignService, workspaceSnapshot ${capabilityExport} }`, { target: ts.ScriptTarget.ES2022 })
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
  it('routes an unchanged saved draft to its native workspace without PATCH or an inline handoff', async () => {
    const m = mount(true)
    const current = draft()
    current.source.scope.clientId = null
    m.flow.draft.value = current
    m.state.workspaceSavedSnapshot.value = m.state.workspaceSnapshot()
    await m.state.beginFigflow()
    expect(fetch).not.toHaveBeenCalled()
    expect(m.state.navigateTo).toHaveBeenCalledExactlyOnceWith(figflowWorkspaceRoute(id))
    expect(m.flow.draft.value?.headRevisionId).toBe(revision)
    expect(m.state.showFigflow.value).toBe(false)
  })
  it('refuses an existing handoff open at a stale head, retaining local content without overwrite', async () => {
    const m = mount(true)
    const current = draft()
    current.source.scope.clientId = null
    m.flow.draft.value = current
    m.state.workspaceSavedSnapshot.value = m.state.workspaceSnapshot()
    const local = JSON.stringify(m.state.store.document.value)
    fetch.mockRejectedValueOnce({ statusCode: 409, data: { statusMessage: 'REVISION_CONFLICT' } })
    await m.flow.run(() => m.flow.open(id, null, false, { draftId: id, expectedRevisionId: revision })).catch(() => {})
    expect(fetch.mock.calls[0]![1].body).toMatchObject({ command: 'open', expectedRevisionId: revision })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(m.state.store.document.value)).toBe(local)
    expect(m.flow.draft.value?.headRevisionId).toBe(revision)
    expect(m.state.showFigflow.value).toBe(false)
  })

  it.each(['content', 'metadata'] as const)('saves changed %s to the confirmed head before routing to the native workspace', async (field) => {
    const m = mount(true)
    const current = draft()
    current.source.scope.clientId = null
    m.flow.draft.value = current
    m.state.workspaceSavedSnapshot.value = m.state.workspaceSnapshot()
    if (field === 'content') m.state.store.document.value.heading.data.props.text = 'Changed local content'
    else m.state.subject.value = 'Changed local subject'
    const contentHead = '20000000-0000-4000-8000-000000000002'
    const metadataHead = '20000000-0000-4000-8000-000000000003'
    const savedSource = validateEmailDesign({ ...current.source, blocks: m.state.store.document.value })
    const savedContent = { ...current, source: savedSource, headRevisionId: contentHead, projectionRevisionId: contentHead }
    const savedMetadata = { ...savedContent, headRevisionId: metadataHead, projectionRevisionId: metadataHead }
    fetch.mockResolvedValueOnce({ revisionId: contentHead }).mockResolvedValueOnce({ draft: savedContent })
      .mockResolvedValueOnce({ revisionId: metadataHead }).mockResolvedValueOnce({ draft: savedMetadata })
    await m.state.beginFigflow()
    expect(fetch.mock.calls[0]![1].body).toMatchObject({ action: 'save-draft', expectedRevisionId: revision })
    expect(fetch.mock.calls[2]![1].body).toMatchObject({ expectedRevisionId: contentHead, subject: m.state.subject.value })
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(m.state.navigateTo).toHaveBeenCalledExactlyOnceWith(figflowWorkspaceRoute(id))
    expect(fetch.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(2)
    expect(m.state.showFigflow.value).toBe(false)
    expect(m.flow.draft.value?.headRevisionId).toBe(metadataHead)
  })
  it('waits for content and metadata readbacks before navigating to the native workspace', async () => {
    const m = mount(true)
    const current = draft()
    current.source.scope.clientId = null
    m.flow.draft.value = current
    m.state.workspaceSavedSnapshot.value = m.state.workspaceSnapshot()
    m.state.subject.value = 'Unsaved subject'
    const contentReadback = deferred<any>(), metadataReadback = deferred<any>()
    fetch.mockResolvedValueOnce({ revisionId: revision }).mockReturnValueOnce(contentReadback.promise)
      .mockResolvedValueOnce({ revisionId: revision }).mockReturnValueOnce(metadataReadback.promise)
    const entering = m.state.beginFigflow()
    await flush()
    expect(m.state.navigateTo).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
    contentReadback.resolve({ draft: current })
    await flush()
    expect(m.state.navigateTo).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(4)
    metadataReadback.resolve({ draft: current })
    await entering
    expect(m.state.navigateTo).toHaveBeenCalledExactlyOnceWith(figflowWorkspaceRoute(id))
    expect(m.flow.hasPending.value).toBe(false)
    expect(m.flow.handoff.value).toBe(null)
  })

  it('keeps unsaved composer content and refuses navigation when save CAS fails', async () => {
    const m = mount(true)
    const current = draft()
    current.source.scope.clientId = null
    m.flow.draft.value = current
    m.state.workspaceSavedSnapshot.value = m.state.workspaceSnapshot()
    m.state.store.document.value.heading.data.props.text = 'Unsaved local heading'
    fetch.mockRejectedValueOnce({ statusCode: 409, data: { statusMessage: 'REVISION_CONFLICT' } })
    await m.state.beginFigflow()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].body).toMatchObject({ action: 'save-draft', expectedRevisionId: revision })
    expect(m.state.navigateTo).not.toHaveBeenCalled()
    expect(m.state.store.document.value.heading.data.props.text).toBe('Unsaved local heading')
    expect(m.flow.draft.value?.headRevisionId).toBe(revision)
    expect(m.state.showFigflow.value).toBe(false)
  })

  it('does not save or initialize a foreign structured owner', async () => {
    const m = mount(true)
    const current = draft()
    current.source.scope.clientId = null
    current.templateId = '20000000-0000-4000-8000-000000000002'
    m.flow.draft.value = current
    m.state.workspaceSavedSnapshot.value = m.state.workspaceSnapshot()
    await m.state.beginFigflow()
    expect(fetch).not.toHaveBeenCalled()
    expect(m.state.showFigflow.value).toBe(false)
    expect(m.flow.error.value).not.toBe('')
  })
  it('does not call an in-flight open or its readback unconfirmed, and prevents duplicate opens', async () => {
    const m = mount()
    const request = deferred<any>()
    const readback = deferred<any>()
    fetch.mockReturnValueOnce(request.promise).mockReturnValueOnce(readback.promise)
    // A retained composer handoff still uses the canonical flow and toolbar.
    // New entry is tested above as navigation to the dedicated workspace.
    const opening = m.flow.run(() => m.flow.open(id, null))
    await flush()
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(0)
    expect(m.button('Edit in FigFlow').disabled).toBe(true)
    await m.state.beginFigflow()
    expect(fetch).toHaveBeenCalledTimes(1)
    request.resolve({ handoff: handoff() })
    await flush()
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(0)
    readback.resolve({ draft: draft() })
    await opening
    await m.click('Edit in FigFlow')
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
    if (failure === 'transport') fetch.mockRejectedValueOnce(new Error('lost reply'))
    else fetch.mockResolvedValueOnce({ handoff: handoff() }).mockRejectedValueOnce(new Error('readback unavailable'))
    await m.flow.run(() => m.flow.open(id, null)).catch(() => {})
    await flush()
    expect(m.flow.hasPending.value).toBe(true)
    expect(m.errors()).toHaveLength(1)
    const retained = JSON.parse(JSON.stringify(fetch.mock.calls[0][1].body))
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
    fetch.mockRejectedValueOnce({ statusCode: 403 })
    await m.flow.run(() => m.flow.open(id, null)).catch(() => {})
    await flush()
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
    fetch.mockRejectedValueOnce(new Error('lost reply'))
    await m.flow.run(() => m.flow.open(id, null)).catch(() => {})
    await flush()
    const retained = JSON.parse(JSON.stringify(fetch.mock.calls[0][1].body))
    m.state.store.document.value = htmlSource()
    m.state.templateKind.value = 'template'
    await flush()
    expect(m.button('Edit in FigFlow').disabled).toBe(false)
    fetch.mockResolvedValueOnce({ handoff: handoff() }).mockResolvedValueOnce({ draft: draft() })
    await m.click('Edit in FigFlow')
    expect(fetch.mock.calls[1][1].body).toEqual(retained)
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
