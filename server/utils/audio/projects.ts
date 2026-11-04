import { carryTimelineObligationsIn } from '~~/server/utils/video-storyboard/lineage'
// server/utils/audio/projects.ts — SOLE gateway to media_projects / media_timelines.
// Mirrors assets.ts so a future client-portal surface (SP6) reuses it untouched.
// Validation/duration math lives in the pure timelineSchema.ts; this file is the
// DB boundary only.
import { randomUUID } from 'crypto'
import { createError } from 'h3'
import { requireTimelinePrecondition, assertTimelinePrecondition, timelineConflict } from './timelineRevision'
import type { TimelineWritePrecondition } from '~~/shared/video/timelineRevision'
import type { MediaProject, MediaTimeline, MediaRenderJob } from '~~/app/types'
import { queryOne, queryOneFresh, queryRows, transaction } from '~~/server/utils/db'
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
    editRevision: row.edit_revision ?? 0,
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
  const projectRow = await queryOneFresh(`SELECT * FROM media_projects WHERE id = $1`, [id])
  if (!projectRow) return null
  const project = mapProjectRow(projectRow)
  let timeline: MediaTimeline | null = null
  if (project.currentTimelineId) {
    const tlRow = await queryOneFresh(`SELECT * FROM media_timelines WHERE id = $1`, [project.currentTimelineId])
    timeline = tlRow ? mapTimelineRow(tlRow) : null
  }
  return { project, timeline }
}

/** Project row by id through the uncached primitive, for authorization decisions that must see the
 * current client association (the cached route can return a moved project's earlier client). */
