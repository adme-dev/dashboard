/** Nightly hot/warm/cold intent-tier recompute for every persona-identity-
 *  enabled client. Cron-gated. Wire in CF dashboard: POST with header
 *  x-cron-secret: $CRON_SECRET, daily. */
import { recomputePersonaTiers } from '~~/server/utils/persona/tierRecompute'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const results = await recomputePersonaTiers()
  const failures = results.filter(result => result.error)
  return {
    ok: true,
    clients: results.length,
    tiered: results.reduce((sum, result) => sum + result.tiered, 0),
    failed: failures.length,
    failures: failures.map(result => ({ clientId: result.clientId, error: result.error }))
  }
})
