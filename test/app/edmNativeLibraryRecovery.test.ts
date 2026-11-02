import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { designerCapabilities } from '../../shared/emailRendering/designDesigner'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { designReadOwner } from '../../shared/emailRendering/designRoundtrip'
import { structuredDesign } from '../fixtures/email-design/structured'

const id = '10000000-0000-4000-8000-000000000001'
const head = '20000000-0000-4000-8000-000000000001'
const source = validateEmailDesign(structuredDesign())
const draft = () => ({ documentId: id, templateId: id, headRevisionId: head, projectionRevisionId: head, source, state: 'structured' as const, projection: { state: 'current' as const } })
const handoff = () => ({ id: crypto.randomUUID(), templateId: id, draftId: id, baseRevisionId: head, source, state: 'open', proposal: null, proposalRevisionId: null, appliedRevisionId: null, expiresAt: '2026-11-02T00:00:00Z', editorUrl: 'https://creative.xeroflow.io/' })
afterEach(() => vi.unstubAllGlobals())
describe('same-document library reopen and uncertain writes', () => {
  it('reopens by exact document/head and retains that body through lost readback', async () => {
    const fetch = vi.fn(), flow = useEdmDesignRoundtrip(), opened = handoff()
    vi.stubGlobal('$fetch', fetch)
    flow.draft.value = draft()
    flow.designerAuthoring.value = { available: true, endpoint: '/api/email/design/designer', capabilities: designerCapabilities(source) }
    fetch.mockResolvedValueOnce({ handoff: opened }).mockRejectedValueOnce(new Error('readback lost'))
    await expect(flow.reopenLibraryDraft(id, id, head)).rejects.toThrow('readback lost')
    const original = structuredClone(fetch.mock.calls[0][1].body)
    expect(original).toMatchObject({ command: 'open', draftId: id, expectedRevisionId: head })
    expect(original).not.toHaveProperty('templateId')
    await expect(flow.library({ command: 'replace-published-image', blockId: 'image', assetId: id })).rejects.toThrow()
    fetch.mockResolvedValueOnce({ handoff: opened }).mockResolvedValueOnce({ draft: draft() })
    await flow.reconcile()
    expect(fetch.mock.calls.at(-2)![1].body).toEqual(original)
    expect(flow.handoff.value?.id).toBe(opened.id)
    expect(flow.hasPending.value).toBe(false)
  })
  it.each(['definite rejection', 'unknown reply'])('blocks stale selection after %s while preserving uncertain action identity', async (kind) => {
    const fetch = vi.fn(), flow = useEdmDesignRoundtrip(), opened = handoff()
    vi.stubGlobal('$fetch', fetch)
    flow.draft.value = draft()
    flow.designerAuthoring.value = { available: true, endpoint: '/api/email/design/designer', capabilities: designerCapabilities(source) }
    flow.nativeLibrary.capture({ ...opened, state: 'open' }, { operationId: id, operations: [], selectedBlockIds: ['heading'], insertionTarget: { parentId: 'root', index: 1 } }, id, 'library')
    flow.nativeLibrary.saved(draft(), head)
    const failure = Object.assign(new Error(kind), kind === 'definite rejection' ? { statusCode: 409 } : {})
    fetch.mockRejectedValueOnce(failure)
    const builder = readFileSync('app/components/email/builder/EdmFlyhubBuilder.client.vue', 'utf8')
    const body = builder.slice(builder.indexOf('async function reopenNativeLibrary()'), builder.indexOf('async function returnFromNativeLibrary()'))
    const js = ts.transpile(body, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })
    // The extracted body uses the component's module import for persisted-owner
    // identity; bind the real shared implementation rather than a stub.
    const reopen = new Function('nativeLibrary', 'designFlow', 'designLocalConflict', 'sameDesignSource', 'store', 'workspaceSnapshot', 'workspaceSavedSnapshot', 'designReadOwner', `${js}; return reopenNativeLibrary`)(
      flow.nativeLibrary, flow, { value: false }, () => true, { document: { value: source.blocks } }, () => 'saved', { value: 'saved' }, designReadOwner
    ) as () => Promise<void>
    await expect(reopen()).rejects.toThrow(kind)
    expect(flow.nativeLibrary.state.value).toMatchObject({ ready: true, reopenRequired: true, documentId: id })
    expect(flow.nativeLibrary.state.value?.context.selectedBlockIds).toEqual([])
    expect(flow.nativeLibrary.state.value?.context.insertionTarget).toBeUndefined()
    expect(flow.hasPending.value).toBe(kind === 'unknown reply')
    const action = builder.slice(builder.indexOf('async function executeLibraryAction('), builder.indexOf('function publishCanonicalTemplate('))
    const execute = new Function('canonicalReady', 'nativeLibrary', `${ts.transpile(action, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })}; return executeLibraryAction`)(
      { value: true }, flow.nativeLibrary
    ) as (action: () => Promise<void>) => Promise<void>
    const competing = vi.fn()
    await execute(competing)
    expect(competing).not.toHaveBeenCalled()
    if (kind === 'unknown reply') {
      const original = structuredClone(fetch.mock.calls[0][1].body)
      fetch.mockResolvedValueOnce({ handoff: opened }).mockResolvedValueOnce({ draft: draft() })
      await flow.reconcile()
      expect(fetch.mock.calls.at(-2)![1].body).toEqual(original)
    }
  })
  it('retains exact replacement payload and blocks another target while outcome is unknown', async () => {
    const fetch = vi.fn(), flow = useEdmDesignRoundtrip()
    vi.stubGlobal('$fetch', fetch)
    flow.draft.value = draft()
    flow.libraryAuthoring.value = { available: true, publisher: false }
    const command = { command: 'replace-published-image' as const, blockId: 'image', assetId: id }
    fetch.mockRejectedValueOnce(new Error('unknown reply'))
    await expect(flow.library(command)).rejects.toThrow('unknown reply')
    const original = structuredClone(fetch.mock.calls[0][1].body)
    await expect(flow.library({ ...command, blockId: 'other' })).rejects.toThrow('previous save')
    fetch.mockResolvedValueOnce({ documentId: id, revisionId: head, published: false }).mockResolvedValueOnce({ draft: draft() })
    await flow.reconcile()
    expect(fetch.mock.calls.at(-2)![1].body).toEqual(original)
  })
})
