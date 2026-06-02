// server/utils/audio/projects.ts — SOLE gateway to media_projects / media_timelines.
// Mirrors assets.ts so a future client-portal surface (SP6) reuses it untouched.
// Validation/duration math lives in the pure timelineSchema.ts; this file is the
// DB boundary only.
import { randomUUID } from 'crypto'
import type { MediaProject, MediaTimeline } from '~~/app/types'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { computeDuration, type TimelineState } from '~~/server/utils/audio/timelineSchema'

/** Pure: DB row (snake_case) → MediaProject (camelCase). */
export function mapProjectRow(row: any): MediaProject {
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    createdBy: row.created_by,
    title: row.title ?? null,
    mediaType: row.media_type,
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
