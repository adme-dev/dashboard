import { describe, expect, it, vi } from 'vitest'
import {
  issuePilotRepresentativeEvidence,
  readTrustedPilotRepresentativeEvidence
} from '~~/server/utils/ai/governance/pilotEvidence'

const input = {
  releaseId: '10000000-0000-4000-8000-000000000001',
  packVersionId: '20000000-0000-4000-8000-000000000001',
  evaluationCaseId: '30000000-0000-4000-8000-000000000001'
}

describe('pilot representative evidence issuer', () => {
  it('issues an opaque server capability only for the exact pilot release, evaluated version, suite, and approved case', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      release_id: input.releaseId,
      pack_version_id: input.packVersionId,
      evaluation_case_id: input.evaluationCaseId
    })

    const issued = await issuePilotRepresentativeEvidence(input, { queryOne })

    expect(readTrustedPilotRepresentativeEvidence(issued)).toEqual({
      releaseId: input.releaseId,
      packVersionId: input.packVersionId,
      representativeTaskId: input.evaluationCaseId
    })
    expect(queryOne.mock.calls[0]?.[0]).toContain("release.release_state = 'pilot'")
    expect(queryOne.mock.calls[0]?.[0]).toContain('evaluation_case.eval_suite_version_id = evaluation.eval_suite_version_id')
  })

  it('rejects an unmatched case and never accepts a structurally forged object', async () => {
    await expect(issuePilotRepresentativeEvidence(input, { queryOne: vi.fn().mockResolvedValue(null) }))
      .rejects.toMatchObject({ code: 'pilot_representative_evidence_not_approved' })
    expect(readTrustedPilotRepresentativeEvidence({ ...input, representativeTaskId: input.evaluationCaseId } as any)).toBeNull()
  })
})
