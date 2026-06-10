export interface AssetIntelligenceMessage {
  jobId: string
  projectId: string
  sourceAssetId: string
}

interface QueueBinding {
  send(body: unknown): Promise<void>
}

export function getAssetIntelligenceQueue(event: any): QueueBinding | null {
  return (event?.context?.cloudflare?.env?.ASSET_INTELLIGENCE_QUEUE as QueueBinding) ?? null
}

export async function enqueueAssetIntelligence(event: any, msg: AssetIntelligenceMessage): Promise<void> {
  const queue = getAssetIntelligenceQueue(event)
  if (!queue) throw new Error('ASSET_INTELLIGENCE_QUEUE binding unavailable')
  await queue.send(msg)
}
