import { z } from 'zod'
import {
  EvaluationCostApprovalSchema,
  EvaluationModelRateCardSchema,
  type EvaluationAdmissionDependencies,
  type EvaluationCostApproval,
  type EvaluationModelRateCard
} from './evaluationExecutionAdmission'

const UUID = z.uuid()
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/)
const TIMESTAMP = z.preprocess(
  value => value instanceof Date ? value.toISOString() : value,
  z.string().datetime({ offset: true })
)
const DB_INTEGER = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((value, ctx) => {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) {
      ctx.addIssue({ code: 'custom', message: 'Database integer exceeds the safe range.' })
      return z.NEVER
    }
    return parsed
  })

const RateCardRowSchema = z.strictObject({
  id: UUID,
  model_provider: z.string(),
  model_id: z.string(),
  input_usd_micros_per_million_tokens: DB_INTEGER,
  output_usd_micros_per_million_tokens: DB_INTEGER,
  source_digest: DIGEST,
  valid_from: TIMESTAMP,
  valid_until: TIMESTAMP,
  created_by: UUID,
  created_at: TIMESTAMP
})

const PlanRowSchema = z.strictObject({
  evaluation_run_id: UUID,
  department_id: UUID,
  plan_digest: DIGEST,
  rate_card_id: UUID,
  estimated_upper_bound_usd_micros: DB_INTEGER,
  max_model_calls: z.coerce.number().int().min(1).max(500),
  created_by: UUID,
  created_at: TIMESTAMP
})

const ApprovalRowSchema = z.strictObject({
  id: UUID,
  evaluation_run_id: UUID,
  rate_card_id: UUID,
  plan_digest: DIGEST,
  approved_by: UUID,
  reason: z.string(),
  max_spend_usd_micros: DB_INTEGER,
  approved_at: TIMESTAMP,
  expires_at: TIMESTAMP
})

const TrustArtifactRowSchema = z.strictObject({
  rate_card_id: UUID,
  model_provider: z.string(),
  model_id: z.string(),
  input_usd_micros_per_million_tokens: DB_INTEGER,
  output_usd_micros_per_million_tokens: DB_INTEGER,
  source_digest: DIGEST,
  valid_from: TIMESTAMP,
  valid_until: TIMESTAMP,
  approval_id: UUID,
  plan_digest: DIGEST,
  approved_by: UUID,
  reason: z.string(),
  max_spend_usd_micros: DB_INTEGER,
  approved_at: TIMESTAMP,
  expires_at: TIMESTAMP
})
const RevocationSchema = z.strictObject({
  revokedBy: UUID,
  reason: z.string().trim().min(10).max(1_000)
})
const ApprovalCommandSchema = z.strictObject({
  approvalId: UUID,
  evaluationRunId: UUID,
  planDigest: DIGEST,
  approvedBy: UUID,
  reason: z.string().trim().min(10).max(1_000),
  maxSpendUsdMicros: z.number().int().nonnegative().max(10_000_000_000),
  expiresAt: z.string().datetime({ offset: true })
})
const PlanCommandSchema = z.strictObject({
  evaluationRunId: UUID,
  departmentId: UUID,
  planDigest: DIGEST,
  rateCardId: UUID,
  estimatedUpperBoundUsdMicros: z.number().int().nonnegative().max(10_000_000_000),
  maxModelCalls: z.number().int().min(1).max(500),
  createdBy: UUID
})
const TrustedArtifactLookupSchema = z.strictObject({
  evaluationRunId: UUID,
  planDigest: DIGEST,
  rateCardId: UUID,
  approvalId: UUID
})

export interface EvaluationApprovalSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

export interface StoredEvaluationRateCard extends EvaluationModelRateCard {
  id: string
  createdBy: string
  createdAt: string
}

export interface EvaluationExecutionPlanRecord {
  evaluationRunId: string
  departmentId: string
  planDigest: string
  rateCardId: string
  estimatedUpperBoundUsdMicros: number
  maxModelCalls: number
  createdBy: string
  createdAt: string
}

export interface StoredEvaluationCostApproval extends EvaluationCostApproval {
  evaluationRunId: string
  rateCardId: string
}

export interface EvaluationApprovalStore {
  registerRateCard(input: Omit<StoredEvaluationRateCard, 'createdAt'>): Promise<StoredEvaluationRateCard>
  persistPlan(input: Omit<EvaluationExecutionPlanRecord, 'createdAt'>): Promise<EvaluationExecutionPlanRecord>
  approvePlan(input: Omit<EvaluationCostApproval, 'approvedAt'> & { evaluationRunId: string }): Promise<StoredEvaluationCostApproval>
  revokeRateCard(input: { rateCardId: string, revokedBy: string, reason: string }): Promise<void>
  revokeApproval(input: { approvalId: string, revokedBy: string, reason: string }): Promise<void>
  loadTrustedArtifacts(input: {
    evaluationRunId: string
    planDigest: string
    rateCardId: string
    approvalId: string
  }): Promise<{ rateCard: EvaluationModelRateCard, approval: EvaluationCostApproval } | null>
}

