import { randomUUID } from 'node:crypto'

/**
 * Operator reconciliation of a TERMINAL video generation job whose liability is
 * 'uncertain'. It never infers cost: 'reported' records an operator-attested actual cost and
 * 'released' records an operator attestation that the provider shows no charge. Both need a provider-evidence
 * reference AND the SHA-256 of the retained provider artifact. The database cannot
 * verify provider truth offline; this is an accountable operator attestation whose
 * evidence (incl. the executing database role) is append-only (migration 509), and
 * a job reconciles once.
 *
 * Live jobs (queued/running/unknown) are excluded: only the worker/finalizer
 * settles them.
 */
export type ReconciliationOutcome = 'reported' | 'released'
export type ReconciliationEvidenceKind = 'provider_log' | 'provider_invoice' | 'provider_support_case'
export type ReconciliationValidationMethod = 'provider_console_lookup' | 'provider_api_export' | 'invoice_line_match' | 'provider_support_confirmation'

export interface ReconcileVideoGenerationLiabilityInput {
  operationId: string
  jobId: string
  tenantId: string
  projectId: string
  expectedLiabilityCents: number
  outcome: ReconciliationOutcome
  actualCostCents: number | null
  evidenceKind: ReconciliationEvidenceKind
  evidenceReference: string
  /** Fingerprint of the retained artifact; identifies it for review, never proves billing. */
  evidenceSha256: string
  validationMethod: ReconciliationValidationMethod
  /** Provider-side identity of this exact job (must equal the job's provider_request_id when present). */
  providerIdentity: string
  /** Costs are USD cents; any other currency is rejected rather than converted. */
  currency: 'USD'
  note?: string | null
  actorId: string
}

export type ReconcileVideoGenerationLiabilityFailure
  = | 'invalid_input'
    | 'actor_not_owner'
    | 'job_not_found'
    | 'scope_mismatch'
    | 'job_not_terminal'
    | 'already_reconciled'
    | 'liability_changed'
    | 'operation_conflict'
    | 'provider_identity_mismatch'

export type ReconcileVideoGenerationLiabilityResult
  = | { ok: true, replayed: boolean, reconciliationId: string, liabilityState: ReconciliationOutcome, liabilityCents: number }
    | { ok: false, reason: ReconcileVideoGenerationLiabilityFailure, detail?: string }

export interface ReconciliationDb {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[], rowCount: number | null }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TERMINAL = new Set(['succeeded', 'failed', 'blocked'])
const EVIDENCE_KINDS = new Set<ReconciliationEvidenceKind>(['provider_log', 'provider_invoice', 'provider_support_case'])
const VALIDATION_METHODS = new Set<ReconciliationValidationMethod>(['provider_console_lookup', 'provider_api_export', 'invoice_line_match', 'provider_support_confirmation'])

const PG_INTEGER_MAX = 2_147_483_647
const isCents = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= PG_INTEGER_MAX

/** One canonical form for validation, replay comparison and insert. */
export function normalizeReconciliationInput(input: ReconcileVideoGenerationLiabilityInput): ReconcileVideoGenerationLiabilityInput {
  const note = typeof input.note === 'string' ? input.note.trim() : null
  return {
    ...input,
    operationId: typeof input.operationId === 'string' ? input.operationId.trim() : input.operationId,
    tenantId: typeof input.tenantId === 'string' ? input.tenantId.trim() : input.tenantId,
    jobId: typeof input.jobId === 'string' ? input.jobId.trim().toLowerCase() : input.jobId,
    projectId: typeof input.projectId === 'string' ? input.projectId.trim().toLowerCase() : input.projectId,
    actorId: typeof input.actorId === 'string' ? input.actorId.trim().toLowerCase() : input.actorId,
    evidenceReference: typeof input.evidenceReference === 'string' ? input.evidenceReference.trim() : input.evidenceReference,
    evidenceSha256: typeof input.evidenceSha256 === 'string' ? input.evidenceSha256.trim().toLowerCase() : input.evidenceSha256,
    // Not trimmed: legacy provider request ids are matched byte-exactly.
    providerIdentity: input.providerIdentity,
    currency: typeof input.currency === 'string' ? input.currency.trim().toUpperCase() as 'USD' : input.currency,
    note: note || null
  }
}

