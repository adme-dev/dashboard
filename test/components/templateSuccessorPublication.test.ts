// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createApp, computed, h, nextTick, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import Panel from '../../app/components/email/builder/EdmDesignLibraryPanel.vue'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { applyModuleInstance, extractDesignModule, type ModuleRecord } from '../../shared/emailRendering/designModules'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const client = '10000000-0000-4000-8000-000000000001'
const documentId = '20000000-0000-4000-8000-000000000001'
const sourceHead = '30000000-0000-4000-8000-000000000001'
const target = '40000000-0000-4000-8000-000000000001'
const targetDocument = '50000000-0000-4000-8000-000000000001'
const r1 = '60000000-0000-4000-8000-000000000001'
const r2 = '60000000-0000-4000-8000-000000000002'
const published = (extra: Record<string, unknown> = {}) => ({ id: target, design_document_id: targetDocument, name: 'Published offer', client_id: client, template_kind: 'template', revision_schema_version: 1, head_revision_id: r1, folder_name: 'Offers', ...extra })
const fetch = vi.fn()
let dispose: (() => void) | undefined
const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
afterEach(() => {
  dispose?.()
  document.body.innerHTML = ''
  fetch.mockReset()
  vi.unstubAllGlobals()
})

async function mount(scope: string | null = client, publisher = true, withOverride = false) {
  let source = validateEmailDesign({ ...structuredDesign(), kind: scope === null ? 'template' : 'campaign-draft', scope: { clientId: scope } })
  let record: ModuleRecord | null = null
  let overridePath = ''
  if (withOverride) {
    record = { moduleId: '70000000-0000-4000-8000-000000000001', revisionId: '80000000-0000-4000-8000-000000000001', design: extractDesignModule(source, ['heading'], [], []) }
    source = applyModuleInstance(source, { version: 1, command: 'insert-module', operationId: '90000000-0000-4000-8000-000000000001', draftId: documentId, expectedDraftRevisionId: sourceHead, moduleId: record.moduleId, revisionId: record.revisionId, parentId: 'root', index: 1 }, [record])
    const root = source.moduleInstances[0]!.rootBlockIds[0]!
    source.blocks[root].data.props!.text = 'Explicit local heading override'
    overridePath = `${root}.data.props.text`
  }
  const flow = useEdmDesignRoundtrip()
  flow.draft.value = { owner: { kind: scope === null ? 'template' : 'campaign', id: client }, state: 'structured', documentId, headRevisionId: sourceHead, projectionRevisionId: sourceHead, baseTemplateRevisionId: null, metadata: { subject: 'Saved offer', previewText: 'Saved preheader' }, source, projection: { state: 'current' } }
  flow.libraryAuthoring.value = { available: true, publisher }
  const saved = ref(true), blocked = ref(false), document = ref(JSON.parse(JSON.stringify(source.blocks)))
  const initial = JSON.stringify(document.value)
  const toast = { add: vi.fn() }, apply = vi.fn()
  const ctx = { campaignId: ref(client), designFlow: flow, canonicalReady: computed(() => saved.value && !blocked.value && !flow.busy.value && !flow.hasPending.value), nativeLibrary: flow.nativeLibrary,
    workspaceSnapshot: () => JSON.stringify(document.value), workspaceSavedSnapshot: ref(initial), store: { document, applyDesignReturn: apply, setBrandSnapshot: vi.fn() },
    designLocalConflict: ref(false), loadedDesignRevisionId: ref(sourceHead), subject: ref('Saved offer'), previewText: ref('Saved preheader'), customModules: { load: async () => {} }, toast, reopenNativeLibrary: vi.fn() }
  const builder = readFileSync('app/components/email/builder/EdmFlyhubBuilder.client.vue', 'utf8')
  const ast = ts.createSourceFile('builder.ts', builder.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1], ts.ScriptTarget.Latest, true)
  const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['publishCanonicalTemplate', 'executeLibraryAction', 'acceptLibraryAction', 'reconcileDesignAction'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n')
  const handlers = new Function(...Object.keys(ctx), ts.transpile('let libraryBaseline = null;\n' + declarations + '\nreturn { publishCanonicalTemplate, reconcileDesignAction }', { target: ts.ScriptTarget.ES2022 }))(...Object.values(ctx))
  const adapter = handlers.publishCanonicalTemplate
  let catalog = [published()]
  let publication: (body: Record<string, unknown>) => Promise<unknown> = async () => ({ published: true, templateId: target, documentId: targetDocument, revisionId: r2 })
  let immutableReadback = async (templateId: string, revisionId: string) => ({ templateId, revisionId })
  let preview = async () => ({ draftId: documentId, revisionId: sourceHead, expectedRevisionId: sourceHead, design: source, previewHtml: '<p>Compiled saved offer</p>', subject: 'Saved offer', previewText: 'Saved preheader' })
  fetch.mockImplementation(async (url: string, options?: { body: Record<string, unknown> }) => {
    if (url === '/api/agency/email/modules') return { items: [] }
    if (url === '/api/email/templates') return { items: catalog }
    if (url === '/api/email/design/history') return preview()
    if (record && url === `/api/email/design/modules/${record.moduleId}/${record.revisionId}`) return record
    if (url === '/api/email/design/templates') return publication(options!.body)
    if (url.startsWith('/api/email/design/templates/')) {
      const [templateId, revisionId] = url.split('/').slice(-2)
      return immutableReadback(templateId!, revisionId!)
    }
    throw new Error('Unexpected fixture I/O: ' + url)
  })
  vi.stubGlobal('$fetch', fetch)
  const states = new Map<string, ReturnType<typeof ref>>()
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(init()))
    return states.get(key)
  })
  const host = window.document.createElement('div'), app = createApp({ render: () => h(Panel, { flow, saved: saved.value, blocked: blocked.value, selectedId: null, initialSection: 'template', onPublishTemplate: adapter, onReconcileTemplate: handlers.reconcileDesignAction }) })
  const stub = (props: string[], template: string, emits: string[] = []) => ({ props, template, emits })
  app.component('UFormField', stub(['label'], '<label :data-label="label">{{label}}<slot /></label>'))
  app.component('UInput', stub(['modelValue', 'disabled'], '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">', ['update:modelValue']))
  app.component('UTextarea', stub(['modelValue', 'disabled'], '<textarea :disabled="disabled" :value="modelValue" />'))
  app.component('USelect', stub(['modelValue', 'items', 'disabled'], '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{item.label}}</option></select>', ['update:modelValue']))
  app.component('UCheckbox', stub(['modelValue', 'label', 'disabled'], '<label><input type="checkbox" :disabled="disabled" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">{{label}}</label>', ['update:modelValue']))
  app.component('UButton', stub(['label', 'disabled', 'loading'], '<button :disabled="disabled || loading">{{label}}</button>'))
  app.component('UAlert', stub(['title', 'description'], '<p role="alert">{{title}} {{description}}</p>'))
  app.component('EmailBuilderEdmDocumentThumbnail', { render: () => null })
  app.component('EmailBuilderEdmImageLibraryPicker', { render: () => null })
  app.mount(host)
  dispose = () => app.unmount()
  await flush()
  const control = (label: string) => host.querySelector<HTMLSelectElement | HTMLInputElement>(`[data-label="${label}"] select, [data-label="${label}"] input`)!
  const change = async (label: string, value: string) => {
    const el = control(label)
    expect(el).not.toBeNull()
    if (!el.disabled) {
      el.value = value
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input'))
      await flush()
    }
  }
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(el => el.textContent === label)!
  const click = async (label: string) => {
    expect(button(label)).toBeDefined()
    button(label).click()
    await flush()
  }
  const confirm = async () => {
    const label = Array.from(host.querySelectorAll('label')).find(el => el.textContent?.includes('I reviewed this compiled preview'))
    expect(label).toBeDefined()
    const el = label!.querySelector<HTMLInputElement>('input')!
    el.checked = true
    el.dispatchEvent(new Event('change'))
    await flush()
  }
  const review = async (mode = 'revise') => {
    await change('Template publication', mode)
    if (mode === 'revise') await change('Existing template', target)
    await change('Library name', mode === 'new' ? 'New offer' : 'Offer R2')
    await click('Review full template')
    await confirm()
  }
  return { host, flow, saved, blocked, document, initial, apply, toast, control, change, click, button, confirm, review, adapter, reconcile: handlers.reconcileDesignAction, source, overridePath, setPreview: (handler: typeof preview) => {
    preview = handler
  }, setCatalog: (items: ReturnType<typeof published>[]) => {
    catalog = items
  }, setPublication: (handler: typeof publication) => {
    publication = handler
  }, setReadback: (handler: typeof immutableReadback) => {
    immutableReadback = handler
  } }
}
it('defaults to a new template and requires compiled review before the existing publication path', async () => {
  const m = await mount()
  expect(m.control('Template publication').value).toBe('new')
  await m.review('new')
  expect(m.host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('Compiled saved offer')
  expect(m.host.textContent).toContain(sourceHead)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(0)
  await m.click('Publish full template')
  expect(fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')?.[1].body).toEqual({ version: 1, operationId: expect.any(String), command: 'publish-template', draftId: documentId, expectedRevisionId: sourceHead, name: 'New offer', category: 'custom', includedOverridePaths: [] })
  expect(JSON.stringify(m.document.value)).toBe(m.initial)
  expect(m.apply).not.toHaveBeenCalled()
})
it('lists only complete published targets in exactly the stored source scope', async () => {
  const m = await mount()
  m.setCatalog([published(), published({ id: '40000000-0000-4000-8000-000000000002', name: 'Shared must hide', client_id: null }), published({ id: '40000000-0000-4000-8000-000000000003', name: 'Foreign must hide', client_id: '40000000-0000-4000-8000-000000000003' }), published({ id: '40000000-0000-4000-8000-000000000004', name: 'Draft must hide', template_kind: 'draft' }), published({ id: '40000000-0000-4000-8000-000000000005', name: 'Legacy must hide', revision_schema_version: 0 }), published({ id: '40000000-0000-4000-8000-000000000006', name: 'Missing doc must hide', design_document_id: null }), published({ id: 'malformed', name: 'Malformed identity must hide' })])
  await m.change('Template publication', 'revise')
  expect(m.host.textContent).toContain('Published offer')
  for (const text of ['Shared must hide', 'Foreign must hide', 'Draft must hide', 'Legacy must hide', 'Missing doc must hide', 'Malformed identity must hide']) expect(m.host.textContent).not.toContain(text)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(0)
})
it('publishes the displayed exact destination through the real builder adapter without changing the campaign', async () => {
  const m = await mount()
  await m.review()
  expect(m.host.textContent).toContain('Published offer')
  expect(m.host.textContent).toContain(r1)
  await m.click('Publish new version')
  expect(fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')?.[1].body).toEqual({ version: 1, operationId: expect.any(String), command: 'revise-template', draftId: documentId, expectedRevisionId: sourceHead, templateId: target, expectedTemplateRevisionId: r1, name: 'Offer R2', category: 'custom', includedOverridePaths: [] })
  expect(m.flow.draft.value?.headRevisionId).toBe(sourceHead)
  expect(JSON.stringify(m.document.value)).toBe(m.initial)
  expect(m.apply).not.toHaveBeenCalled()
})
it('cancels review and refuses locally dirty or source-head-changed publication without writes', async () => {
  const m = await mount()
  await m.review()
  await m.click('Cancel template review')
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(0)
  await m.review()
  m.saved.value = false
  await flush()
  expect(m.button('Publish new version')?.disabled ?? true).toBe(true)
  m.saved.value = true
  await flush()
  await m.review()
  const review = { request: { command: 'revise-template', draftId: documentId, expectedRevisionId: sourceHead, templateId: target, expectedTemplateRevisionId: r1, name: 'Old review', category: null, includedOverridePaths: [] }, sourceSnapshot: JSON.stringify(m.flow.draft.value) }
  m.flow.draft.value!.headRevisionId = r2
  m.adapter(review)
  await flush()
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(0)
})
it('retains the original complete operation after lost reply despite newer catalog and source heads', async () => {
  const m = await mount()
  await m.review()
  m.setPublication(async () => {
    throw new Error('committed reply lost')
  })
  await m.click('Publish new version')
  const original = structuredClone(fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')![1].body)
  expect(m.flow.hasPending.value).toBe(true)
  expect(m.control('Template publication').disabled).toBe(true)
  m.setCatalog([published({ head_revision_id: r2 })])
  m.flow.draft.value!.headRevisionId = r2
  await flush()
  expect(m.host.textContent).toContain(r1)
  expect(m.button('Publish new version').disabled).toBe(true)
  expect(m.button('Cancel template review').disabled).toBe(true)
  m.setPublication(async () => {
    throw { statusCode: 403 }
  })
  await m.click('Reconcile original publication')
  expect(m.flow.hasPending.value).toBe(true)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates').at(-1)![1].body).toEqual(original)
  m.setPublication(async () => ({ published: true, templateId: target, documentId: targetDocument, revisionId: r2 }))
  await m.reconcile()
  await flush()
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates').at(-1)![1].body).toEqual(original)
  expect(m.flow.hasPending.value).toBe(false)
  expect(m.host.querySelector('[aria-label="Template publication review"]')).toBeNull()
  expect(m.button('Publish new version')).toBeUndefined()
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(3)
  expect(JSON.stringify(m.document.value)).toBe(m.initial)
})
it('keeps stale-target refusal and publisher revocation from changing source content', async () => {
  const m = await mount()
  await m.review()
  m.setCatalog([published({ head_revision_id: r2 })])
  await m.click('Reload template choices')
  expect(m.host.textContent).toContain('reviewed current version ' + r1)
  m.setPublication(async () => {
    throw Object.assign(new Error('REVISION_CONFLICT'), { statusCode: 409, data: { statusMessage: 'REVISION_CONFLICT' } })
  })
  await m.click('Publish new version')
  expect(m.flow.hasPending.value).toBe(false)
  expect(m.host.textContent).toContain(m.flow.error.value)
  expect(fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')![1].body.expectedTemplateRevisionId).toBe(r1)
  expect(JSON.stringify(m.document.value)).toBe(m.initial)
  expect(m.flow.draft.value?.headRevisionId).toBe(sourceHead)
  m.flow.libraryAuthoring.value.publisher = false
  await flush()
  expect(m.host.textContent).not.toContain('Publish new version')
})

it('admits only shared targets for a shared saved source', async () => {
  const m = await mount(null)
  m.setCatalog([published({ client_id: null, name: 'Shared canonical target' }), published({ id: '40000000-0000-4000-8000-000000000007', name: 'Client target must hide' })])
  await m.change('Template publication', 'revise')
  expect(m.host.textContent).toContain('Shared canonical target')
  expect(m.host.textContent).not.toContain('Client target must hide')
})
it('hides all publication choices for staff without trusted publisher discovery', async () => {
  const m = await mount(client, false)
  expect(m.control('Template publication')).toBeNull()
  expect(m.host.textContent).not.toContain('Review full template')
  expect(fetch.mock.calls.some(([url]) => url === '/api/email/templates')).toBe(false)
})
it('requires exact local override review before compiled review and publication', async () => {
  const m = await mount(client, true, true)
  await m.change('Library name', 'Reviewed overrides')
  expect(m.button('Review full template').disabled).toBe(true)
  const override = Array.from(m.host.querySelectorAll('label')).find(el => el.textContent === m.overridePath)!.querySelector<HTMLInputElement>('input')!
  override.checked = true
  override.dispatchEvent(new Event('change'))
  await flush()
  await m.click('Review full template')
  await m.confirm()
  expect(m.host.textContent).toContain('Included override: ' + m.overridePath)
  await m.click('Publish full template')
  expect(fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')![1].body.includedOverridePaths).toEqual([m.overridePath])
})
it('requires review again after metadata changes and never publishes a stale preview returned after local edits', async () => {
  const m = await mount()
  await m.review()
  await m.change('Library name', 'Changed after review')
  expect(m.button('Publish new version')).toBeUndefined()
  let resolve: ((value: Awaited<ReturnType<Parameters<typeof m.setPreview>[0]>>) => void) | undefined
  m.setPreview(() => new Promise((done) => {
    resolve = done
  }))
  await m.click('Review full template')
  m.saved.value = false
  await flush()
  resolve!({ draftId: documentId, revisionId: sourceHead, expectedRevisionId: sourceHead, design: m.source, previewHtml: '<p>Old preview</p>', subject: '', previewText: '' })
  await flush()
  expect(m.host.textContent).toContain('source or selection changed')
  expect(fetch.mock.calls.some(([url]) => url === '/api/email/design/templates')).toBe(false)
})
it('accepts equivalent compiled source key ordering while refusing a different preview revision', async () => {
  const m = await mount()
  const reordered = Object.fromEntries(Object.entries(m.source).reverse()) as typeof m.source
  m.setPreview(async () => ({ draftId: documentId, revisionId: sourceHead, expectedRevisionId: sourceHead, design: reordered, previewHtml: '<p>Compiled saved offer</p>', subject: '', previewText: '' }))
  await m.review()
  expect(m.button('Publish new version').disabled).toBe(false)
  await m.click('Cancel template review')
  m.setPreview(async () => ({ draftId: documentId, revisionId: r2, expectedRevisionId: sourceHead, design: m.source, previewHtml: '<p>Different version</p>', subject: '', previewText: '' }))
  await m.click('Review full template')
  expect(m.host.textContent).toContain('exact saved preview is unavailable')
  expect(fetch.mock.calls.some(([url]) => url === '/api/email/design/templates')).toBe(false)
})

it.each(['new', 'revise'] as const)('consumes one successful %s submission only after immutable receipt readback and requires a fresh review', async (mode) => {
  const m = await mount()
  await m.review(mode)
  const label = mode === 'new' ? 'Publish full template' : 'Publish new version'
  const originalButton = m.button(label)
  await m.click(label)
  const first = structuredClone(fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')![1].body)
  expect(m.host.querySelector('[aria-label="Template publication review"]')).toBeNull()
  expect(m.button(label)).toBeUndefined()
  originalButton.click()
  await flush()
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(1)
  if (mode === 'revise') {
    expect(m.control('Existing template').value).toBe('__none__')
    expect(m.button('Review full template').disabled).toBe(true)
    m.setCatalog([published({ head_revision_id: r2 })])
    await m.click('Reload template choices')
    expect(m.control('Existing template').value).toBe('__none__')
    await m.change('Existing template', target)
    await m.click('Review full template')
    await m.confirm()
  } else await m.review('new')
  const r3 = '60000000-0000-4000-8000-000000000003'
  m.setPublication(async () => ({ published: true, templateId: mode === 'new' ? '40000000-0000-4000-8000-000000000009' : target, documentId: mode === 'new' ? '50000000-0000-4000-8000-000000000009' : targetDocument, revisionId: r3 }))
  await m.click(label)
  const second = fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates').at(-1)![1].body
  expect(second.operationId).not.toBe(first.operationId)
  expect(second.expectedRevisionId).toBe(sourceHead)
  if (mode === 'revise') expect(second.expectedTemplateRevisionId).toBe(r2)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(2)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/history')).toHaveLength(2)
  expect(m.flow.draft.value?.headRevisionId).toBe(sourceHead)
  expect(m.host.querySelector('[aria-label="Template publication review"]')).toBeNull()
  expect(JSON.stringify(m.document.value)).toBe(m.initial)
})
it('keeps the submitted review while immutable readback is pending or wrong, then consumes it after exact reconciliation', async () => {
  const m = await mount()
  await m.review()
  let resolve: ((value: { templateId: string, revisionId: string }) => void) | undefined
  m.setReadback(() => new Promise((done) => {
    resolve = done
  }))
  await m.click('Publish new version')
  const original = structuredClone(fetch.mock.calls.find(([url]) => url === '/api/email/design/templates')![1].body)
  expect(m.flow.busy.value).toBe(true)
  expect(m.flow.hasPending.value).toBe(true)
  expect(m.host.querySelector('[aria-label="Template publication review"]')).not.toBeNull()
  await m.click('Publish new version')
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates')).toHaveLength(1)
  resolve!({ templateId: target, revisionId: r1 })
  await flush()
  expect(m.flow.busy.value).toBe(false)
  expect(m.flow.hasPending.value).toBe(true)
  expect(m.host.querySelector('[aria-label="Template publication review"]')).not.toBeNull()
  m.setReadback(async (templateId, revisionId) => ({ templateId, revisionId }))
  await m.click('Reconcile original publication')
  expect(fetch.mock.calls.filter(([url]) => url === '/api/email/design/templates').at(-1)![1].body).toEqual(original)
  expect(m.flow.hasPending.value).toBe(false)
  expect(m.host.querySelector('[aria-label="Template publication review"]')).toBeNull()
  expect(m.button('Publish new version')).toBeUndefined()
})
it('does not consume review for unrelated module or template receipts without this panel actual submission', async () => {
  const m = await mount()
  await m.review()
  m.flow.lastLibraryReceipt.value = { published: true, moduleId: target, documentId: targetDocument, revisionId: r2 }
  await flush()
  expect(m.button('Publish new version').disabled).toBe(false)
  m.flow.lastLibraryReceipt.value = { published: true, templateId: target, documentId: targetDocument, revisionId: r2 }
  await flush()
  expect(m.button('Publish new version').disabled).toBe(false)
  // The existing flow refuses before dispatch when availability has changed.
  m.flow.libraryAuthoring.value.available = false
  await m.click('Publish new version')
  expect(fetch.mock.calls.some(([url]) => url === '/api/email/design/templates')).toBe(false)
  m.flow.lastLibraryReceipt.value = { published: true, templateId: target, documentId: targetDocument, revisionId: r2 }
  await flush()
  expect(m.host.querySelector('[aria-label="Template publication review"]')).not.toBeNull()
  expect(m.button('Publish new version').disabled).toBe(false)
})
