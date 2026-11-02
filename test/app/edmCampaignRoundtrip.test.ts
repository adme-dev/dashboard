import { beforeEach, expect, it, vi } from 'vitest'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const id = '10000000-0000-4000-8000-000000000001'
const head = '20000000-0000-4000-8000-000000000001'
const next = '20000000-0000-4000-8000-000000000002'
const owner = { kind: 'campaign' as const, id }
const source = validateEmailDesign({ ...structuredDesign(), kind: 'campaign-draft' })
const draft = (revision = head) => ({ owner, state: 'structured', source, documentId: id, headRevisionId: revision, projectionRevisionId: revision, metadata: { subject: 'Original', previewText: null }, projection: { state: 'current' } })
const fetch = vi.fn()
beforeEach(() => {
  fetch.mockReset()
  vi.stubGlobal('$fetch', fetch)
})
it('uses the typed registered-ID image path for staff without exposing structure or publisher controls', async () => {
  const flow = useEdmDesignRoundtrip()
  fetch.mockResolvedValueOnce({ draft: draft(), campaignAuthoring: { available: false, contentImagesAvailable: true }, libraryAuthoring: { available: false } })
  await flow.lookup(owner)
  fetch.mockResolvedValueOnce({ documentId: id, revisionId: next, published: false }).mockResolvedValueOnce({ draft: draft(next) })
  await flow.replaceCampaignImage('image-block', id)
  expect(fetch.mock.calls[1]).toEqual(['/api/email/design/modules', { method: 'POST', body: {
    version: 1, command: 'replace-published-image', operationId: expect.any(String), draftId: id, expectedDraftRevisionId: head, blockId: 'image-block', assetId: id
  } }])
  expect(flow.libraryAuthoring.value.available).toBe(false)
  expect(flow.lastLibraryReceipt.value?.revisionId).toBe(next)
})
it('opens a campaign only after trusted availability and keeps the exact saved owner/head', async () => {
  const flow = useEdmDesignRoundtrip()
  await expect(flow.open(owner, id, true)).rejects.toThrow('unavailable')
  fetch.mockResolvedValueOnce({ draft: draft(), campaignAuthoring: { available: true }, designerAuthoring: { available: true, endpoint: '/api/email/design/designer', capabilities: null } })
  await flow.lookup(owner)
  const handoff = { id, owner, draftId: id, baseRevisionId: head, source, state: 'open', proposal: null, proposalRevisionId: null, appliedRevisionId: null }
  fetch.mockResolvedValueOnce({ handoff }).mockResolvedValueOnce({ draft: draft() })
  await flow.open(owner, id, true, { draftId: id, expectedRevisionId: head })
  expect(fetch.mock.calls[1][1].body).toMatchObject({ command: 'open', draftId: id, expectedRevisionId: head })
  expect(fetch.mock.calls[2][1].body).toEqual({ command: 'lookup', owner })
  expect(flow.handoff.value?.owner).toEqual(owner)
})
it('retains one complete canonical campaign content/metadata patch after lost reply', async () => {
  const flow = useEdmDesignRoundtrip()
  fetch.mockResolvedValueOnce({ draft: draft() })
  await flow.lookup(owner)
  const patch = { body_source: source.blocks, subject: 'New subject', preview_text: 'New preheader', from_email: 'team@example.invalid' }
  fetch.mockRejectedValueOnce(new Error('reply lost'))
  await expect(flow.saveCampaign(patch)).rejects.toThrow('reply lost')
  const body = structuredClone(fetch.mock.calls.at(-1)![1].body)
  expect(body).toMatchObject({ ...patch, expected_design_revision_id: head })
  fetch.mockResolvedValueOnce({ campaign: { email_design_revision_id: next, design_receipt: { revisionId: next } } }).mockResolvedValueOnce({ draft: draft(next) })
  await flow.reconcile()
  expect(fetch.mock.calls.at(-2)![1].body).toEqual(body)
  expect(flow.draft.value?.headRevisionId).toBe(next)
  expect(flow.hasPending.value).toBe(false)
})

it('reconciles the original recovery receipt when C later advances or freezes without issuing another copy operation', async () => {
  const flow = useEdmDesignRoundtrip()
  flow.mode.value = 'designer'
  const proposal = { id, owner, draftId: id, baseRevisionId: head, source, state: 'proposed' as const, proposal: source, proposalRevisionId: next, appliedRevisionId: null, expiresAt: '2099-01-01T00:00:00Z', editorUrl: 'https://creative.xeroflow.io/figflow/0.11.2-edm1/' }
  flow.handoff.value = proposal
  fetch.mockRejectedValueOnce(new Error('committed reply lost'))
  await expect(flow.recoverCampaign('Recorded C')).rejects.toThrow('committed reply lost')
  const original = structuredClone(fetch.mock.calls[0][1].body)
  const copy = '30000000-0000-4000-8000-000000000001'
  const recovery = { campaignId: copy, documentId: copy, revisionId: next }
  fetch.mockResolvedValueOnce({ handoff: proposal, recovery }).mockResolvedValueOnce({ mutable: false, draft: { ...draft(head), owner: { kind: 'campaign', id: copy }, documentId: copy } })
  await flow.reconcile()
  expect(fetch.mock.calls[1]).toEqual(['/api/email/design/designer', { method: 'POST', body: original }])
  expect(fetch.mock.calls[2][1].body).toEqual({ command: 'lookup', owner: { kind: 'campaign', id: copy } })
  expect(flow.lastRecovery.value).toEqual(recovery)
  expect(flow.hasPending.value).toBe(false)
})

it.each(['document', 'owner'] as const)('retains original recovery reconciliation when fresh destination %s identity is wrong', async (mismatch) => {
  const flow = useEdmDesignRoundtrip()
  const proposal = { id, owner, draftId: id, baseRevisionId: head, source, state: 'proposed' as const, proposal: source, proposalRevisionId: next, appliedRevisionId: null, expiresAt: '2099-01-01T00:00:00Z', editorUrl: 'https://creative.xeroflow.io/figflow/0.11.2-edm1/' }
  flow.handoff.value = proposal
  const copy = '30000000-0000-4000-8000-000000000001'
  const recovery = { campaignId: copy, documentId: copy, revisionId: next }
  const current = { ...draft(next), owner: { kind: 'campaign', id: copy }, documentId: copy }
  fetch.mockResolvedValueOnce({ handoff: proposal, recovery }).mockResolvedValueOnce({ draft: { ...current, ...(mismatch === 'document' ? { documentId: id } : { owner }) } })
  await expect(flow.recoverCampaign('Original name')).rejects.toThrow('could not be verified')
  const original = structuredClone(fetch.mock.calls[0][1].body)
  expect(flow.hasPending.value).toBe(true)
  expect(flow.lastRecovery.value).toBeNull()
  fetch.mockResolvedValueOnce({ handoff: proposal, recovery }).mockResolvedValueOnce({ draft: current })
  await flow.reconcile()
  expect(fetch.mock.calls[2][1].body).toEqual(original)
  expect(flow.lastRecovery.value).toEqual(recovery)
  expect(flow.hasPending.value).toBe(false)
})
