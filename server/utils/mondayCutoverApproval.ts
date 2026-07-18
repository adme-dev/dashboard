import { createHash } from 'node:crypto'
import { z } from 'zod'
import { queryOne, transaction } from '~~/server/utils/db'
import {
  MondayCutoverResolutionsSchema,
  type MondayCutoverResolutions
} from '~~/server/utils/mondayCutoverPlan'

const TargetBoardIdSchema = z.string().uuid()
const RevisionSchema = z.number().int().positive().max(2_147_483_647)
const ApprovalReasonSchema = z.string().trim().min(10).max(1000)

export const MondayCutoverApprovalDraftSchema = z.strictObject({
  targetBoardId: TargetBoardIdSchema,
  expectedRevision: RevisionSchema.nullable(),
  resolutions: MondayCutoverResolutionsSchema
})

export const MondayCutoverApprovalCommandSchema = z.strictObject({
  targetBoardId: TargetBoardIdSchema,
  expectedRevision: RevisionSchema,
  reason: ApprovalReasonSchema
})

const ResolutionJsonSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, MondayCutoverResolutionsSchema)

const DatabaseTimestampSchema = z.preprocess(
  value => value instanceof Date ? value.toISOString() : value,
  z.string().datetime({ offset: true })
)

const MondayCutoverApprovalRowSchema = z.strictObject({
  id: z.string().uuid(),
  source_board_id: z.string().regex(/^\d+$/).max(30),
  target_board_id: TargetBoardIdSchema,
  revision: RevisionSchema,
  state: z.enum(['draft', 'approved']),
  resolutions: ResolutionJsonSchema,
  plan_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  created_by: z.string().uuid(),
  updated_by: z.string().uuid(),
  approved_by: z.string().uuid().nullable(),
  approval_reason: z.string().min(10).max(1000).nullable(),
  created_at: DatabaseTimestampSchema,
  updated_at: DatabaseTimestampSchema,
  approved_at: DatabaseTimestampSchema.nullable()
})

export type MondayCutoverApprovalArtifact = {
  id: string
  sourceBoardId: string
  targetBoardId: string
  revision: number
  state: 'draft' | 'approved'
  resolutions: MondayCutoverResolutions
  planFingerprint: string
  createdBy: string
  updatedBy: string
  approvedBy: string | null
  approvalReason: string | null
  createdAt: string
  updatedAt: string
  approvedAt: string | null
}

export class MondayCutoverApprovalConflictError extends Error {
  constructor() {
    super('Monday cutover approval revision conflict')
    this.name = 'MondayCutoverApprovalConflictError'
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    )
  }
  return value
}