export class EvaluationApprovalStoreError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'EvaluationApprovalStoreError'
  }
}

export function createStoredEvaluationAdmissionDependencies(
  artifacts: { rateCard: EvaluationModelRateCard, approval: EvaluationCostApproval },
  now: () => Date
): EvaluationAdmissionDependencies {
  const storedRateCard = EvaluationModelRateCardSchema.parse({
    modelProvider: artifacts.rateCard.modelProvider,
    modelId: artifacts.rateCard.modelId,
    inputUsdMicrosPerMillionTokens: artifacts.rateCard.inputUsdMicrosPerMillionTokens,
    outputUsdMicrosPerMillionTokens: artifacts.rateCard.outputUsdMicrosPerMillionTokens,
    sourceDigest: artifacts.rateCard.sourceDigest,
    validFrom: artifacts.rateCard.validFrom,
    validUntil: artifacts.rateCard.validUntil
  })
  const storedApproval = EvaluationCostApprovalSchema.parse(artifacts.approval)
  return {
    now,
    isTrustedRateCard(candidate) {
      const parsed = EvaluationModelRateCardSchema.safeParse(candidate)
      return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(storedRateCard)
    },
    isTrustedApproval(candidate) {
      const parsed = EvaluationCostApprovalSchema.safeParse(candidate)
      return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(storedApproval)
    }
  }
}

function mapRateCard(raw: unknown): StoredEvaluationRateCard {
  const row = RateCardRowSchema.parse(raw)
  const rateCard = EvaluationModelRateCardSchema.parse({
    modelProvider: row.model_provider,
    modelId: row.model_id,
    inputUsdMicrosPerMillionTokens: row.input_usd_micros_per_million_tokens,
    outputUsdMicrosPerMillionTokens: row.output_usd_micros_per_million_tokens,
    sourceDigest: row.source_digest,
    validFrom: row.valid_from,
    validUntil: row.valid_until
  })
  return { id: row.id, ...rateCard, createdBy: row.created_by, createdAt: row.created_at }
}

