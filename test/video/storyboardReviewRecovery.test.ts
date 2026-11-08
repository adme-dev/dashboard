import { describe, expect, it, vi } from 'vitest'
import { approveRecoveryReferencesIn, approveRecoveryCopyIn, resolveTimelineReferenceSetIn, neededTimelineBrandKitIn, BrandKitRecoveryApprovalSchema } from '~~/server/utils/video-storyboard/reviewRecovery'

const { pin, canonical } = vi.hoisted(() => ({ pin: vi.fn(), canonical: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/references', () => ({ pinReferencesIn: pin, canonicalReferenceIn: canonical }))
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

describe('cut-scoped brand kit recovery', () => {
  const freshHash = 'b'.repeat(64)
  const project = { id, clientId: null, createdBy: id }
  const actor = { id, role: 'member' }
  const untouched = { role: 'logo', sourceKind: 'banner_project', assetId: id, contentHash: hash, decision: 'approved', approval: { actorId: id, approvedAt: '2026-11-05T00:00:00.000Z', contentHash: hash, evidence: 'Original evidence' } }
  const current = { id, references: [untouched], brandKit: { id, contentHash: hash } } as never
  const approval = { id, expectedPinnedHash: hash, expectedContentHash: freshHash, evidence: 'Reviewed updated brand colors and typography' }
  const input = { project, actor, operationId: id, rootReferenceSetId: id, current, needed: [], approvals: [], brandKitApproval: approval }

  it('requires explicit evidence and exact identity hashes', () => {
    expect(BrandKitRecoveryApprovalSchema.safeParse({ ...approval, evidence: ' ' }).success).toBe(false)
    expect(BrandKitRecoveryApprovalSchema.safeParse({ ...approval, expectedPinnedHash: undefined }).success).toBe(false)
    expect(BrandKitRecoveryApprovalSchema.safeParse({ ...approval, expectedContentHash: undefined }).success).toBe(false)
  })

  it.each([
    { brandKit: null },
    { brandKit: { id: '00000000-0000-4000-8000-000000000002', contentHash: hash } },
    { brandKit: { id, contentHash: freshHash } }
  ])('rejects missing/swapped kits or changed old pins before pinning: %j', async (change) => {
    pin.mockClear()
    const query = vi.fn()
    await expect(approveRecoveryReferencesIn({ query }, { ...input, current: { references: [], ...change } as never }, {})).rejects.toMatchObject({ statusCode: 409 })
    expect(pin).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('passes the exact current hash to canonical pinning and rejects a changed result', async () => {
    pin.mockResolvedValue({ references: [], brandKit: { id, contentHash: 'c'.repeat(64) } })
    const query = vi.fn()
    await expect(approveRecoveryReferencesIn({ query }, input, {})).rejects.toMatchObject({ statusCode: 409 })
    expect(pin).toHaveBeenLastCalledWith({ query }, project, actor, [], { id, expectedContentHash: freshHash }, {})
    expect(query).not.toHaveBeenCalled()
  })

  it('persists one scoped inventory with brand evidence and preserves untouched media approvals', async () => {
    pin.mockResolvedValue({ references: [], brandKit: { id, contentHash: freshHash } })
    const query = vi.fn().mockResolvedValue({ rows: [{ sequence: 2, content_hash: freshHash }] })
    const result = await approveRecoveryReferencesIn({ query }, input, {})
    expect(result.references).toEqual([untouched])
    expect(result.brandKit).toEqual({ id, contentHash: freshHash, approval: { actorId: id, approvedAt: expect.any(String), contentHash: freshHash, evidence: approval.evidence } })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toContain('INSERT INTO video_storyboard_reference_sets')
    expect(JSON.parse(query.mock.calls[0][1][3])).toEqual({ references: [untouched], brandKit: result.brandKit, reviewScope: { rootReferenceSetId: id } })
    expect((current as { brandKit: { contentHash: string } }).brandKit.contentHash).toBe(hash)
  })

  it('combines explicit media and brand approvals in the same immutable row', async () => {
    const media = { ...untouched, contentHash: freshHash, approval: { ...untouched.approval, contentHash: freshHash, evidence: 'Updated media evidence' } }
    pin.mockResolvedValue({ references: [media], brandKit: { id, contentHash: freshHash } })
    const query = vi.fn().mockResolvedValue({ rows: [{ sequence: 2, content_hash: freshHash }] })
    const result = await approveRecoveryReferencesIn({ query }, { ...input,
      needed: [{ sourceKind: 'banner_project', assetId: id, contentHash: freshHash, decision: 'pending', clipIds: ['clip'] }],
      approvals: [{ sourceKind: 'banner_project', assetId: id, expectedContentHash: freshHash, evidence: 'Updated media evidence' }]
    }, {})
    expect(result.references).toEqual([media])
    expect(result.brandKit?.approval?.evidence).toBe(approval.evidence)
    expect(query).toHaveBeenCalledTimes(1)
    expect(pin).toHaveBeenLastCalledWith({ query }, project, actor, [{ sourceKind: 'banner_project', assetId: id, expectedContentHash: freshHash, evidence: 'Updated media evidence', role: 'logo', decision: 'approved' }], { id, expectedContentHash: freshHash }, {})
  })

  it('offers only authorized canonical pinned kit content and no inaccessible metadata', async () => {
    const query = vi.fn()
    canonical.mockResolvedValue({ contentHash: freshHash, identityKind: 'record' })
    expect(await neededTimelineBrandKitIn({ query }, project, actor, current, {})).toEqual({ id, pinnedContentHash: hash, contentHash: freshHash, decision: 'pending' })
    expect(canonical).toHaveBeenLastCalledWith({ query }, project, actor, 'brand_kit', id, {})
    canonical.mockRejectedValue(new Error('access denied'))
    expect(await neededTimelineBrandKitIn({ query }, project, actor, current, {})).toBeNull()
    canonical.mockClear()
    expect(await neededTimelineBrandKitIn({ query }, project, actor, { brandKit: null } as never, {})).toBeNull()
    expect(canonical).not.toHaveBeenCalled()
  })
})
