import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { reelmotionVideoTimeline, type SavedReel, type ManagedAudio } from '~~/shared/video/reelmotionImport'
import { createProjectIn, getProjectWithCurrentTimelineIn, assertMediaProjectAccess, type MediaProjectActor } from './projects'

type Db = Parameters<typeof createProjectIn>[0]
const defaults = { create: createProjectIn, find: getProjectWithCurrentTimelineIn }

/** Source/actor identity plus transaction lock reconciles ordinary-staff retries too. */
export async function getOrCreateReelmotionProjectIn(db: Db, input: { bannerId: string, clientId: string, actor: MediaProjectActor }, deps = defaults) {
  const identity = `reelmotion-companion:${input.actor.id}:${input.clientId}:${input.bannerId}`
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity])
  const source = (await db.query(`SELECT id, name, client_id AS "clientId", canvas_data AS "canvasData", tags, status
    FROM banner_projects WHERE id = $1 FOR SHARE`, [input.bannerId])).rows[0] as (SavedReel & { name: string, tags: string[], status: string }) | undefined
  if (!source || source.clientId !== input.clientId || source.status !== 'draft' || !source.tags.includes('source:reelmotion')) throw createError({ statusCode: 403, statusMessage: 'ReelMotion source draft is unavailable for this client' })
  const h = createHash('sha256').update(identity).digest('hex')
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
  const existing = await deps.find(db, id)
  if (existing) {
    assertMediaProjectAccess(input.actor, existing.project)
    if (existing.project.clientId !== input.clientId || existing.project.mediaType !== 'av') throw createError({ statusCode: 409, statusMessage: 'Video draft identity changed' })
    return existing
  }
  const urls = Object.values(source.canvasData).flatMap(board => board.layers.filter(layer => layer.type === 'audio').map(layer => layer.src).filter(Boolean))
  const assets = (await db.query(`SELECT id, url, r2_key AS "r2Key", client_id AS "clientId", mime_type AS "mimeType"
    FROM banner_assets WHERE client_id = $1 AND url = ANY($2::text[])`, [input.clientId, urls])).rows as ManagedAudio[]
  const initialState = reelmotionVideoTimeline(source, assets)
  return deps.create(db, { id, createdBy: input.actor.id, clientId: input.clientId, title: source.name, mediaType: 'av', initialState })
}