function mapPlan(raw: unknown): EvaluationExecutionPlanRecord {
  const row = PlanRowSchema.parse(raw)
  return {
    evaluationRunId: row.evaluation_run_id,
    departmentId: row.department_id,
    planDigest: row.plan_digest,
    rateCardId: row.rate_card_id,
    estimatedUpperBoundUsdMicros: row.estimated_upper_bound_usd_micros,
    maxModelCalls: row.max_model_calls,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

function mapApproval(raw: unknown): StoredEvaluationCostApproval {
  const row = ApprovalRowSchema.parse(raw)
  const approval = EvaluationCostApprovalSchema.parse({
    approvalId: row.id,
    planDigest: row.plan_digest,
    approvedBy: row.approved_by,
    reason: row.reason,
    maxSpendUsdMicros: row.max_spend_usd_micros,
    approvedAt: row.approved_at,
    expiresAt: row.expires_at
  })
  return { ...approval, evaluationRunId: row.evaluation_run_id, rateCardId: row.rate_card_id }
}

export function createPostgresEvaluationApprovalStore(
  client: EvaluationApprovalSqlClient
): EvaluationApprovalStore {
  return {
    async registerRateCard(input) {
      const parsed = EvaluationModelRateCardSchema.parse({
        modelProvider: input.modelProvider,
        modelId: input.modelId,
        inputUsdMicrosPerMillionTokens: input.inputUsdMicrosPerMillionTokens,
        outputUsdMicrosPerMillionTokens: input.outputUsdMicrosPerMillionTokens,
        sourceDigest: input.sourceDigest,
        validFrom: input.validFrom,
        validUntil: input.validUntil
      })
      const normalized = {
        ...parsed,
        validFrom: new Date(parsed.validFrom).toISOString(),
        validUntil: new Date(parsed.validUntil).toISOString()
      }
      const id = UUID.parse(input.id)
      const createdBy = UUID.parse(input.createdBy)
      const result = await client.query(
        `WITH inserted AS (
         INSERT INTO ai_eval_model_rate_cards (
           id, model_provider, model_id,
           input_usd_micros_per_million_tokens, output_usd_micros_per_million_tokens,
           source_digest, valid_from, valid_until, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::uuid)
         ON CONFLICT (id) DO NOTHING
         RETURNING *
         )
         SELECT * FROM inserted
         UNION ALL
         SELECT * FROM ai_eval_model_rate_cards WHERE id = $1::uuid
         LIMIT 1`,
        [
          id, normalized.modelProvider, normalized.modelId,
          normalized.inputUsdMicrosPerMillionTokens, normalized.outputUsdMicrosPerMillionTokens,
          normalized.sourceDigest, normalized.validFrom, normalized.validUntil, createdBy
        ]
      )
      if (!result.rows[0]) throw new EvaluationApprovalStoreError('rate_card_conflict', 'Rate card could not be stored')
      const stored = mapRateCard(result.rows[0])
      if (
        stored.modelProvider !== normalized.modelProvider
        || stored.modelId !== normalized.modelId
        || stored.inputUsdMicrosPerMillionTokens !== normalized.inputUsdMicrosPerMillionTokens
        || stored.outputUsdMicrosPerMillionTokens !== normalized.outputUsdMicrosPerMillionTokens
        || stored.sourceDigest !== normalized.sourceDigest
        || stored.validFrom !== normalized.validFrom
        || stored.validUntil !== normalized.validUntil
        || stored.createdBy !== createdBy
      ) throw new EvaluationApprovalStoreError('rate_card_conflict', 'Rate card identity conflicts with stored evidence')
      return stored
    },

    async persistPlan(input) {
      const plan = PlanCommandSchema.parse(input)
      const result = await client.query(
        `WITH inserted AS (
         INSERT INTO ai_eval_execution_plans (
           evaluation_run_id, department_id, plan_digest, rate_card_id,
           estimated_upper_bound_usd_micros, max_model_calls, created_by
         ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7::uuid)
         ON CONFLICT (evaluation_run_id) DO NOTHING
         RETURNING *
         )
         SELECT * FROM inserted
         UNION ALL
         SELECT * FROM ai_eval_execution_plans WHERE evaluation_run_id = $1::uuid
         LIMIT 1`,
        [
          plan.evaluationRunId, plan.departmentId, plan.planDigest, plan.rateCardId,
          plan.estimatedUpperBoundUsdMicros, plan.maxModelCalls, plan.createdBy
        ]
      )
      if (!result.rows[0]) throw new EvaluationApprovalStoreError('plan_conflict', 'Evaluation plan could not be stored')
      const stored = mapPlan(result.rows[0])
      if (
        stored.departmentId !== plan.departmentId
        || stored.planDigest !== plan.planDigest
        || stored.rateCardId !== plan.rateCardId
        || stored.estimatedUpperBoundUsdMicros !== plan.estimatedUpperBoundUsdMicros
        || stored.maxModelCalls !== plan.maxModelCalls
        || stored.createdBy !== plan.createdBy
      ) throw new EvaluationApprovalStoreError('plan_conflict', 'Evaluation plan identity conflicts with stored evidence')
      return stored
    },

    async approvePlan(input) {
      const approval = ApprovalCommandSchema.parse({
        approvalId: input.approvalId,
        evaluationRunId: input.evaluationRunId,
        planDigest: input.planDigest,
        approvedBy: input.approvedBy,
        reason: input.reason,
        maxSpendUsdMicros: input.maxSpendUsdMicros,
        expiresAt: input.expiresAt
      })
      const normalizedExpiry = new Date(approval.expiresAt).toISOString()
      const result = await client.query(
        `WITH inserted AS (
         INSERT INTO ai_eval_cost_approvals (
           id, evaluation_run_id, rate_card_id, plan_digest, approved_by,
           reason, max_spend_usd_micros, approved_at, expires_at
         )
         SELECT $1::uuid, plan.evaluation_run_id, plan.rate_card_id, plan.plan_digest, $4::uuid,
                $5, $6, NOW(), $7::timestamptz
           FROM ai_eval_execution_plans plan
           JOIN ai_eval_model_rate_cards rate_card ON rate_card.id = plan.rate_card_id
           LEFT JOIN ai_eval_model_rate_card_revocations rate_revocation
             ON rate_revocation.rate_card_id = rate_card.id
           LEFT JOIN ai_eval_cost_approvals approval
             ON approval.evaluation_run_id = plan.evaluation_run_id
          WHERE plan.evaluation_run_id = $2::uuid
            AND plan.plan_digest = $3
            AND $6::bigint >= plan.estimated_upper_bound_usd_micros
            AND NOW() >= rate_card.valid_from
            AND $7::timestamptz > NOW()
            AND $7::timestamptz <= rate_card.valid_until
            AND rate_revocation.rate_card_id IS NULL
            AND approval.id IS NULL
         RETURNING *
         )
         SELECT * FROM inserted
         UNION ALL
         SELECT * FROM ai_eval_cost_approvals WHERE id = $1::uuid
         LIMIT 1`,
        [
          approval.approvalId, approval.evaluationRunId, approval.planDigest, approval.approvedBy,
          approval.reason, approval.maxSpendUsdMicros, normalizedExpiry
        ]
      )
      if (!result.rows[0]) {
        throw new EvaluationApprovalStoreError('approval_not_admitted', 'Evaluation approval was not admitted')
      }
      const stored = mapApproval(result.rows[0])
      if (
        stored.evaluationRunId !== approval.evaluationRunId
        || stored.planDigest !== approval.planDigest
        || stored.approvedBy !== approval.approvedBy
        || stored.reason !== approval.reason
        || stored.maxSpendUsdMicros !== approval.maxSpendUsdMicros
        || stored.expiresAt !== normalizedExpiry
      ) throw new EvaluationApprovalStoreError('approval_conflict', 'Approval identity conflicts with stored evidence')
      return stored
    },

    async loadTrustedArtifacts(input) {
      const lookup = TrustedArtifactLookupSchema.parse(input)
      const result = await client.query(
        `SELECT rate_card.id AS rate_card_id, rate_card.model_provider, rate_card.model_id,
                rate_card.input_usd_micros_per_million_tokens,
                rate_card.output_usd_micros_per_million_tokens,
                rate_card.source_digest, rate_card.valid_from, rate_card.valid_until,
                approval.id AS approval_id, approval.plan_digest, approval.approved_by,
                approval.reason, approval.max_spend_usd_micros,
                approval.approved_at, approval.expires_at
           FROM ai_eval_execution_plans plan
           JOIN ai_eval_model_rate_cards rate_card ON rate_card.id = plan.rate_card_id
           JOIN ai_eval_cost_approvals approval
             ON approval.evaluation_run_id = plan.evaluation_run_id
            AND approval.plan_digest = plan.plan_digest
            AND approval.rate_card_id = rate_card.id
           LEFT JOIN ai_eval_model_rate_card_revocations rate_revocation
             ON rate_revocation.rate_card_id = rate_card.id
           LEFT JOIN ai_eval_cost_approval_revocations approval_revocation
             ON approval_revocation.approval_id = approval.id
          WHERE plan.evaluation_run_id = $1::uuid
            AND plan.plan_digest = $2
            AND rate_card.id = $3::uuid
            AND approval.id = $4::uuid
            AND rate_revocation.rate_card_id IS NULL
            AND approval_revocation.approval_id IS NULL`,
        [lookup.evaluationRunId, lookup.planDigest, lookup.rateCardId, lookup.approvalId]
      )
      if (!result.rows[0]) return null
      const row = TrustArtifactRowSchema.parse(result.rows[0])
      return {
        rateCard: EvaluationModelRateCardSchema.parse({
          modelProvider: row.model_provider,
          modelId: row.model_id,
          inputUsdMicrosPerMillionTokens: row.input_usd_micros_per_million_tokens,
          outputUsdMicrosPerMillionTokens: row.output_usd_micros_per_million_tokens,
          sourceDigest: row.source_digest,
          validFrom: row.valid_from,
          validUntil: row.valid_until
        }),
        approval: EvaluationCostApprovalSchema.parse({
          approvalId: row.approval_id,
          planDigest: row.plan_digest,
          approvedBy: row.approved_by,
          reason: row.reason,
          maxSpendUsdMicros: row.max_spend_usd_micros,
          approvedAt: row.approved_at,
          expiresAt: row.expires_at
        })
      }
    },

    async revokeRateCard(input) {
      const id = UUID.parse(input.rateCardId)
      const revocation = RevocationSchema.parse({ revokedBy: input.revokedBy, reason: input.reason })
      const result = await client.query(
        `INSERT INTO ai_eval_model_rate_card_revocations (rate_card_id, revoked_by, reason)
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT (rate_card_id) DO NOTHING
         RETURNING rate_card_id`,
        [id, revocation.revokedBy, revocation.reason]
      )
      if (!result.rows[0]) throw new EvaluationApprovalStoreError('rate_card_already_revoked', 'Rate card is already revoked')
    },

    async revokeApproval(input) {
      const id = UUID.parse(input.approvalId)
      const revocation = RevocationSchema.parse({ revokedBy: input.revokedBy, reason: input.reason })
      const result = await client.query(
        `INSERT INTO ai_eval_cost_approval_revocations (approval_id, revoked_by, reason)
         VALUES ($1::uuid, $2::uuid, $3)
         ON CONFLICT (approval_id) DO NOTHING
         RETURNING approval_id`,
        [id, revocation.revokedBy, revocation.reason]
      )
      if (!result.rows[0]) throw new EvaluationApprovalStoreError('approval_already_revoked', 'Approval is already revoked')
    }
  }
}
