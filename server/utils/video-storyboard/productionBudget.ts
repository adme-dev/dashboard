import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import { SetShotProductionAllowanceRequestSchema } from '~~/shared/video/storyboardProduction'
import { VIDEO_GENERATION_TENANT_LOCK_SQL } from '~~/shared/video/generationLiability'
import { requireStoryboardProjectIn } from './access'
import { fenceWriteAuthorityIn } from './apply'
import {
  requireActiveProductionTenantIn,
  requireFreshProductionActorIn,
  requireProductionAllowanceAdministrator
} from './productionPolicy'

export interface ProjectProductionAllowance {
  projectId: string
  currency: 'USD'
  allowanceCents: number
  configured: boolean
  updatedBy: string | null
  updatedAt: string | null
}

export async function lockStoryboardProductionBudgetIn(
  db: GodModeTransactionDb,
  tenantId: string
): Promise<void> {
  await db.query(VIDEO_GENERATION_TENANT_LOCK_SQL, [tenantId])
}

/** Absence means a zero ceiling, never an unlimited or stored remaining balance. */
export async function getProjectProductionAllowanceIn(
  db: GodModeTransactionDb,
  projectId: string
): Promise<ProjectProductionAllowance> {
  const row = (await db.query(
    `SELECT project_id, currency, allowance_cents, updated_by, updated_at
       FROM video_storyboard_production_allowances WHERE project_id = $1`,
    [projectId]
  )).rows[0]
  if (!row) {
    return {
      projectId,
      currency: 'USD',
      allowanceCents: 0,
      configured: false,
      updatedBy: null,
      updatedAt: null
    }
  }
  return {
    projectId: row.project_id,
    currency: 'USD',
    allowanceCents: Number(row.allowance_cents),
    configured: true,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null
  }
}

export interface SetProjectProductionAllowanceInput {
  projectId: string
  allowanceCents: number
  actor: MediaProjectActor
}

export async function setProjectProductionAllowanceIn(
  db: GodModeTransactionDb,
  input: SetProjectProductionAllowanceInput
): Promise<ProjectProductionAllowance> {
  const parsed = SetShotProductionAllowanceRequestSchema.safeParse({
    projectId: input.projectId,
    allowanceCents: input.allowanceCents
  })
  if (!parsed.success) throw new TypeError('Invalid project production allowance')

  const freshActor = await requireFreshProductionActorIn(db, input.actor)
  requireProductionAllowanceAdministrator(freshActor)
  const unlocked = await requireStoryboardProjectIn(db, input.projectId, freshActor)
  const tenantId = unlocked.clientId ?? 'agency'
  await lockStoryboardProductionBudgetIn(db, tenantId)
  const project = await requireStoryboardProjectIn(db, input.projectId, freshActor, true)
  if (project.clientId !== unlocked.clientId) {
    throw createError({ statusCode: 409, statusMessage: 'Project client changed; reload before production' })
  }
  await fenceWriteAuthorityIn(db, freshActor)
  await requireActiveProductionTenantIn(db, project.clientId)

  const previous = await getProjectProductionAllowanceIn(db, project.id)
  const row = (await db.query(
    `INSERT INTO video_storyboard_production_allowances (
       project_id, currency, allowance_cents, updated_by, updated_at
     ) VALUES ($1, 'USD', $2, $3, now())
     ON CONFLICT (project_id) DO UPDATE SET
       allowance_cents = EXCLUDED.allowance_cents,
       updated_by = EXCLUDED.updated_by,
       updated_at = EXCLUDED.updated_at
     RETURNING project_id, currency, allowance_cents, updated_by, updated_at`,
    [project.id, parsed.data.allowanceCents, freshActor.id]
  )).rows[0]

  await db.query(
    `INSERT INTO video_storyboard_production_allowance_audits (
       project_id, previous_allowance_cents, allowance_cents, actor_id
     ) VALUES ($1, $2, $3, $4)`,
    [
      project.id,
      previous.configured ? previous.allowanceCents : null,
      parsed.data.allowanceCents,
      freshActor.id
    ]
  )

  return {
    projectId: row.project_id,
    currency: 'USD',
    allowanceCents: Number(row.allowance_cents),
    configured: true,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  }
}

export function setProjectProductionAllowance(
  input: SetProjectProductionAllowanceInput
): Promise<ProjectProductionAllowance> {
  return transaction(db => setProjectProductionAllowanceIn(db, input))
}
