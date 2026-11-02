// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { figflowTemplateCapability } from '../../app/utils/edmFigflowLibrary'
import { structuredDesign } from '../fixtures/email-design/structured'

const source = readFileSync('app/components/email/builder/EdmFlyhubBuilder.client.vue', 'utf8')
const { descriptor } = parse(source)
// Render the actual toolbar/admission/recovery controls without mounting unrelated
// campaign, asset, drag/drop and test-send surfaces or invoking their services.
const controls = [
  ...descriptor.template!.content.matchAll(/<UButton\b[\s\S]*?\/>/g),
  ...descriptor.template!.content.matchAll(/<UAlert\b[\s\S]*?\/>/g)
].map(match => match[0]).filter(node =>
  node.includes('label="Edit in FigFlow"') || node.includes('designFlow.error.value') || node.includes('figflowSourceUnsupported')
).join('\n')
const render = new Function('Vue', compile(`<div>${controls}</div>`, { prefixIdentifiers: true }).code)(Vue)
const script = ts.createSourceFile('composer.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const capabilityDeclarations = script.statements.filter(statement =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
    ts.isIdentifier(declaration.name) && declaration.name.text === 'figflowSourceUnsupported'
  )
).map(statement => statement.getText(script)).join('\n')
const begin = source.slice(source.indexOf('async function beginFigflow('), source.indexOf('function sameDesignSource('))
const edit = source.slice(source.indexOf('function editInFigflow()'), source.indexOf('async function proposeFigflow('))
let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
async function flush() {
  await Promise.resolve()
  await Vue.nextTick()
}
function fixture(blocks = structuredDesign().blocks) {
  const flow = useEdmDesignRoundtrip()
  const state = {
    designFlow: flow, store: { document: Vue.ref(blocks) }, computed: Vue.computed, figflowTemplateCapability,
    saving: Vue.ref(false), showFigflow: Vue.ref(false), workspaceBusy: Vue.computed(() => flow.busy.value || flow.hasPending.value),
    figflowEnabled: true, campaignId: Vue.ref(null), templateLoading: Vue.ref(false), templateLoadError: Vue.ref(''),
    conditionSaving: Vue.ref(false), conditionPending: Vue.ref(null), brandFlow: { busy: Vue.ref(false), hasPending: Vue.ref(false) },
    templateId: Vue.ref('10000000-0000-4000-8000-000000000003'), templateKind: Vue.ref('draft'),
    hasValidTemplateClient: Vue.ref(true), name: Vue.ref('Synthetic draft'), showSaveModal: Vue.ref(false),
    templateClient: Vue.ref('__shared__'), save: vi.fn(async () => true), toast: { add: vi.fn() },
    reconcileDesignAction: vi.fn(async () => {}), showDesignDraftCopy: Vue.ref(false),
    designRevisionRequired: Vue.ref(false), designServiceUnavailable: Vue.ref(false), designLocalConflict: Vue.ref(false),
    route: { query: {} }, router: { replace: vi.fn(async () => {}) }
  }
  const derived = new Function(...Object.keys(state), `${ts.transpile(capabilityDeclarations)}; return { ${capabilityDeclarations ? 'figflowSourceUnsupported' : ''} };`)(...Object.values(state))
  const args = { ...state, ...derived }
  const actions = new Function(...Object.keys(args), `${ts.transpile(begin + edit)}; return { beginFigflow, editInFigflow };`)(...Object.values(args))
  const reconcile = vi.fn()
  const app = Vue.createApp({ setup: () => ({ ...args, ...actions, reconcileDesignAction: reconcile }), render })
  app.component('UButton', {
    props: ['label', 'disabled', 'loading'],
    template: '<button :disabled="disabled || loading">{{ label }}</button>'
  })
  app.component('UAlert', {
    props: ['title', 'description', 'actions', 'color'],
    template: '<div role="alert" :data-color="color">{{ title }} {{ description }}<button v-for="action in actions" @click="action.onClick">{{ action.label }}</button></div>'
  })
  const host = document.createElement('div')
  app.mount(host)
  dispose = () => app.unmount()
  vi.stubGlobal('$fetch', vi.fn(async (_url, options) => options.body.command === 'lookup'
    ? { draft: { headRevisionId: 'revision-one' } }
    : { handoff: { id: 'handoff-one', templateId: state.templateId.value, baseRevisionId: 'revision-one' } }))
  return { ...state, ...actions, host, reconcile }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const legacy = {
  'root': { type: 'EmailLayout', data: { childrenIds: ['imported', 'xeroflow-footer'] } },
  'imported': { type: 'Html', data: { props: { contents: '<h1>Synthetic imported email</h1>' } } },
  'xeroflow-footer': { type: 'Html', data: { props: { contents: '<p>Footer</p>' } } }
} as ReturnType<typeof structuredDesign>['blocks']

describe('composer distinguishes active saves from unconfirmed outcomes', () => {
  it('keeps normal open and exact revision readback free of the red warning, then exposes uncertain recovery', async () => {
    const h = fixture()
    const mutation = deferred<unknown>(), readback = deferred<unknown>()
    const fetch = vi.fn().mockReturnValueOnce(mutation.promise).mockReturnValueOnce(readback.promise)
    vi.stubGlobal('$fetch', fetch)
    const action = h.designFlow.run(() => h.designFlow.open(h.templateId.value, null)).catch(() => {})
    await flush()
    expect(h.designFlow.hasPending.value).toBe(true)
    expect(h.host.querySelector('[data-color="error"]')).toBe(null)
    mutation.resolve({ handoff: { templateId: h.templateId.value, baseRevisionId: 'revision-one' } })
    await flush()
    expect(h.designFlow.busy.value).toBe(true)
    expect(h.host.querySelector('[data-color="error"]')).toBe(null)
    readback.reject(new Error('readback unavailable'))
    await action
    await flush()
    expect(h.host.textContent).toContain('Reconcile saved action')
    expect(h.host.querySelector('[data-color="error"]')).not.toBe(null)
    const original = JSON.parse(JSON.stringify(fetch.mock.calls[0]))
    fetch.mockResolvedValueOnce({ handoff: { templateId: h.templateId.value, baseRevisionId: 'revision-one' } })
      .mockResolvedValueOnce({ draft: { headRevisionId: 'revision-one' } })
    await h.designFlow.run(() => h.designFlow.reconcile())
    await flush()
    expect(fetch.mock.calls[2]).toEqual(original)
    expect(h.designFlow.hasPending.value).toBe(false)
    expect(h.host.querySelector('[data-color="error"]')).toBe(null)
  })
  it('hides the warning during ordinary direct saves but keeps the duplicate-write lock and recovery action', async () => {
    const h = fixture()
    h.saving.value = true
    h.designFlow.hasPending.value = true
    await flush()
    expect(h.host.querySelector('[data-color="error"]')).toBe(null)
    expect(h.host.querySelector('button')!.disabled).toBe(true)
    h.saving.value = false
    await flush()
    expect(h.host.textContent).toContain('The last save is unconfirmed')
    Array.from(h.host.querySelectorAll('button')).find(button => button.textContent === 'Reconcile saved action')!.click()
    expect(h.reconcile).toHaveBeenCalledOnce()
  })
  it('admits supported structured content and shows an enabled FigFlow control', async () => {
    const h = fixture()
    expect(h.host.querySelector('button')!.disabled).toBe(false)
    expect(h.host.querySelector('[data-color="info"]')).toBe(null)
    await h.beginFigflow()
    expect(h.save).toHaveBeenCalledOnce()
    expect(h.showFigflow.value).toBe(true)
    expect(h.designFlow.error.value).toBe('')
  })
  it('explains imported HTML before disabling open and refuses direct/automatic open without saving a copy', async () => {
    const h = fixture(legacy)
    expect(h.host.textContent).toContain('composer')
    expect(h.host.textContent).toContain('Imported HTML')
    expect(h.host.querySelector('button')!.disabled).toBe(true)
    await h.beginFigflow(true)
    expect(h.designFlow.error.value).toBe('')
    expect(h.designFlow.busy.value).toBe(false)
    h.templateKind.value = 'template'
    h.editInFigflow()
    expect(h.showDesignDraftCopy.value).toBe(false)
    expect(h.save).not.toHaveBeenCalled()
  })
  it.each([false, true])('preserves the stored zero-field policy and server designer admission=%s', async (designer) => {
    const h = fixture()
    const design = structuredDesign()
    design.policy.editableFields = []
    h.designFlow.draft.value = { state: 'structured', documentId: crypto.randomUUID(), templateId: h.templateId.value,
      headRevisionId: crypto.randomUUID(), projectionRevisionId: null, source: design as never, projection: { state: 'current' } }
    h.designFlow.designerAuthoring.value.available = designer
    await flush()
    expect(h.host.querySelector('button')!.disabled).toBe(!designer)
    await h.beginFigflow()
    expect(h.save.mock.calls.length).toBe(designer ? 1 : 0)
    expect(h.showFigflow.value).toBe(designer)
  })
  it('never blocks an already server-authorized designer because the blocks are imported HTML', async () => {
    const h = fixture(legacy)
    h.designFlow.designerAuthoring.value.available = true
    await flush()
    expect(h.host.querySelector('button')!.disabled).toBe(false)
    expect(h.host.querySelector('[data-color="info"]')).toBe(null)
    await h.beginFigflow()
    expect(h.save).toHaveBeenCalledOnce()
    expect(h.showFigflow.value).toBe(true)
    expect(h.designFlow.mode.value).toBe('designer')
  })
  it('keeps an existing no-content handoff reopenable for review', async () => {
    const h = fixture(legacy)
    h.designFlow.handoff.value = { id: 'existing-handoff', state: 'open' } as never
    await flush()
    expect(h.host.querySelector('button')!.disabled).toBe(false)
    h.host.querySelector('button')!.click()
    await flush()
    expect(h.showFigflow.value).toBe(true)
    expect(h.save).not.toHaveBeenCalled()
  })
})
