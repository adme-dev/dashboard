// server/utils/reports/reportModel.ts
/**
 * Pure report composition + white-label HTML rendering + cadence/due logic for
 * scheduled analytics reports. No DB / IO here so it's fully unit-testable;
 * delivery (R2 + Resend) and data fetching live in reportDelivery.ts /
 * runReports.ts.
 */
import type { CanonicalFactRow } from '../canonicalFact'

export type ReportCadence = 'weekly' | 'monthly'

export interface ReportBranding {
  agencyName?: string
  logoUrl?: string
  accentColor?: string
}

export interface ReportChannelLine {
  channel: string
  spend: number
  leads: number
  conversions: number
  revenue: number
  sessions: number
  cpl: number | null
}

export interface ReportModel {
  clientName: string
  window: { startDate: string, endDate: string }
  totals: { spend: number, leads: number, conversions: number, revenue: number, sessions: number, cpl: number | null }
  channels: ReportChannelLine[]
}

export function composeReportModel(
  clientName: string,
  window: { startDate: string, endDate: string },
  fact: CanonicalFactRow[]
): ReportModel {
  const byChannel = new Map<string, ReportChannelLine>()
  const totals = { spend: 0, leads: 0, conversions: 0, revenue: 0, sessions: 0, cpl: null as number | null }
  for (const r of fact) {
    const line = byChannel.get(r.channel) ?? { channel: r.channel, spend: 0, leads: 0, conversions: 0, revenue: 0, sessions: 0, cpl: null }
    line.spend += r.spend
    line.leads += r.leads
    line.conversions += r.conversions
    line.revenue += r.revenue
    line.sessions += r.sessions
    byChannel.set(r.channel, line)
    totals.spend += r.spend
    totals.leads += r.leads
    totals.conversions += r.conversions
    totals.revenue += r.revenue
    totals.sessions += r.sessions
  }
  const channels = [...byChannel.values()]
    .map(c => ({ ...c, cpl: c.spend > 0 && c.leads > 0 ? c.spend / c.leads : null }))
    .sort((a, b) => b.spend - a.spend)
  totals.cpl = totals.spend > 0 && totals.leads > 0 ? totals.spend / totals.leads : null
  return { clientName, window, totals, channels }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function money(v: number): string {
  return `$${v.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
}

function moneyOrDash(v: number | null): string {
  return v == null ? '—' : `$${v.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`
}

function num(v: number): string {
  return v.toLocaleString('en-AU')
}

/** Render a self-contained, white-label HTML report (inline styles for email/R2). */
export function renderReportHtml(model: ReportModel, branding: ReportBranding = {}): string {
  const accent = branding.accentColor && /^#[0-9a-fA-F]{3,8}$/.test(branding.accentColor) ? branding.accentColor : '#4f46e5'
  const agency = escapeHtml(branding.agencyName || 'Your Agency')
  const logo = branding.logoUrl && /^https:\/\//.test(branding.logoUrl)
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${agency}" style="height:36px" />`
    : `<span style="font-weight:700;font-size:18px">${agency}</span>`

  const kpi = (label: string, value: string) =>
    `<td style="padding:12px 16px;background:#f8fafc;border-radius:8px"><div style="font-size:11px;color:#64748b;text-transform:uppercase">${label}</div><div style="font-size:20px;font-weight:700;color:#0f172a">${value}</div></td>`

  const rows = model.channels.map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${escapeHtml(c.channel)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${money(c.spend)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${num(c.leads)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${moneyOrDash(c.cpl)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${num(c.sessions)}</td>
    </tr>`).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#ffffff;color:#0f172a">
  <div style="max-width:680px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${accent};padding-bottom:12px">
      ${logo}
      <span style="font-size:12px;color:#64748b">${escapeHtml(model.window.startDate)} → ${escapeHtml(model.window.endDate)}</span>
    </div>
    <h1 style="font-size:22px;margin:20px 0 4px">${escapeHtml(model.clientName)} — Performance Report</h1>
    <table style="border-collapse:separate;border-spacing:8px 0;margin:16px 0;width:100%"><tr>
      ${kpi('Spend', money(model.totals.spend))}
      ${kpi('Leads', num(model.totals.leads))}
      ${kpi('Cost / Lead', moneyOrDash(model.totals.cpl))}
      ${kpi('Sessions', num(model.totals.sessions))}
    </tr></table>
    <h2 style="font-size:15px;margin:24px 0 8px">By channel</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="color:#64748b;text-align:left">
        <th style="padding:8px 12px">Channel</th>
        <th style="padding:8px 12px;text-align:right">Spend</th>
        <th style="padding:8px 12px;text-align:right">Leads</th>
        <th style="padding:8px 12px;text-align:right">CPL</th>
        <th style="padding:8px 12px;text-align:right">Sessions</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:12px;color:#64748b">No data for this period.</td></tr>'}</tbody>
    </table>
    <p style="font-size:11px;color:#94a3b8;margin-top:24px">Conversions &amp; revenue are platform-reported; leads are first-party. Generated by ${agency}.</p>
  </div>
</body></html>`
}

const DAY_MS = 86_400_000

/** Days a cadence spans (the lookback window for the report). */
export function cadenceWindowDays(cadence: ReportCadence): number {
  return cadence === 'weekly' ? 7 : 30
}

/** Is a schedule due now? Due when never run, or `intervalDays` have elapsed since last run. */
export function isReportDue(cadence: ReportCadence, lastRunAt: string | null, now: Date): boolean {
  if (!lastRunAt) return true
  const elapsedDays = (now.getTime() - new Date(lastRunAt).getTime()) / DAY_MS
  return elapsedDays >= cadenceWindowDays(cadence)
}