export function validateReconciliationInput(input: ReconcileVideoGenerationLiabilityInput): string | null {
  if (typeof input.operationId !== 'string' || input.operationId.length < 8 || input.operationId.length > 200) return 'operationId must be 8-200 non-blank characters'
  if (!UUID_RE.test(input.jobId) || !UUID_RE.test(input.projectId) || !UUID_RE.test(input.actorId)) return 'jobId, projectId and actorId must be UUIDs'
  if (typeof input.tenantId !== 'string' || !input.tenantId) return 'tenantId is required'
  if (!isCents(input.expectedLiabilityCents)) return 'expectedLiabilityCents must be a non-negative PostgreSQL integer'
  if (input.outcome !== 'reported' && input.outcome !== 'released') return 'outcome must be reported or released'
  if (input.outcome === 'reported' && !isCents(input.actualCostCents)) return 'reported requires a non-negative PostgreSQL integer actualCostCents'
  if (input.outcome === 'released' && input.actualCostCents !== null) return 'released must not carry actualCostCents'
  if (!EVIDENCE_KINDS.has(input.evidenceKind)) return 'evidenceKind must be provider_log, provider_invoice or provider_support_case'
  if (typeof input.evidenceReference !== 'string' || input.evidenceReference.length < 8 || input.evidenceReference.length > 512) return 'evidenceReference must be 8-512 non-blank characters'
  if (typeof input.evidenceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.evidenceSha256)) return 'evidenceSha256 (SHA-256 of the retained provider artifact) is required'
  if (!VALIDATION_METHODS.has(input.validationMethod)) return 'validationMethod must describe how the provider evidence was checked'
  if (typeof input.providerIdentity !== 'string' || input.providerIdentity.length < 1 || input.providerIdentity.length > 4096) return 'providerIdentity (provider-side id of this exact job) is required'
  if (input.currency !== 'USD') return 'currency must be USD; amounts are USD cents and are never converted'
  if (input.note != null && input.note.length > 1000) return 'note must be at most 1000 characters'
  return null
}

function sameOperation(row: Record<string, unknown>, input: ReconcileVideoGenerationLiabilityInput): boolean {
  return String(row.job_id) === input.jobId
    && String(row.tenant_id) === input.tenantId
    && String(row.project_id) === input.projectId
    && Number(row.expected_liability_cents) === input.expectedLiabilityCents
    && row.outcome === input.outcome
    && (row.actual_cost_cents == null ? null : Number(row.actual_cost_cents)) === input.actualCostCents
    && row.evidence_kind === input.evidenceKind
    && row.evidence_reference === input.evidenceReference
    && row.evidence_sha256 === input.evidenceSha256
    && row.validation_method === input.validationMethod
    && row.provider_identity === input.providerIdentity
    && row.currency === input.currency
    && (row.note ?? null) === (input.note ?? null)
    && String(row.actor_id) === input.actorId
}

