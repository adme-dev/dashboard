import { createError } from 'h3'
import { assertMediaProjectAccess, type MediaProjectActor } from '~~/server/utils/audio/projects'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'

export interface StoryboardProject { id: string, clientId: string | null, createdBy: string }

/** Reads only authorize; writes share the existing project-row lock. */
export async function requireStoryboardProjectIn(db: GodModeTransactionDb, projectId: string, actor: MediaProjectActor, lock = false): Promise<StoryboardProject> {
  const row = (await db.query(`SELECT id, client_id, created_by, media_type FROM media_projects WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [projectId])).rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertMediaProjectAccess(actor, { createdBy: row.created_by })
  if (row.media_type !== 'av') throw createError({ statusCode: 400, statusMessage: 'Storyboards require a video project' })
  return { id: row.id, clientId: row.client_id ?? null, createdBy: row.created_by }
}
