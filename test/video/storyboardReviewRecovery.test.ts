import { describe, expect, it, vi } from 'vitest'
import { approveRecoveryReferencesIn, approveRecoveryCopyIn, resolveTimelineReferenceSetIn } from '~~/server/utils/video-storyboard/reviewRecovery'

const pin = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/video-storyboard/references', () => ({ pinReferencesIn: pin, canonicalReferenceIn: vi.fn() }))
const id = '00000000-0000-4000-8000-000000000001'
const hash = 'a'.repeat(64)
it('preserves all original reference roles when explicitly reapproving a mapped source', async () => {
  pin.mockImplementation(async (_db, _p, _a, selections) => ({ references: selections.map((s: object) => ({ ...s, contentHash: hash })), brandKit: null }))
  const current = { id, references: ['logo', 'style'].map(role => ({ role, sourceKind: 'banner_project', assetId: id, contentHash: hash, decision: 'approved' })), brandKit: null }
  const query = vi.fn().mockResolvedValue({ rows: [{ sequence: 2, content_hash: hash }] })
  const result = await approveRecoveryReferencesIn({ query }, { project: { id, clientId: null, createdBy: id }, actor: { id, role: 'member' }, operationId: id, rootReferenceSetId: id, current: current as never, needed: [{ sourceKind: 'banner_project', assetId: id, contentHash: hash, decision: 'pending', clipIds: ['clip'] }], approvals: [{ sourceKind: 'banner_project', assetId: id, expectedContentHash: hash, evidence: 'Reviewed' }] }, {})
  expect(result.references.map(r => r.role)).toEqual(['logo', 'style'])
  expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE video_storyboards'))).toBe(false)
})
describe('explicit copy recovery', () => {
  it('rejects identifier collisions across speech and required copy before persisting', async () => {
    const query = vi.fn()
    await expect(approveRecoveryCopyIn({ query }, { projectId: id, timelineId: id, editRevision: 0, operationId: id, actor: { id, role: 'member' }, prior: { id, revision: 1, contentHash: hash, approval: { actorId: id, approvedAt: '2026-11-05T00:00:00.000Z', contentHash: hash }, cues: [], scriptSegments: [] }, approval: { expectedCopyHash: hash, scriptSegments: [{ id: 'same', text: 'speech' }], cues: [{ id: 'same', text: 'different', required: true }] } })).rejects.toMatchObject({ statusCode: 400 })
    expect(query).not.toHaveBeenCalled()
  })
})

it('uses immutable cut-scoped approvals while rejecting a later global authority change', async () => {
  const global = { id: 'global', projectId: id, references: [], brandKit: null } as unknown as import('~~/shared/video/storyboardReferences').StoryboardReferenceSet
  const local = { id: 'local', project_id: id, reference_data: { references: [{ assetId: 'local-source' }], brandKit: null, reviewScope: { rootReferenceSetId: 'global' } }, sequence: 2 }
  const query = vi.fn().mockResolvedValue({ rows: [local] })
  expect(await resolveTimelineReferenceSetIn({ query }, global, 'local')).toMatchObject({ current: true, referenceSet: { id: 'local', references: [{ assetId: 'local-source' }] } })
  expect(await resolveTimelineReferenceSetIn({ query }, { ...global, id: 'revoked-global' }, 'local')).toMatchObject({ current: false })
  expect(await resolveTimelineReferenceSetIn({ query }, global, 'global')).toMatchObject({ current: true, referenceSet: { id: 'global' } })
})
