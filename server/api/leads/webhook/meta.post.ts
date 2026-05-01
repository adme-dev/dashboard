// POST /api/leads/webhook/meta
//
// Meta lead-event receiver. Phase 1 scope: archive the inbound event payload
// for replay when Phase 2 (full lead retrieval via Graph API) ships. We
// always-200 so Meta doesn't disable the subscription, regardless of internal
// processing state.
//
// Real Meta lead events look like:
//   { object: "page", entry: [{ id: pageId, time, changes: [{
//       value: { ad_id, form_id, leadgen_id, created_time, page_id },
//       field: "leadgen"
//   }] }] }
//
// To convert a leadgen_id into actual lead data we need a separate
// GET /{leadgen_id} call against the Graph API with the leads_retrieval scope
// — which requires Meta App Review. Until that's complete, we capture the
// event metadata so we can backfill once the scope lands.

import { logIngestionError } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  const headers = getRequestHeaders(event)
  const body = await readBody(event).catch(() => null)

  // Always log — phase 1 has no in-flight processing path. The retention
  // cron will purge these after 30 days if no Phase 2 backfill happens.
  await logIngestionError(
    'meta',
    body,
    headers,
    'phase_1_archive: lead_retrieval scope not yet approved',
  ).catch(() => { /* never throw on log failure — Meta wants 200 */ })

  return { ok: true }
})
