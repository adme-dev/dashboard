import { queryOne } from '~~/server/utils/db'

export interface PilotRepresentativeEvidence {
  readonly releaseId: string
  readonly packVersionId: string
  readonly representativeTaskId: string
}

interface PilotEvidenceDb {
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>
}

interface ApprovedEvidenceRow {
  release_id: string
  pack_version_id: string
  evaluation_case_id: string
}

const issuedEvidence = new WeakSet<object>()

const APPROVED_EVIDENCE_SQL = `
SELECT release.id AS release_id,
       release.pack_version_id,
       evaluation_case.id AS evaluation_case_id
  FROM ai_pack_releases release
  JOIN ai_capability_pack_versions pack_version
    ON pack_version.id = release.pack_version_id
  JOIN ai_eval_runs evaluation
    ON evaluation.id = release.evaluation_run_id
   AND evaluation.pack_version_id = release.pack_version_id
   AND evaluation.status = 'completed'
   AND evaluation.gate_passed = TRUE
  JOIN ai_eval_suite_versions suite_version
    ON suite_version.id = evaluation.eval_suite_version_id
   AND suite_version.eval_suite_id = pack_version.evaluation_suite_id
  JOIN ai_eval_cases evaluation_case
    ON evaluation_case.id = $3::uuid
   AND evaluation_case.eval_suite_version_id = evaluation.eval_suite_version_id
   AND evaluation_case.department_id = release.department_id
 WHERE release.id = $1::uuid
   AND release.pack_version_id = $2::uuid
   AND release.release_state = 'pilot'
   AND release.rollout_scope = 'pilot'
 LIMIT 1`

export class PilotEvidenceError extends Error {
  constructor(public readonly code: string) {
    super('The representative task is not approved for this exact pilot release')
    this.name = 'PilotEvidenceError'
  }
}

export async function issuePilotRepresentativeEvidence(
  input: { releaseId: string, packVersionId: string, evaluationCaseId: string },
  db: PilotEvidenceDb = { queryOne }
): Promise<PilotRepresentativeEvidence> {
  const row = await db.queryOne<ApprovedEvidenceRow>(APPROVED_EVIDENCE_SQL, [
    input.releaseId,
    input.packVersionId,
    input.evaluationCaseId
  ])
  if (!row
    || row.release_id !== input.releaseId
    || row.pack_version_id !== input.packVersionId
    || row.evaluation_case_id !== input.evaluationCaseId) {
    throw new PilotEvidenceError('pilot_representative_evidence_not_approved')
  }
  const evidence = Object.freeze({
    releaseId: row.release_id,
    packVersionId: row.pack_version_id,
    representativeTaskId: row.evaluation_case_id
  })
  issuedEvidence.add(evidence)
  return evidence
}

export function readTrustedPilotRepresentativeEvidence(value: unknown): PilotRepresentativeEvidence | null {
  if (!value || typeof value !== 'object' || !issuedEvidence.has(value as object)) return null
  return value as PilotRepresentativeEvidence
}
