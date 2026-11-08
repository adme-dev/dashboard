// server/api/cron/xero-customer-sync.post.ts
//
// Cron entrypoint for the Xero customer cache + rollup refresh.
// Configure a Cloudflare Cron Trigger of `*/15 * * * *` (every 15 minutes)
// pointing at this endpoint with header `x-cron-secret: $CRON_SECRET`.
//
// Behaviour:
//  • Resolves the connected Xero org from xero_org_connection.
//  • Refreshes the access token if it's near expiry.
//  • Runs a delta sync (modifiedAfter = last successful run) by default.
//    Pass ?full=true to force a from-scratch resync — useful for the
//    initial backfill and after schema additions.
//
// Auth: x-cron-secret header matched against CRON_SECRET env var.
// Authentication is required in every environment.

import { defineEventHandler, getQuery } from 'h3'
import { requireFinanceCronJob } from '~~/server/utils/financeMachineAccess'
import { resolveCronXeroAuth } from '~~/server/utils/xeroCronAuth'
import { fullCustomerSync } from '~~/server/utils/xeroCustomerSync'

export default defineEventHandler(async (event) => {
  requireFinanceCronJob(event)

  const query = getQuery(event)
  const full = query.full === 'true' || query.full === '1'

  const auth = await resolveCronXeroAuth('xero-customer-sync')
  if (!auth) {
    return { ok: true, skipped: 'no Xero connection' }
  }
  const { tenantId, accessToken } = auth

  const result = await fullCustomerSync({
    tenantId,
    accessToken,
    full,
  })

  return {
    ok: result.errors.length === 0,
    tenant: tenantId,
    mode: full ? 'full' : 'delta',
    ...result,
  }
})
