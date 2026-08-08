import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildGooglePmaxDecisionEvidence } from '../../../workers/google-pmax-provider/src/decisionEvidencePolicy'
import {
  GooglePmaxDecisionEvidenceStoreError,
  persistGooglePmaxDecisionEvidence
} from '~~/server/utils/googlePmaxDecisionEvidenceStore'

const mockTransaction = vi.fn()
const mockQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const ids = {
  launch: '11111111-1111-4111-8111-111111111111',
  tenant: '22222222-2222-4222-8222-222222222222',
  client: '33333333-3333-4333-8333-333333333333',
  brief: '44444444-4444-4444-8444-444444444444',
  actor: '55555555-5555-4555-8555-555555555555'
}

const section = (source: 'brief' | 'feed') => ({
  source,
  tenantId: ids.tenant,
  clientId: ids.client,
  authority: source === 'brief' ? 'approved' as const : 'operational' as const,
  status: 'available' as const,
  observedAt: '2026-08-07T10:00:00.000Z',
  freshUntil: '2026-08-08T10:00:00.000Z',
  references: [{ kind: source, id: source === 'brief' ? ids.brief : 'feed-1' }],
  facts: { count: 1 }
})

function evidence() {
  return buildGooglePmaxDecisionEvidence({
    identity: {
      tenantId: ids.tenant,
      clientId: ids.client,
      briefId: ids.brief,
      configVersion: 2,
      configHash: 'a'.repeat(64)
    },
    collectedAt: '2026-08-07T10:01:00.000Z',
    sections: [section('brief'), section('feed')]
  })
}

const dependencies = {
  build: async (input: Parameters<typeof buildGooglePmaxDecisionEvidence>[0]) => buildGooglePmaxDecisionEvidence(input),
  transaction: async <T>(callback: (db: { query: typeof mockQuery }) => Promise<T>) => mockTransaction(callback)
}

describe('Google PMax decision evidence snapshot store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockQuery }) => unknown) => (
      callback({ query: mockQuery })
    ))
  })

  it('persists a config-bound evidence snapshot and returns its immutable identity', async () => {
    const snapshot = evidence()
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: '66666666-6666-4666-8666-666666666666',
      evidence_hash: snapshot.evidenceHash,
      collected_at: snapshot.collectedAt
    }] })

    await expect(persistGooglePmaxDecisionEvidence({
      launchId: ids.launch,
      tenantId: ids.tenant,
      actorId: ids.actor,
      evidence: snapshot
    }, dependencies)).resolves.toEqual({
      id: '66666666-6666-4666-8666-666666666666',
      evidenceHash: snapshot.evidenceHash,
      collectedAt: snapshot.collectedAt,
      isReplay: false
    })

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO campaign_launch_evidence_snapshots[\s\S]*FROM campaign_launches launch/),
      expect.arrayContaining([ids.launch, ids.tenant, ids.client, ids.brief, 2, 'a'.repeat(64), snapshot.evidenceHash])
    )
  })

  it('returns an exact replay when the evidence hash already exists', async () => {
    const snapshot = evidence()
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '66666666-6666-4666-8666-666666666666',
        evidence_hash: snapshot.evidenceHash,
        collected_at: snapshot.collectedAt
      }] })

    await expect(persistGooglePmaxDecisionEvidence({
      launchId: ids.launch,
      tenantId: ids.tenant,
      actorId: ids.actor,
      evidence: snapshot
    }, dependencies)).resolves.toMatchObject({ isReplay: true, evidenceHash: snapshot.evidenceHash })
  })

  it('fails before DB access when the evidence hash does not identify the snapshot', async () => {
    const snapshot = { ...evidence(), evidenceHash: 'b'.repeat(64) }

    await expect(persistGooglePmaxDecisionEvidence({
      launchId: ids.launch,
      tenantId: ids.tenant,
      actorId: ids.actor,
      evidence: snapshot
    }, dependencies)).rejects.toBeInstanceOf(GooglePmaxDecisionEvidenceStoreError)

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('fails closed when neither insertion nor exact replay can resolve the launch identity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })

    await expect(persistGooglePmaxDecisionEvidence({
      launchId: ids.launch,
      tenantId: ids.tenant,
      actorId: ids.actor,
      evidence: evidence()
    }, dependencies)).rejects.toMatchObject({ code: 'PMAX_EVIDENCE_LAUNCH_IDENTITY_MISMATCH' })
  })
})
