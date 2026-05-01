/**
 * Daily cron: regenerate advisor recommendations.
 *
 * Mirrors the anomaly-detection cron — Cloudflare Cron Triggers should
 * hit this hourly with x-cron-secret. The local-hour gate ensures we
 * only run once per day at 6am tenant-local (one hour before anomaly
 * detection so the inbox is fresh by morning standup).
 *
 * Runs all three generators serially against the connected Xero org.
 * Each generator is idempotent — clients/projects with an open rec in
 * the same category are skipped.
 *
 * Use ?force=true to bypass the local-hour gate for manual triggers.
 */

import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { getActiveOrgToken } from '~~/server/utils/tokenStore'
import {
  runCollectionsGenerator,
  runAdPacingGenerator,
  runProjectBurnGenerator,
  runRetainerCapGenerator,
  runConcentrationGenerator,
  runLeadsVolumeGenerator,
  runAgiPerFteGenerator,
  runVendorHygieneGenerator,
} from '~~/server/utils/advisorGenerators'

const TARGET_LOCAL_HOUR = 6

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!import.meta.dev && cronSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

  const conn = await queryOne<{ tenant_id: string; timezone: string }>(
    `SELECT tenant_id, timezone FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`,
  )
  if (!conn) {
    return { ok: true, skipped: 'no Xero connection' }
  }

  const tz = conn.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(
      new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }),
    )
  } catch (err) {
    console.warn('[advisor-cron] invalid timezone, falling back to UTC:', tz, err)
    localHour = new Date().getUTCHours()
  }

  if (!force && localHour !== TARGET_LOCAL_HOUR) {
    return { ok: true, tenant_id: conn.tenant_id, timezone: tz, skipped: `local hour=${localHour}` }
  }

  // Get the active token (auto-refreshes if expired). Collections needs Xero;
  // the other two are DB-only but we still gate on org connectivity.
  let accessToken: string
  try {
    const token = await getActiveOrgToken(event)
    accessToken = token.access_token!
  } catch (err: any) {
    console.error('[advisor-cron] failed to get Xero token:', err?.message ?? err)
    return { ok: false, error: 'token-refresh-failed', tenant_id: conn.tenant_id }
  }

  const start = Date.now()

  // Run generators serially. They write independent rows; failure in one
  // shouldn't block the others. Capture errors per-generator so the cron
  // result tells us which arm failed.
  const results: Record<string, any> = {}

  for (const [name, runner] of [
    ['collections', () => runCollectionsGenerator(conn.tenant_id, accessToken)],
    ['ad-pacing', () => runAdPacingGenerator(conn.tenant_id)],
    ['project-burn', () => runProjectBurnGenerator(conn.tenant_id)],
    ['retainer-cap', () => runRetainerCapGenerator(conn.tenant_id)],
    ['concentration', () => runConcentrationGenerator(conn.tenant_id, accessToken)],
    ['leads-volume', () => runLeadsVolumeGenerator(conn.tenant_id)],
    ['agi-per-fte', () => runAgiPerFteGenerator(conn.tenant_id, accessToken)],
    ['vendor-hygiene', () => runVendorHygieneGenerator(conn.tenant_id)],
  ] as const) {
    try {
      results[name] = await runner()
    } catch (err: any) {
      console.error(`[advisor-cron] ${name} failed:`, err?.message ?? err)
      results[name] = { error: err?.message ?? String(err) }
    }
  }

  const durationMs = Date.now() - start

  console.log('[advisor-cron]', {
    tenant_id: conn.tenant_id,
    timezone: tz,
    localHour,
    forced: force,
    durationMs,
    results,
  })

  return {
    ok: true,
    tenant_id: conn.tenant_id,
    timezone: tz,
    localHour,
    forced: force,
    durationMs,
    results,
  }
})
