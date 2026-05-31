// server/api/cron/campaign-dispatch.post.ts
// Campaign send engine tick (Phase 2b-2b). Auth: x-cron-secret vs CRON_SECRET
// (mirror of anomaly-detection.post.ts). Promotes due scheduled campaigns and
// drains in-flight ones a bounded amount. Self-gates: a no-op unless
// EMAIL_SENDING_ENABLED=true (the hard send gate).
//
// ⚠️ This route is DORMANT until its cron trigger is enabled in the Cloudflare
// dashboard (Workers & Pages → Triggers → Cron, e.g. every minute). Enabling it
// is an explicit operator action — do not enable without sign-off.
import { defineEventHandler, getHeader, createError } from 'h3'
import { setCfBindings } from '~~/server/utils/email'
import { dispatchCampaigns } from '~~/server/utils/email-marketing/campaignSender'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  // Surface CF bindings (RESEND_API_KEY etc.) to the gate/transport in cron ctx.
  setCfBindings((event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env)

  const summary = await dispatchCampaigns()
  return { ok: true, ...summary }
})
