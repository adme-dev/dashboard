// server/utils/canonicalFact.ts
/**
 * The canonical daily fact: one row per (date, canonical channel) merging ad
 * spend + platform conversions/revenue, GA4 sessions, and owned leads. This is
 * the normalized table the export destination and NL-insights layer read from
 * (the Supermetrics "normalized data layer", but on data we already own).
 */

export interface CanonicalFactRow {
  date: string
  channel: string
  spend: number
  leads: number
  conversions: number
  revenue: number
  sessions: number
}

export interface CanonicalFactInput {
  spend: Array<{ date: string, channel: string, spend: number, conversions: number, revenue: number }>
  sessions: Array<{ date: string, channel: string, sessions: number }>
  leads: Array<{ date: string, channel: string, leads: number }>
}

function emptyRow(date: string, channel: string): CanonicalFactRow {
  return { date, channel, spend: 0, leads: 0, conversions: 0, revenue: 0, sessions: 0 }
}

/** Merge the three daily sources into canonical (date, channel) rows, sorted by date then channel. */
export function buildCanonicalFactRows(input: CanonicalFactInput): CanonicalFactRow[] {
  const byKey = new Map<string, CanonicalFactRow>()
  const ensure = (date: string, channel: string) => {
    const key = `${date}|${channel}`
    let row = byKey.get(key)
    if (!row) {
      row = emptyRow(date, channel)
      byKey.set(key, row)
    }
    return row
  }

  for (const r of input.spend) {
    const row = ensure(r.date, r.channel)
    row.spend += r.spend
    row.conversions += r.conversions
    row.revenue += r.revenue
  }
  for (const r of input.sessions) {
    ensure(r.date, r.channel).sessions += r.sessions
  }
  for (const r of input.leads) {
    ensure(r.date, r.channel).leads += r.leads
  }

  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel))
}

/** Serialize canonical fact rows to CSV (stable column order). */
export function canonicalFactToCsv(rows: CanonicalFactRow[]): string {
  const headers = ['date', 'channel', 'spend', 'leads', 'conversions', 'revenue', 'sessions']
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      r.date,
      // channel may contain a comma (e.g. "google / cpc" won't, but be safe)
      /[",\n]/.test(r.channel) ? `"${r.channel.replace(/"/g, '""')}"` : r.channel,
      r.spend.toFixed(2),
      r.leads,
      r.conversions,
      r.revenue.toFixed(2),
      r.sessions
    ].join(','))
  }
  return lines.join('\n')
}
