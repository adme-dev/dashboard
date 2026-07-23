// server/utils/leads/queue.ts
// Producer-side: enqueue a delivery to LEADS_DELIVERY_QUEUE if available,
// otherwise dispatch inline (dev / no-binding fallback). The companion
// Worker is the queue consumer; this file never consumes.

export interface QueueMessage {
  type: 'rules.evaluate' | 'delivery.dispatch' | 'crm.promote'
  payload: { lead_id?: string; delivery_id?: string },
  attempt?: number
  delaySeconds?: number
}

// Renamed from `enqueue` to avoid collision with `server/utils/queue.ts` exports
// in Nuxt's auto-import scan.
export async function enqueueLeadJob(msg: QueueMessage): Promise<void> {
  const event = (globalThis as any).useEvent?.()
  const queue = event?.context?.cloudflare?.env?.LEADS_DELIVERY_QUEUE
  if (queue && typeof queue.send === 'function') {
    const opts = msg.delaySeconds ? { delaySeconds: Math.min(43200, msg.delaySeconds) } : undefined
    await queue.send(msg, opts as any)
    return
  }
  // Fallback: inline dispatch via dynamic import (avoids circular import at top)
  const { handleQueueMessage } = await import('./dispatch')
  await handleQueueMessage(msg)
}
