// server/utils/reports/runReports.ts
/**
 * Orchestrates scheduled white-label reports: pick due schedules, compose from
 * the canonical fact, render white-label HTML, archive to R2, email recipients
 * via Resend, and record a report_runs row. Reused by the cron and the manual
 * "send now" endpoint.
 *
 * PDF rendering is intentionally not wired (no Cloudflare Browser Rendering
 * binding present) — reports are delivered as HTML + an archived link. Swap
 * renderReportHtml's output through Browser Rendering when that binding lands.
 */
import type { H3Event } from 'h3'
import { queryRows, queryOne, execute } from '../db'
import { fetchCanonicalFact } from '../canonicalFactQuery'
import { uploadFile } from '../storage'
import { sendAnalyticsReportEmail } from '../email'
import {
  composeReportModel,
  renderReportHtml,
  cadenceWindowDays,
  isReportDue,
  type ReportCadence,
  type ReportBranding
} from './reportModel'

interface ScheduleRow {
  id: string
  client_id: string | null
  cadence: ReportCadence
  recipients: string[]
  branding: ReportBranding | string | null
  last_run_at: string | null
}

export interface ReportRunResult {
  scheduleId: string
  status: 'success' | 'failed' | 'partial'
  reportUrl?: string | null
  error?: string | null
}

function parseBranding(b: ScheduleRow['branding']): ReportBranding {
  if (!b) return {}
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as ReportBranding
    } catch {
      return {}
    }
  }
  return b
}

async function runReport(event: H3Event | null, schedule: ScheduleRow, now: Date): Promise<ReportRunResult> {
  const endDate = now.toISOString().slice(0, 10)
  const startDate = new Date(now.getTime() - cadenceWindowDays(schedule.cadence) * 86_400_000).toISOString().slice(0, 10)

  const clientName = schedule.client_id
    ? (await queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [schedule.client_id]))?.name || 'Client'
    : 'All Clients'

  const fact = await fetchCanonicalFact({ startDate, endDate, clientId: schedule.client_id || undefined })
  const model = composeReportModel(clientName, { startDate, endDate }, fact)
  const html = renderReportHtml(model, parseBranding(schedule.branding))

  let status: ReportRunResult['status'] = 'success'
  let error: string | null = null
  let r2Key: string | null = null
  let reportUrl: string | null = null

  // Archive to R2 (best-effort).
  try {
    const key = `reports/${schedule.client_id || 'agency'}/${startDate}_${endDate}_${schedule.id}.html`
    const up = await uploadFile(Buffer.from(html, 'utf8'), key, 'text/html; charset=utf-8')
    r2Key = up.key
    reportUrl = up.url
  } catch (err) {
    status = 'partial'
    error = `archive failed: ${(err as Error).message || err}`
  }

  // Email recipients.
  const subject = `${clientName} — performance report (${startDate} → ${endDate})`
  const emailRes = await sendAnalyticsReportEmail({
    event: event ?? undefined,
    to: schedule.recipients,
    subject,
    html,
    reportUrl
  })
  if (!emailRes.sent) {
    status = status === 'success' ? 'partial' : status
    error = error || 'email not sent (Resend unavailable)'
  }

  await execute(
    `INSERT INTO report_runs (schedule_id, client_id, period_start, period_end, r2_key, report_url, status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [schedule.id, schedule.client_id, startDate, endDate, r2Key, reportUrl, status, error]
  )
  await execute(`UPDATE report_schedules SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1`, [schedule.id])

  return { scheduleId: schedule.id, status, reportUrl, error }
}

/** Run every enabled schedule that is due (or all enabled when force=true). */
export async function runDueReports(
  event: H3Event | null,
  opts: { force?: boolean } = {}
): Promise<{ processed: number, results: ReportRunResult[] }> {
  const now = new Date()
  const schedules = await queryRows<ScheduleRow>(
    `SELECT id, client_id::text AS client_id, cadence, recipients, branding, last_run_at::text AS last_run_at
     FROM report_schedules WHERE enabled = TRUE`
  )
  const due = schedules.filter(s => opts.force || isReportDue(s.cadence, s.last_run_at, now))
  const results: ReportRunResult[] = []
  for (const s of due) {
    try {
      results.push(await runReport(event, s, now))
    } catch (err) {
      results.push({ scheduleId: s.id, status: 'failed', error: String((err as Error).message || err) })
    }
  }
  return { processed: due.length, results }
}

/** Manually run one schedule now (ignores the due check). */
export async function runReportById(event: H3Event | null, id: string): Promise<ReportRunResult> {
  const s = await queryOne<ScheduleRow>(
    `SELECT id, client_id::text AS client_id, cadence, recipients, branding, last_run_at::text AS last_run_at
     FROM report_schedules WHERE id = $1`,
    [id]
  )
  if (!s) {
    throw createError({ statusCode: 404, statusMessage: 'Report schedule not found' })
  }
  return runReport(event, s, new Date())
}
