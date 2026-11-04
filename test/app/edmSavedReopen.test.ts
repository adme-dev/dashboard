import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { designerCapabilities } from '../../shared/emailRendering/designDesigner'
import { structuredDesign } from '../fixtures/email-design/structured'

const id = '10000000-0000-4000-8000-000000000001'
const head = '20000000-0000-4000-8000-000000000001'
const remoteHead = '20000000-0000-4000-8000-000000000002'
const source = () => validateEmailDesign({ ...structuredDesign(), scope: { clientId: null } })
const draft = () => ({ state: 'structured' as const, source: source(), documentId: id, templateId: id, headRevisionId: head, projectionRevisionId: head, projection: { state: 'current' as const } })
const handoff = () => ({ id, draftId: id, templateId: id, baseRevisionId: head, state: 'open' as const, source: source(), proposal: null, proposalRevisionId: null, appliedRevisionId: null, expiresAt: '2026-11-04T00:00:00Z', editorUrl: 'https://creative.xeroflow.io/figflow/0.11.2-edm1/' })
const fetch = vi.fn()
const baseline = { draftId: id, expectedRevisionId: head }
function flow() {
  const value = useEdmDesignRoundtrip()
  value.draft.value = draft()
  value.designerAuthoring.value = { available: true, endpoint: '/api/email/design/designer', capabilities: designerCapabilities(source()) }
  return value
}
beforeEach(() => {
  fetch.mockReset()
  vi.stubGlobal('$fetch', fetch)
})
describe('revision-bound saved design reopen', () => {
  it.each([false, true])('opens exact saved owner/head in designer=%s without content or metadata writes', async (authoring) => {
    const value = flow()
    fetch.mockResolvedValueOnce({ handoff: handoff() }).mockResolvedValueOnce({ draft: draft() })
    await value.open(id, null, authoring, baseline)
    expect(fetch.mock.calls[0]).toEqual([authoring ? '/api/email/design/designer' : '/api/email/design/roundtrip', { method: 'POST', body: { command: 'open', operationId: expect.any(String), ...baseline } }])
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([authoring ? '/api/email/design/designer' : '/api/email/design/roundtrip', '/api/email/design/roundtrip'])
    expect(value.draft.value?.headRevisionId).toBe(head)
  })
  it('refuses the stale head without adopting a remote draft or issuing a save', async () => {
    const value = flow()
    const local = JSON.stringify(value.draft.value)
    fetch.mockRejectedValueOnce({ statusCode: 409, data: { statusMessage: 'REVISION_CONFLICT' } })
    await expect(value.open(id, null, true, baseline)).rejects.toMatchObject({ statusCode: 409 })
    expect(fetch.mock.calls[0]![1].body).toMatchObject({ command: 'open', expectedRevisionId: head })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(value.draft.value)).toBe(local)
    expect(value.hasPending.value).toBe(false)
  })
  it('does not adopt newer readback after the exact open receipt', async () => {
    const value = flow()
    fetch.mockResolvedValueOnce({ handoff: handoff() }).mockResolvedValueOnce({ draft: { ...draft(), headRevisionId: remoteHead, projectionRevisionId: remoteHead } })
    await expect(value.open(id, null, true, baseline)).rejects.toThrow('another editor')
    expect(value.draft.value?.headRevisionId).toBe(head)
    expect(value.handoff.value).toBeNull()
    expect(value.hasPending.value).toBe(true)
  })
  it.each(['owner', 'client', 'document', 'head', 'projection'] as const)('rejects a foreign or unconfirmed %s before network', async (kind) => {
    const value = flow()
    if (kind === 'owner') value.draft.value!.templateId = remoteHead
    if (kind === 'client' && value.draft.value?.state === 'structured') value.draft.value.source.scope.clientId = remoteHead
    if (kind === 'document') value.draft.value!.documentId = remoteHead
    if (kind === 'head') value.draft.value!.headRevisionId = remoteHead
    if (kind === 'projection' && value.draft.value?.state === 'structured') value.draft.value.projection.state = 'stale'
    await expect(value.open(id, null, true, baseline)).rejects.toThrow(/saved|owner|head|projection/i)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['templateId', 'draftId', 'baseRevisionId'] as const)('refuses a mismatched %s in the open receipt before adopting it', async (field) => {
    const value = flow()
    fetch.mockResolvedValueOnce({ handoff: { ...handoff(), [field]: remoteHead } })
    await expect(value.open(id, null, true, baseline)).rejects.toThrow('receipt')
    expect(value.handoff.value).toBeNull()
    expect(value.draft.value?.headRevisionId).toBe(head)
    expect(value.hasPending.value).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('keeps a pending save payload when a competing exact reopen is refused', async () => {
    const value = flow()
    fetch.mockRejectedValueOnce(new Error('save reply lost'))
    await expect(value.saveMetadata('Original subject', null)).rejects.toThrow('save reply lost')
    const original = fetch.mock.calls[0]![1].body
    await expect(value.open(id, null, true, baseline)).rejects.toThrow('reconciliation')
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValueOnce({ revisionId: head }).mockResolvedValueOnce({ draft: draft() })
    await value.reconcile()
    expect(fetch.mock.calls[1]![1].body).toEqual(original)
    expect(value.hasPending.value).toBe(false)
  })
  it('retains original exact open body/mode across an unknown reply', async () => {
    const value = flow()
    fetch.mockRejectedValueOnce(new Error('reply lost'))
    await expect(value.open(id, null, true, baseline)).rejects.toThrow('reply lost')
    const original = fetch.mock.calls[0]![1].body
    fetch.mockResolvedValueOnce({ handoff: handoff() }).mockResolvedValueOnce({ draft: draft() })
    await value.open(id, null, false, baseline)
    expect(fetch.mock.calls[1]).toEqual(['/api/email/design/designer', { method: 'POST', body: original }])
    expect(value.mode.value).toBe('designer')
    expect(value.hasPending.value).toBe(false)
  })
})
