// server/utils/audio/renderQueue.ts — thin producer boundary to the timeline-render
// and video-render CF Queues. Isolated so endpoints stay testable (mock this module)
// and so the binding-lookup gotcha (CF Pages producer binding) lives in one place.
import type { AudioChannel } from '~~/server/utils/audio/profiles'

export interface TimelineRenderMessage {
  jobId: string
  projectId: string
  timelineId: string
  channels: AudioChannel[]
}

export interface ResolvedOverlay {
  clipId: string
  htmlKey: string               // R2 key for the uploaded banner HTML
  timeline_start_sec: number
  duration_sec: number
}

export interface VideoRenderMessage {
  jobId: string
  projectId: string
  timelineId: string
  formats: string[]
  resolvedOverlays?: ResolvedOverlay[]
}

interface QueueBinding { send(body: unknown): Promise<void> }

/** Resolve the producer binding from the CF env on the event context. Returns null
 * when unbound (local dev / missing binding) so the caller can decide. */
function getQueue(event: any): QueueBinding | null {
  return (event?.context?.cloudflare?.env?.TIMELINE_RENDER_QUEUE as QueueBinding) ?? null
}

function getVideoQueue(event: any): QueueBinding | null {
  return (event?.context?.cloudflare?.env?.VIDEO_RENDER_QUEUE as QueueBinding) ?? null
}

export async function enqueueTimelineRender(event: any, msg: TimelineRenderMessage): Promise<void> {
  const queue = getQueue(event)
  if (!queue) throw new Error('TIMELINE_RENDER_QUEUE binding unavailable')
  await queue.send(msg)
}

export async function enqueueVideoRender(event: any, msg: VideoRenderMessage): Promise<void> {
  const queue = getVideoQueue(event)
  if (!queue) throw new Error('VIDEO_RENDER_QUEUE binding unavailable')
  await queue.send(msg)
}
