// workers/leads-delivery-worker/src/notifications.ts
// No-op stub for ~~/server/utils/notifications. The synced notifyOnNew.ts
// references createNotification, but it's never reached from the Worker queue
// path — notifications are dispatched by the Pages app at lead ingestion
// time, before enqueuing rule evaluation. Bundled here only because the sync
// script copies the entire server/utils/leads/ tree.

export async function createNotification(_params: any): Promise<any> {
  // Intentionally no-op in Worker context.
  return null
}
