export interface VideoGenerationMessage {
  jobId: string
  tenantId: string
  idempotencyKey: string
}

interface QueueBinding {
  send(body: unknown): Promise<void>
}

function getVideoGenerationQueue(event: any): QueueBinding | null {
  return (event?.context?.cloudflare?.env?.VIDEO_GENERATION_QUEUE as QueueBinding) ?? null
}

export async function enqueueVideoGeneration(event: any, msg: VideoGenerationMessage): Promise<void> {
  const queue = getVideoGenerationQueue(event)
  if (!queue) throw new Error('VIDEO_GENERATION_QUEUE binding unavailable')
  await queue.send(msg)
}
