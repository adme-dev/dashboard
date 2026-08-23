// server/utils/audio/projects.ts — SOLE gateway to media_projects / media_timelines.
// Mirrors assets.ts so a future client-portal surface (SP6) reuses it untouched.
// Validation/duration math lives in the pure timelineSchema.ts; this file is the
// DB boundary only.
import { randomUUID } from 'crypto'
import type { MediaProject, MediaTimeline, MediaRenderJob } from '~~/app/types'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import { computeDuration, type TimelineState } from '~~/server/utils/audio/timelineSchema'

/** Pure: DB row (snake_case) → MediaProject (camelCase). */
export function mapProjectRow(row: any): MediaProject {
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    createdBy: row.created_by,
    title: row.title ?? null,
    mediaType: row.media_type,
    isTest: row.is_test ?? false,
    status: row.status,
    currentTimelineId: row.current_timeline_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** Pure: DB row (snake_case) → MediaTimeline (camelCase). */
export function mapTimelineRow(row: any): MediaTimeline {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    label: row.label ?? null,
    state: row.state,
    schemaVersion: row.schema_version,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

export interface CreateProjectInput {
  createdBy: string
  clientId: string | null
  title: string | null
  initialState: TimelineState
  mediaType?: 'audio' | 'av'
}

/** Insert a project + its v1 timeline in one transaction, then point
 * current_timeline_id at the v1 row. Inside transaction(), use db.query()
 * directly (a dedicated client) — never queryOne/execute (separate connection). */
export async function createProject(
  input: CreateProjectInput
): Promise<{ project: MediaProject; timeline: MediaTimeline }> {
  return transaction(db => createProjectIn(db, input))
}

/** Transaction-scoped core of createProject — run under a caller-owned db. */
export async function createProjectIn(
  db: Db,
  input: CreateProjectInput
): Promise<{ project: MediaProject; timeline: MediaTimeline }> {
  const projectId = randomUUID()
  const timelineId = randomUUID()
  const state = { ...input.initialState, duration_sec: computeDuration(input.initialState) }
  const mediaType = input.mediaType ?? 'audio'
  const schemaVersion = input.initialState.schema_version

  {
    const projRes = await db.query(
      `INSERT INTO media_projects (id, client_id, created_by, title, media_type, status)
       VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING *`,
      [projectId, input.clientId, input.createdBy, input.title, mediaType]
    )
    const tlRes = await db.query(
      `INSERT INTO media_timelines (id, project_id, version, state, schema_version, created_by)
       VALUES ($1, $2, 1, $3, $4, $5) RETURNING *`,
      [timelineId, projectId, JSON.stringify(state), schemaVersion, input.createdBy]
    )
    const updRes = await db.query(
      `UPDATE media_projects SET current_timeline_id = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [timelineId, projectId]
    )
    return {
      project: mapProjectRow(updRes.rows[0]),
      timeline: mapTimelineRow(tlRes.rows[0])
    }
  }
}

/** Rename / re-home a project. Returns null when the project does not exist.
 * `undefined` fields are left untouched; `null` clears them. */
export async function updateProjectIn(
  db: Db,
  id: string,
  patch: { title?: string | null; clientId?: string | null }
): Promise<MediaProject | null> {
  const sets: string[] = ['updated_at = now()']
  const params: unknown[] = [id]
  if (patch.title !== undefined) { params.push(patch.title === '' ? null : patch.title); sets.push(`title = $${params.length}`) }
  if (patch.clientId !== undefined) { params.push(patch.clientId); sets.push(`client_id = $${params.length}`) }
  const row = (await db.query(`UPDATE media_projects SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params)).rows[0]
  return row ? mapProjectRow(row) : null
}

/** Read back a project + its current timeline by id (used for God mode replay). */
export async function getProjectWithCurrentTimelineIn(
  db: Db,
  id: string
): Promise<{ project: MediaProject; timeline: MediaTimeline | null } | null> {
  const projectRow = (await db.query(`SELECT * FROM media_projects WHERE id = $1`, [id])).rows[0]
  if (!projectRow) return null
  const project = mapProjectRow(projectRow)
  let timeline: MediaTimeline | null = null
  if (project.currentTimelineId) {
    const tlRow = (await db.query(`SELECT * FROM media_timelines WHERE id = $1`, [project.currentTimelineId])).rows[0]
    timeline = tlRow ? mapTimelineRow(tlRow) : null
  }
  return { project, timeline }
}

/** Project + its current timeline (the draft pointer). null if no such project. */
export async function getProjectWithCurrentTimeline(
  id: string
): Promise<{ project: MediaProject; timeline: MediaTimeline | null } | null> {
  const projectRow = await queryOne(`SELECT * FROM media_projects WHERE id = $1`, [id])
  if (!projectRow) return null
  const project = mapProjectRow(projectRow)
  let timeline: MediaTimeline | null = null
  if (project.currentTimelineId) {
    const tlRow = await queryOne(`SELECT * FROM media_timelines WHERE id = $1`, [project.currentTimelineId])
    timeline = tlRow ? mapTimelineRow(tlRow) : null
  }
  return { project, timeline }
}

/** Delete a project and all its dependent rows in one transaction.
 * media_timelines cascades from media_projects (FK ON DELETE CASCADE), but
 * media_render_jobs.timeline_id references media_timelines WITHOUT a cascade —
 * so the render jobs must be removed first (by project_id) or the timeline
 * delete is blocked. Returns false if the project did not exist. */
export async function deleteProject(id: string): Promise<boolean> {
  return transaction(db => deleteProjectIn(db, id))
}

/** Transaction-scoped core of deleteProject. */
export async function deleteProjectIn(db: Db, id: string): Promise<boolean> {
  {
    const exists = await db.query(`SELECT id FROM media_projects WHERE id = $1`, [id])
    if (!exists.rows[0]) return false
    // Render jobs first (no cascade on timeline_id FK).
    await db.query(`DELETE FROM media_render_jobs WHERE project_id = $1`, [id])
    // Deleting the project cascades its media_timelines rows.
    await db.query(`DELETE FROM media_projects WHERE id = $1`, [id])
    return true
  }
}

/** List projects, optionally filtered by client. */
export async function listProjects(clientId?: string): Promise<MediaProject[]> {
  const where = clientId ? 'WHERE client_id = $1' : ''
  const params = clientId ? [clientId] : []
  // SP0: hard cap; pagination deferred (mirrors assets.ts ceiling)
  const rows = await queryRows(
    `SELECT * FROM media_projects ${where} ORDER BY updated_at DESC LIMIT 200`,
    params
  )
  return rows.map(mapProjectRow)
}

/** Autosave: overwrite a draft timeline row's state in place, recomputing
 * duration_sec into the persisted state. The caller (endpoint) is responsible
 * for confirming the project is still in 'draft' status. */
export async function saveDraftTimeline(timelineId: string, state: TimelineState): Promise<MediaTimeline> {
  return transaction(db => saveDraftTimelineIn(db, timelineId, state))
}

/** Transaction-scoped core of saveDraftTimeline. */
export async function saveDraftTimelineIn(db: Db, timelineId: string, state: TimelineState): Promise<MediaTimeline> {
  const persisted = { ...state, duration_sec: computeDuration(state) }
  const row = (await db.query(
    `UPDATE media_timelines SET state = $1 WHERE id = $2 RETURNING *`,
    [JSON.stringify(persisted), timelineId]
  )).rows[0]
  if (!row) throw new Error(`timeline ${timelineId} not found`)
  return mapTimelineRow(row)
}

/** Read a single timeline row by id (God mode replay). */
export async function getTimelineIn(db: Db, timelineId: string): Promise<MediaTimeline | null> {
  const row = (await db.query(`SELECT * FROM media_timelines WHERE id = $1`, [timelineId])).rows[0]
  return row ? mapTimelineRow(row) : null
}

export interface CreateVersionInput {
  projectId: string
  createdBy: string
  label?: string | null
}

/** Duplicate-to-version: snapshot the project's current state into a new
 * version (max+1) and repoint current_timeline_id at it. The new row becomes the
 * editable draft; the prior row is frozen history. */
export async function createVersion(input: CreateVersionInput): Promise<MediaTimeline> {
  return transaction(db => createVersionIn(db, input))
}

/** Transaction-scoped core of createVersion. */
export async function createVersionIn(db: Db, input: CreateVersionInput): Promise<MediaTimeline> {
  const newId = randomUUID()
  {
    const cur = await db.query(
      `SELECT t.state AS state,
              (SELECT MAX(version) FROM media_timelines WHERE project_id = $1) AS max_version
       FROM media_projects p
       JOIN media_timelines t ON t.id = p.current_timeline_id
       WHERE p.id = $1`,
      [input.projectId]
    )
    if (!cur.rows[0]) throw new Error(`project ${input.projectId} has no current timeline`)
    const nextVersion = Number(cur.rows[0].max_version) + 1
    const ins = await db.query(
      `INSERT INTO media_timelines (id, project_id, version, label, state, schema_version, created_by)
       VALUES ($1, $2, $3, $4, $5, 1, $6) RETURNING *`,
      [newId, input.projectId, nextVersion, input.label ?? null,
        JSON.stringify(cur.rows[0].state), input.createdBy]
    )
    await db.query(
      `UPDATE media_projects SET current_timeline_id = $1, updated_at = now() WHERE id = $2`,
      [newId, input.projectId]
    )
    return mapTimelineRow(ins.rows[0])
  }
}

/** Version history for a project, newest-first. */
export async function listVersions(projectId: string): Promise<MediaTimeline[]> {
  const rows = await queryRows(
    `SELECT * FROM media_timelines WHERE project_id = $1 ORDER BY version DESC`,
    [projectId]
  )
  return rows.map(mapTimelineRow)
}

/** Pure: media_render_jobs row → MediaRenderJob (camelCase). */
export function mapRenderJobRow(row: any): MediaRenderJob {
  return {
    id: row.id,
    timelineId: row.timeline_id,
    projectId: row.project_id,
    channels: row.channels ?? [],
    status: row.status,
    variants: row.variants ?? {},
    progress: row.progress ?? null,
    costCents: row.cost_cents ?? null,
    error: row.error ?? null,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface CreateRenderJobInput {
  projectId: string
  requestedBy: string
  channels: string[]
  /** Pre-reserved id (God mode ledger); minted when omitted. */
  jobId?: string
}

/** Snapshot the current draft into a new immutable version (SP0 §6), then insert a
 * queued render job pointing at that frozen version — all in one transaction so a
 * job never references a half-written version. */
export async function createRenderJob(input: CreateRenderJobInput): Promise<MediaRenderJob> {
  const newTimelineId = randomUUID()
  const jobId = input.jobId ?? randomUUID()
  return transaction(async (db) => {
    const cur = await db.query(
      `SELECT t.state AS state, t.schema_version AS schema_version,
              (SELECT MAX(version) FROM media_timelines WHERE project_id = $1) AS max_version
       FROM media_projects p
       JOIN media_timelines t ON t.id = p.current_timeline_id
       WHERE p.id = $1`,
      [input.projectId]
    )
    if (!cur.rows[0]) throw new Error(`project ${input.projectId} has no current timeline`)
    const nextVersion = Number(cur.rows[0].max_version) + 1
    const sourceSchemaVersion = cur.rows[0].schema_version ?? 1
    await db.query(
      `INSERT INTO media_timelines (id, project_id, version, label, state, schema_version, created_by)
       VALUES ($1, $2, $3, 'render snapshot', $4, $5, $6)`,
      [newTimelineId, input.projectId, nextVersion, JSON.stringify(cur.rows[0].state), sourceSchemaVersion, input.requestedBy]
    )
    await db.query(
      `UPDATE media_projects SET current_timeline_id = $1, updated_at = now() WHERE id = $2`,
      [newTimelineId, input.projectId]
    )
    const job = await db.query(
      `INSERT INTO media_render_jobs (id, timeline_id, project_id, channels, status, requested_by)
       VALUES ($1, $2, $3, $4, 'queued', $5) RETURNING *`,
      [jobId, newTimelineId, input.projectId, input.channels, input.requestedBy]
    )
    return mapRenderJobRow(job.rows[0])
  })
}

/** Single render job by id, or null if not found. */
export async function getRenderJob(jobId: string): Promise<MediaRenderJob | null> {
  const row = await queryOne(`SELECT * FROM media_render_jobs WHERE id = $1`, [jobId])
  return row ? mapRenderJobRow(row) : null
}

/** Render jobs for a project, newest-first. */
export async function listRenderJobs(projectId: string): Promise<MediaRenderJob[]> {
  const rows = await queryRows(
    `SELECT * FROM media_render_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [projectId]
  )
  return rows.map(mapRenderJobRow)
}

export async function markRenderJobRendering(jobId: string): Promise<MediaRenderJob> {
  const row = await queryOne(
    `UPDATE media_render_jobs SET status = 'rendering', updated_at = now() WHERE id = $1 RETURNING *`,
    [jobId]
  )
  if (!row) throw new Error(`render job ${jobId} not found`)
  return mapRenderJobRow(row)
}

export async function markRenderJobDone(
  jobId: string,
  variants: Record<string, string>,
  costCents: number | null
): Promise<MediaRenderJob> {
  const row = await queryOne(
    `UPDATE media_render_jobs SET status = 'done', variants = $1, cost_cents = $2, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [JSON.stringify(variants), costCents, jobId]
  )
  if (!row) throw new Error(`render job ${jobId} not found`)
  return mapRenderJobRow(row)
}

export async function markRenderJobFailed(jobId: string, error: string): Promise<MediaRenderJob> {
  const row = await queryOne(
    `UPDATE media_render_jobs SET status = 'failed', error = $1, updated_at = now()
     WHERE id = $2 RETURNING *`,
    [error, jobId]
  )
  if (!row) throw new Error(`render job ${jobId} not found`)
  return mapRenderJobRow(row)
}