function sha256(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

export function fingerprintMondayCutoverPlan(plan: unknown): string {
  return sha256(plan)
}

export function hashMondayCutoverResolutions(resolutions: MondayCutoverResolutions): string {
  return sha256(MondayCutoverResolutionsSchema.parse(resolutions))
}

function toArtifact(value: unknown): MondayCutoverApprovalArtifact {
  const row = MondayCutoverApprovalRowSchema.parse(value)
  return {
    id: row.id,
    sourceBoardId: row.source_board_id,
    targetBoardId: row.target_board_id,
    revision: row.revision,
    state: row.state,
    resolutions: row.resolutions,
    planFingerprint: row.plan_fingerprint,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    approvedBy: row.approved_by,
    approvalReason: row.approval_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at
  }
}

export async function getMondayCutoverApprovalArtifact(
  sourceBoardId: string,
  targetBoardId: string
): Promise<MondayCutoverApprovalArtifact | null> {
  const row = await queryOne(
    `SELECT id,
            source_board_id,
            target_board_id,
            revision,
            state,
            resolutions,
            plan_fingerprint,
            created_by,
            updated_by,
            approved_by,
            approval_reason,
            created_at,
            updated_at,
            approved_at
       FROM monday_cutover_approval_artifacts
      WHERE source_board_id = $1
        AND target_board_id = $2::uuid`,
    [sourceBoardId, targetBoardId]
  )
  return row ? toArtifact(row) : null
}

type SaveDraftInput = {
  sourceBoardId: string
  targetBoardId: string
  expectedRevision: number | null
  resolutions: MondayCutoverResolutions
  planFingerprint: string
  actorId: string
}

export async function saveMondayCutoverApprovalDraft(
  input: SaveDraftInput
): Promise<MondayCutoverApprovalArtifact> {
  const parsedResolutions = MondayCutoverResolutionsSchema.parse(input.resolutions)
  const resolutionJson = JSON.stringify(parsedResolutions)

  return transaction(async (db) => {
    const result = input.expectedRevision === null
      ? await db.query(
          `INSERT INTO monday_cutover_approval_artifacts (
             source_board_id,
             target_board_id,
             revision,
             state,
             resolutions,
             plan_fingerprint,
             created_by,
             updated_by
           ) VALUES ($1, $2::uuid, 1, 'draft', $3::jsonb, $4, $5::uuid, $5::uuid)
           ON CONFLICT (source_board_id, target_board_id) DO NOTHING
           RETURNING id,
                     source_board_id,
                     target_board_id,
                     revision,
                     state,
                     resolutions,
                     plan_fingerprint,
                     created_by,
                     updated_by,
                     approved_by,
                     approval_reason,
                     created_at,
                     updated_at,
                     approved_at`,
          [input.sourceBoardId, input.targetBoardId, resolutionJson, input.planFingerprint, input.actorId]
        )
      : await db.query(
          `UPDATE monday_cutover_approval_artifacts
              SET revision = revision + 1,
                  resolutions = $4::jsonb,
                  plan_fingerprint = $5,
                  updated_by = $6::uuid,
                  updated_at = NOW()
            WHERE source_board_id = $1
              AND target_board_id = $2::uuid
              AND revision = $3
              AND state = 'draft'
          RETURNING id,
                     source_board_id,
                     target_board_id,
                     revision,
                     state,
                     resolutions,
                     plan_fingerprint,
                     created_by,
                     updated_by,
                     approved_by,
                     approval_reason,
                     created_at,
                     updated_at,
                     approved_at`,
          [
            input.sourceBoardId,
            input.targetBoardId,
            input.expectedRevision,
            resolutionJson,
            input.planFingerprint,
            input.actorId
          ]
        )

    const savedRow = result.rows[0]
    if (!savedRow) throw new MondayCutoverApprovalConflictError()
    const artifact = toArtifact(savedRow)

    await db.query(
      `INSERT INTO monday_cutover_approval_audit (
         artifact_id,
         revision,
         action,
         actor_id,
         resolution_hash,
         plan_fingerprint
       ) VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6)`,
      [
        artifact.id,
        artifact.revision,
        'saved',
        input.actorId,
        hashMondayCutoverResolutions(artifact.resolutions),
        artifact.planFingerprint
      ]
    )
    return artifact
  })
}

type ApproveArtifactInput = {
  sourceBoardId: string
  targetBoardId: string
  expectedRevision: number
  planFingerprint: string
  actorId: string
  reason: string
}

export async function approveMondayCutoverArtifact(
  input: ApproveArtifactInput
): Promise<MondayCutoverApprovalArtifact> {
  return transaction(async (db) => {
    const result = await db.query(
      `UPDATE monday_cutover_approval_artifacts
          SET revision = revision + 1,
              state = 'approved',
              approved_by = $5::uuid,
              approval_reason = $6,
              approved_at = NOW(),
              updated_by = $5::uuid,
              updated_at = NOW()
        WHERE source_board_id = $1
          AND target_board_id = $2::uuid
          AND revision = $3
          AND plan_fingerprint = $4
          AND state = 'draft'
      RETURNING id,
                     source_board_id,
                     target_board_id,
                     revision,
                     state,
                     resolutions,
                     plan_fingerprint,
                     created_by,
                     updated_by,
                     approved_by,
                     approval_reason,
                     created_at,
                     updated_at,
                     approved_at`,
      [
        input.sourceBoardId,
        input.targetBoardId,
        input.expectedRevision,
        input.planFingerprint,
        input.actorId,
        input.reason
      ]
    )

    const approvedRow = result.rows[0]
    if (!approvedRow) throw new MondayCutoverApprovalConflictError()
    const artifact = toArtifact(approvedRow)

    await db.query(
      `INSERT INTO monday_cutover_approval_audit (
         artifact_id,
         revision,
         action,
         actor_id,
         resolution_hash,
         plan_fingerprint
       ) VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6)`,
      [
        artifact.id,
        artifact.revision,
        'approved',
        input.actorId,
        hashMondayCutoverResolutions(artifact.resolutions),
        artifact.planFingerprint
      ]
    )
    return artifact
  })
}