/** Run inside a transaction the caller opened (BEGIN … COMMIT). */
export async function reconcileVideoGenerationLiabilityIn(
  db: ReconciliationDb,
  input: ReconcileVideoGenerationLiabilityInput,
  options: { apply: boolean } = { apply: true }
): Promise<ReconcileVideoGenerationLiabilityResult> {
  input = normalizeReconciliationInput(input)
  const invalid = validateReconciliationInput(input)
  if (invalid) return { ok: false, reason: 'invalid_input', detail: invalid }

  // Lock order: operation id first (same id on different jobs serializes), then the job row.
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('videogen:liability-reconcile-op:' || $1, 0))`, [input.operationId])
  // Serialize every attempt on this job (and therefore on its single evidence slot).
  const jobRows = await db.query(
    `SELECT id, tenant_id, project_id, status, liability_state, liability_cents, actual_cost_cents, provider_request_id
       FROM video_generation_jobs WHERE id = $1 FOR UPDATE`,
    [input.jobId]
  )

  const replay = await db.query('SELECT * FROM video_generation_liability_reconciliations WHERE operation_id = $1', [input.operationId])
  if (replay.rows[0]) {
    const currentRequestId = jobRows.rows[0]?.provider_request_id == null ? null : String(jobRows.rows[0].provider_request_id)
    if (!sameOperation(replay.rows[0], input) || (replay.rows[0].provider_request_id_snapshot ?? null) !== currentRequestId) {
      return { ok: false, reason: 'operation_conflict' }
    }
    const row = replay.rows[0]
    return {
      ok: true,
      replayed: true,
      reconciliationId: String(row.id),
      liabilityState: row.outcome as ReconciliationOutcome,
      liabilityCents: row.outcome === 'released' ? 0 : Number(row.actual_cost_cents)
    }
  }

  const actor = await db.query(
    `SELECT 1 FROM team_members WHERE id = $1 AND is_active = TRUE AND user_role = 'owner'`,
    [input.actorId]
  )
  if (!actor.rows[0]) return { ok: false, reason: 'actor_not_owner' }

  const job = jobRows.rows[0]
  if (!job) return { ok: false, reason: 'job_not_found' }
  if (String(job.tenant_id) !== input.tenantId || String(job.project_id) !== input.projectId) return { ok: false, reason: 'scope_mismatch' }
  if (!TERMINAL.has(String(job.status))) return { ok: false, reason: 'job_not_terminal' }

  const providerRequestId = job.provider_request_id == null ? null : String(job.provider_request_id)
  if (providerRequestId !== null && providerRequestId !== input.providerIdentity) return { ok: false, reason: 'provider_identity_mismatch' }

  const existing = await db.query('SELECT 1 FROM video_generation_liability_reconciliations WHERE job_id = $1', [input.jobId])
  if (existing.rows[0]) return { ok: false, reason: 'already_reconciled' }
  if (job.liability_state !== 'uncertain' || Number(job.liability_cents) !== input.expectedLiabilityCents || job.actual_cost_cents != null) {
    return { ok: false, reason: 'liability_changed' }
  }

  const liabilityCents = input.outcome === 'released' ? 0 : input.actualCostCents as number
  if (!options.apply) {
    return { ok: true, replayed: false, reconciliationId: '(dry-run)', liabilityState: input.outcome, liabilityCents }
  }

  const reconciliationId = randomUUID()
  try {
    await db.query(
      `INSERT INTO video_generation_liability_reconciliations
       (id, operation_id, job_id, tenant_id, project_id, expected_liability_state, expected_liability_cents,
        outcome, actual_cost_cents, evidence_kind, evidence_reference, evidence_sha256, note, actor_id,
        validation_method, provider_request_id_snapshot, provider_identity, provider_identity_source, currency)
     VALUES ($1,$2,$3,$4,$5,'uncertain',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [reconciliationId, input.operationId, input.jobId, input.tenantId, input.projectId, input.expectedLiabilityCents,
        input.outcome, input.actualCostCents, input.evidenceKind, input.evidenceReference, input.evidenceSha256,
        input.note ?? null, input.actorId, input.validationMethod, providerRequestId, input.providerIdentity,
        providerRequestId === null ? 'operator_attested' : 'job_provider_request_id', input.currency]
    )
  } catch (error) {
    // Locks make these unreachable in practice; keep typed semantics if a constraint still wins.
    const constraint = error as { code?: string, constraint?: string }
    if (constraint.code === '23505') {
      return { ok: false, reason: /operation_id/.test(String(constraint.constraint)) ? 'operation_conflict' : 'already_reconciled' }
    }
    throw error
  }
  const updated = await db.query(
    `UPDATE video_generation_jobs
        SET liability_state = $2,
            liability_cents = $3,
            actual_cost_cents = CASE WHEN $2 = 'reported' THEN $3 ELSE actual_cost_cents END,
            updated_at = now()
      WHERE id = $1 AND liability_state = 'uncertain' AND liability_cents = $4 AND actual_cost_cents IS NULL
        AND status IN ('succeeded', 'failed', 'blocked')
      RETURNING liability_state, liability_cents`,
    [input.jobId, input.outcome, liabilityCents, input.expectedLiabilityCents]
  )
  const after = updated.rows[0]
  if (updated.rowCount !== 1 || after?.liability_state !== input.outcome || Number(after?.liability_cents) !== liabilityCents) {
    // Abort the caller's transaction so evidence and liability never diverge.
    throw new Error('video generation liability reconciliation did not apply exactly once')
  }
  return { ok: true, replayed: false, reconciliationId, liabilityState: input.outcome, liabilityCents }
}
