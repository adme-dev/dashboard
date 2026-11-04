import { createError } from 'h3'
import { TimelineWritePreconditionSchema } from '~~/shared/video/timelineRevision'
import type { TimelineWritePrecondition } from '~~/shared/video/timelineRevision'

export function timelineConflict() {
  return createError({ statusCode: 409, statusMessage: 'This timeline changed. Keep your local edit and reload the saved version.', data: { code: 'timeline_revision_conflict' } })
}

export function requireTimelinePrecondition(input: unknown): TimelineWritePrecondition {
  const parsed = TimelineWritePreconditionSchema.safeParse(input)
  if (!parsed.success) throw timelineConflict()
  return parsed.data
}

export function assertTimelinePrecondition(timeline: { id: string, editRevision: number }, input: TimelineWritePrecondition) {
  if (timeline.id !== input.expectedTimelineId || timeline.editRevision !== input.expectedEditRevision) throw timelineConflict()
}
