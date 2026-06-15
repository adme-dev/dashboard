/**
 * TEMPORARY diagnostic (Meta $0-sync investigation, 2026-06-15).
 * Replicates the sync's per-account Meta insights call from Cloudflare egress and
 * returns the rate-limit headers (x-app-usage etc.) so we can confirm whether the
 * per-account prod path is being throttled (200 + empty data). cron-secret gated.
 * Remove after diagnosis.
 */
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { ofetch } from 'ofetch'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event).catch(() => ({})) as { connectionId?: string }
  const conn = body.connectionId
    ? await queryOne<any>(`SELECT id, account_id, account_name, access_token, metadata FROM social_connections WHERE id=$1 AND platform='meta' AND status='active'`, [body.connectionId])
    : await queryOne<any>(`SELECT id, account_id, account_name, access_token, metadata FROM social_connections WHERE platform='meta' AND status='active' ORDER BY account_name LIMIT 1`)
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'no meta connection' })

  const actId = conn.metadata?.actId || `act_${conn.account_id}`
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const since = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const until = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const t0 = Date.now()
  try {
    const res = await ofetch.raw(`https://graph.facebook.com/v22.0/${actId}/insights`, {
      method: 'GET',
      query: {
        fields: 'campaign_id,campaign_name,spend,impressions,clicks',
        time_range: JSON.stringify({ since, until }),
        level: 'campaign',
        access_token: conn.access_token,
        limit: '500',
      },
    })
    const h = res.headers
    const data = (res._data as any)?.data
    return {
      ok: true,
      account: actId,
      accountName: conn.account_name,
      ms: Date.now() - t0,
      dataLength: Array.isArray(data) ? data.length : null,
      sampleSpend: Array.isArray(data) ? data.slice(0, 3).map((d: any) => ({ c: d.campaign_name, spend: d.spend })) : null,
      xAppUsage: h.get('x-app-usage'),
      xBusinessUseCaseUsage: h.get('x-business-use-case-usage'),
      xAdAccountUsage: h.get('x-ad-account-usage'),
    }
  } catch (err: any) {
    return {
      ok: false,
      account: actId,
      ms: Date.now() - t0,
      status: err?.status || err?.statusCode,
      error: err?.data?.error || err?.message,
      xAppUsage: err?.response?.headers?.get?.('x-app-usage') ?? null,
    }
  }
})
