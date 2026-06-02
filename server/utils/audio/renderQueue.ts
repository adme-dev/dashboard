// server/utils/audio/renderQueue.ts — thin producer boundary to the timeline-render
// CF Queue. Isolated so endpoints stay testable (mock this module) and so the
// binding-lookup gotcha (CF Pages producer binding) lives in one place.
import type { AudioChannel } from '~~/server/utils/audio/profiles'

export interface TimelineRenderMessage {
  jobId: string
  projectId: string
  timelineId: string
  channels: AudioChannel[]
}

interface QueueBinding { send(body: unknown): Promise<void> }

/** Resolve the producer binding from the CF env on the event context. Returns null
 * when unbound (local dev / missing binding) so the caller can decide. */
function getQueue(event: any): QueueBinding | null {
  return (event?.context?.cloudflare?.env?.TIMELINE_RENDER_QUEUE as QueueBinding) ?? null
}

export async function enqueueTimelineRender(event: any, msg: TimelineRenderMessage): Promise<void> {
  const queue = getQueue(event)
  if (!queue) throw new Error('TIMELINE_RENDER_QUEUE binding unavailable')
  await queue.send(msg)
}