export async function getProjectFresh(id: string): Promise<MediaProject | null> {
  const row = await queryOneFresh(`SELECT * FROM media_projects WHERE id = $1`, [id])
  return row ? mapProjectRow(row) : null
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

export interface MediaProjectActor { id: string, role: string }

export function assertMediaProjectAccess(actor: MediaProjectActor, project: { createdBy: string }) {
  if (!actor || (actor.role !== 'owner' && actor.role !== 'admin' && project.createdBy !== actor.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied to this project' })
  }
}

type RevisionInput = TimelineWritePrecondition & { projectId: string, actor: MediaProjectActor }

/** Project-row lock is shared by every active-state/pointer writer. */
async function lockCurrentTimelineIn(db: Db, input: RevisionInput) {
  const precondition = requireTimelinePrecondition(input)
  const project = (await db.query('SELECT * FROM media_projects WHERE id = $1 FOR UPDATE', [input.projectId])).rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  assertMediaProjectAccess(input.actor, mapProjectRow(project))
  if (project.current_timeline_id !== precondition.expectedTimelineId) throw timelineConflict()
  const timeline = (await db.query('SELECT * FROM media_timelines WHERE id = $1 AND project_id = $2', [precondition.expectedTimelineId, input.projectId])).rows[0]
  if (!timeline) throw timelineConflict()
  assertTimelinePrecondition(mapTimelineRow(timeline), precondition)
  return { project, timeline }
}

/** A replay receipt is valid only while that exact revision is still current. */
export async function getCurrentTimelineIfMatchingIn(db: Db, input: RevisionInput): Promise<MediaTimeline> {
  const { timeline } = await lockCurrentTimelineIn(db, input)
  return mapTimelineRow(timeline)
}

export interface SaveDraftTimelineInput extends RevisionInput { state: TimelineState }

export async function saveDraftTimeline(input: SaveDraftTimelineInput): Promise<MediaTimeline> {
  return transaction(db => saveDraftTimelineIfCurrentIn(db, input))
}

export async function saveDraftTimelineIfCurrentIn(db: Db, input: SaveDraftTimelineInput): Promise<MediaTimeline> {
  const { project, timeline } = await lockCurrentTimelineIn(db, input)
  if (project.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Project is not editable' })
  const persisted = { ...input.state, duration_sec: computeDuration(input.state) }
  const usedByRender = (await db.query('SELECT EXISTS (SELECT 1 FROM media_render_jobs WHERE timeline_id = $1) AS exists', [timeline.id])).rows[0]?.exists
  // Older application versions made their render snapshot active. Preserve those
  // bytes too: fork the first new edit instead of changing an existing job's input.
  if (usedByRender) {
    const next = await insertTimelineIn(db, input.projectId, persisted, timeline.schema_version, input.actor.id, null, timeline.edit_revision + 1)
    await db.query('UPDATE media_projects SET current_timeline_id = $1, updated_at = now() WHERE id = $2', [next.id, input.projectId])
    await carryTimelineObligationsIn(db, { projectId: input.projectId, fromTimelineId: timeline.id, fromEditRevision: timeline.edit_revision, timelineId: next.id, editRevision: next.editRevision, state: persisted, actorId: input.actor.id })
    return next
  }
  const row = (await db.query(
    `UPDATE media_timelines SET state = $1, edit_revision = edit_revision + 1
     WHERE id = $2 AND project_id = $3 AND edit_revision = $4 RETURNING *`,
    [JSON.stringify(persisted), timeline.id, input.projectId, input.expectedEditRevision]
  )).rows[0]
  if (!row) throw timelineConflict()
  await carryTimelineObligationsIn(db, { projectId: input.projectId, fromTimelineId: timeline.id, fromEditRevision: timeline.edit_revision, timelineId: row.id, editRevision: row.edit_revision, state: persisted, actorId: input.actor.id })
  return mapTimelineRow(row)
}

/** Called only under the project lock, so version allocation cannot race. */
async function insertTimelineIn(db: Db, projectId: string, state: unknown, schemaVersion: number, actorId: string, label: string | null, revision = 0): Promise<MediaTimeline> {
  const max = (await db.query('SELECT MAX(version) AS max_version FROM media_timelines WHERE project_id = $1', [projectId])).rows[0]
  const row = (await db.query(
    `INSERT INTO media_timelines (id, project_id, version, label, state, schema_version, created_by, edit_revision)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [randomUUID(), projectId, Number(max.max_version) + 1, label, JSON.stringify(state), schemaVersion, actorId, revision]
  )).rows[0]
  return mapTimelineRow(row)
}

/** Read a single timeline row by id (God mode replay). */
export async function getTimelineIn(db: Db, timelineId: string): Promise<MediaTimeline | null> {
  const row = (await db.query(`SELECT * FROM media_timelines WHERE id = $1`, [timelineId])).rows[0]
  return row ? mapTimelineRow(row) : null
}

export interface CreateVersionInput extends RevisionInput { label?: string | null }

/** Freeze the prior row; the checked successor becomes the editable draft. */
export async function createVersion(input: CreateVersionInput): Promise<MediaTimeline> {
  return transaction(db => createVersionIn(db, input))
}

export async function createVersionIn(db: Db, input: CreateVersionInput): Promise<MediaTimeline> {
  const { timeline } = await lockCurrentTimelineIn(db, input)
  const next = await insertTimelineIn(db, input.projectId, timeline.state, timeline.schema_version, input.actor.id, input.label ?? null)
  await db.query('UPDATE media_projects SET current_timeline_id = $1, updated_at = now() WHERE id = $2', [next.id, input.projectId])
  await carryTimelineObligationsIn(db, { projectId: input.projectId, fromTimelineId: timeline.id, fromEditRevision: timeline.edit_revision, timelineId: next.id, editRevision: next.editRevision, state: timeline.state, actorId: input.actor.id })
  return next
}

/** Restore a server-owned saved version and that version's exact obligations.
 * A new draft preserves both the prior edit and the historical source. */
export async function restoreTimelineVersionIn(db: Db, input: RevisionInput & { restoreTimelineId: string }): Promise<MediaTimeline> {
  const { project, timeline } = await lockCurrentTimelineIn(db, input)
  if (project.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Project is not editable' })
  const source = (await db.query('SELECT * FROM media_timelines WHERE id = $1 AND project_id = $2', [input.restoreTimelineId, input.projectId])).rows[0]
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Saved version not found' })
  const next = await insertTimelineIn(db, input.projectId, source.state, source.schema_version, input.actor.id, 'restored version', timeline.edit_revision + 1)
  await carryTimelineObligationsIn(db, { projectId: input.projectId, fromTimelineId: source.id, fromEditRevision: source.edit_revision, timelineId: next.id, editRevision: next.editRevision, state: source.state, actorId: input.actor.id })
  await db.query('UPDATE media_projects SET current_timeline_id = $1, updated_at = now() WHERE id = $2', [next.id, input.projectId])
  return next
}

/** Atomic storyboard replacement: freeze the old row (including its obligations)
 * as the checkpoint, then move the pointer to a fresh edit. Caller owns transaction. */
export async function replaceTimelineWithCheckpointIn(db: Db, input: SaveDraftTimelineInput) {
  const { project, timeline } = await lockCurrentTimelineIn(db, input)
  if (project.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Project is not editable' })
  const persisted = { ...input.state, duration_sec: computeDuration(input.state) }
  const next = await insertTimelineIn(db, input.projectId, persisted, input.state.schema_version, input.actor.id, null, timeline.edit_revision + 1)
  await db.query('UPDATE media_projects SET current_timeline_id = $1, updated_at = now() WHERE id = $2', [next.id, input.projectId])
  return { checkpoint: mapTimelineRow(timeline), timeline: next }
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

export interface CreateRenderJobInput extends RevisionInput {
  channels: string[]
  /** Pre-reserved id (God mode ledger); minted when omitted. */
  jobId?: string
}

/** Immutable render snapshot is never the editable draft. */
export async function createRenderJob(input: CreateRenderJobInput): Promise<MediaRenderJob> {
  return transaction(db => createRenderJobIn(db, input))
}

export async function createRenderJobIn(db: Db, input: CreateRenderJobInput): Promise<MediaRenderJob> {
  const { timeline } = await lockCurrentTimelineIn(db, input)
  const snapshot = await insertTimelineIn(db, input.projectId, timeline.state, timeline.schema_version, input.actor.id, 'render snapshot')
  const row = (await db.query(
    `INSERT INTO media_render_jobs (id, timeline_id, project_id, channels, status, requested_by)
     VALUES ($1, $2, $3, $4, 'queued', $5) RETURNING *`,
    [input.jobId ?? randomUUID(), snapshot.id, input.projectId, input.channels, input.actor.id]
  )).rows[0]
  await carryTimelineObligationsIn(db, { projectId: input.projectId, fromTimelineId: timeline.id, fromEditRevision: timeline.edit_revision, timelineId: snapshot.id, editRevision: snapshot.editRevision, state: timeline.state, actorId: input.actor.id })
  return mapRenderJobRow(row)
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
