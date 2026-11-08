import { createError, type H3Event } from 'h3'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import { isStoryboardFeatureEnabled } from '~~/shared/video/storyboardFeaturePolicy'

export interface StoryboardProductionFlags {
  production: boolean
  storyboard: boolean
  generation: boolean
}

export function isStoryboardProductionEnabled(value: unknown): boolean {
  return value === 'true'
}

/** A present Cloudflare env object is authoritative, including explicit false/undefined values. */
export function readStoryboardProductionFlags(
  cloudflareEnv: Record<string, unknown> | undefined,
  localEnv: Record<string, unknown> = process.env
): StoryboardProductionFlags {
  const env = cloudflareEnv === undefined ? localEnv : cloudflareEnv
  return {
    production: isStoryboardProductionEnabled(env.VIDEO_STORYBOARD_PRODUCTION_ENABLED),
    storyboard: isStoryboardFeatureEnabled(env.VIDEO_STORYBOARD_ENABLED as string | undefined),
    generation: env.VIDEO_GENERATION_ENABLED === 'true'
  }
}

export function requireStoryboardProductionEnabled(event: H3Event): void {
  const cloudflare = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare
  const flags = readStoryboardProductionFlags(cloudflare?.env)
  if (!flags.production || !flags.storyboard || !flags.generation) {
    throw createError({ statusCode: 404, statusMessage: 'Storyboard production is not enabled' })
  }
}

/** Re-read role and read-only state inside the mutation transaction, not from a stale session. */
export async function requireFreshProductionActorIn(
  db: GodModeTransactionDb,
  actor: MediaProjectActor
): Promise<MediaProjectActor> {
  const row = (await db.query(
    `SELECT tm.user_role AS role, COALESCE(cr.is_read_only, FALSE) AS custom_read_only
       FROM team_members tm
       LEFT JOIN custom_roles cr ON cr.id = tm.custom_role_id
      WHERE tm.id = $1 AND tm.is_active = TRUE`,
    [actor.id]
  )).rows[0]
  if (!row || isReadOnlyRole(row.role) || row.custom_read_only) {
    throw createError({ statusCode: 403, statusMessage: 'Active storyboard write access is required' })
  }
  return { id: actor.id, role: row.role }
}

export async function requireActiveProductionTenantIn(
  db: GodModeTransactionDb,
  clientId: string | null
): Promise<void> {
  if (clientId === null) return
  const row = (await db.query(
    'SELECT is_active FROM agency_clients WHERE id = $1 FOR SHARE',
    [clientId]
  )).rows[0]
  if (!row?.is_active) {
    throw createError({ statusCode: 403, statusMessage: 'Project client is not active' })
  }
}

export function requireProductionAllowanceAdministrator(actor: MediaProjectActor): void {
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Production allowance administration is restricted' })
  }
}
