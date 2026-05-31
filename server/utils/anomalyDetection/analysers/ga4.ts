// server/utils/anomalyDetection/analysers/ga4.ts
/**
 * GA4 traffic & conversion anomalies, per client, from ga4_daily_channel:
 *  - traffic-drop      latest-day sessions collapse vs the 30-day average
 *  - cvr-collapse      latest-day conversion rate (key_events/sessions) collapse
 *  - channel-mix-shift a channel's share of sessions swings sharply
 *
 * Pure `detectGa4Anomalies(rows)` is unit-tested; the Analyser wrapper just
 * reads ctx.data.ga4Channel. Suppression / notification allowlist are applied
 * downstream by reconcile + notify (same as every other analyser).
 */
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'

export interface Ga4ChannelRow {
  client_id: string
  client_name: string | null
  metric_date: string // YYYY-MM-DD
  channel_group: string
  sessions: number | string
  key_events: number | string
}

// Tuning: avoid firing on tiny-volume noise.
const MIN_BASELINE_DAYS = 8
const MIN_BASELINE_AVG_SESSIONS = 20
const TRAFFIC_DROP_RATIO = 0.5 // latest < 50% of avg
const TRAFFIC_CRITICAL_RATIO = 0.25
const CVR_DROP_RATIO = 0.5
const MIN_LATEST_SESSIONS_FOR_CVR = 30
const MIX_SHIFT_POINTS = 0.30 // ±30 percentage points of session share
const MIN_TOTAL_SESSIONS_FOR_MIX = 100

interface DayAgg {
  sessions: number
  keyEvents: number
  byChannel: Map<string, number>
}

function aggregateByDay(rows: Ga4ChannelRow[]): Map<string, DayAgg> {
  const perDay = new Map<string, DayAgg>()
  for (const r of rows) {
    const day = perDay.get(r.metric_date) ?? { sessions: 0, keyEvents: 0, byChannel: new Map() }
    const sessions = Number(r.sessions || 0)
    day.sessions += sessions
    day.keyEvents += Number(r.key_events || 0)
    day.byChannel.set(r.channel_group, (day.byChannel.get(r.channel_group) || 0) + sessions)
    perDay.set(r.metric_date, day)
  }
  return perDay
}

export function detectGa4Anomalies(rows: Ga4ChannelRow[]): DetectedAnomaly[] {
  if (!rows || rows.length === 0) return []

  // Group rows by client.
  const byClient = new Map<string, { name: string, rows: Ga4ChannelRow[] }>()
  for (const r of rows) {
    const g = byClient.get(r.client_id) ?? { name: r.client_name ?? '(unknown client)', rows: [] }
    g.rows.push(r)
    byClient.set(r.client_id, g)
  }

  const out: DetectedAnomaly[] = []

  for (const [clientId, { name, rows: cRows }] of byClient) {
    const perDay = aggregateByDay(cRows)
    const days = [...perDay.keys()].sort((a, b) => b.localeCompare(a)) // newest first
    if (days.length < MIN_BASELINE_DAYS) continue

    const latestDate = days[0]
    const latest = perDay.get(latestDate)!
    const baselineDates = days.slice(1, 31)
    if (baselineDates.length === 0) continue

    const baselineSessions = baselineDates.map(d => perDay.get(d)!.sessions)
    const avgSessions = baselineSessions.reduce((s, v) => s + v, 0) / baselineSessions.length
    if (avgSessions < MIN_BASELINE_AVG_SESSIONS) continue // too low-volume to judge

    // --- traffic drop ---
    const trafficRatio = latest.sessions / avgSessions
    if (trafficRatio < TRAFFIC_DROP_RATIO) {
      out.push({
        fingerprint: buildFingerprint('ga4', `traffic-${clientId}-${latestDate}`),
        type: 'ga4',
        severity: trafficRatio < TRAFFIC_CRITICAL_RATIO ? 'critical' : 'warning',
        title: `${name} website traffic drop`,
        description: `Only ${Math.round(latest.sessions).toLocaleString()} sessions on ${latestDate} — ${Math.round(trafficRatio * 100)}% of the 30-day average of ${Math.round(avgSessions).toLocaleString()}.`,
        metric: { label: 'Sessions', value: latest.sessions, format: 'number' },
        comparison: { label: '30-day Avg', value: avgSessions, format: 'number', trend: 'down' },
        context: { client: name, period: latestDate },
        recommendation: 'Check for tracking/tag breakage, a site outage, or a paused campaign before assuming a real demand drop.',
        tags: ['ga4', 'traffic', 'drop'],
        dataSources: ['GA4']
      })
    }

    // --- conversion-rate collapse ---
    const baseSessionsSum = baselineDates.reduce((s, d) => s + perDay.get(d)!.sessions, 0)
    const baseKeyEventsSum = baselineDates.reduce((s, d) => s + perDay.get(d)!.keyEvents, 0)
    const baselineCvr = baseSessionsSum > 0 ? baseKeyEventsSum / baseSessionsSum : 0
    const latestCvr = latest.sessions > 0 ? latest.keyEvents / latest.sessions : 0
    if (
      latest.sessions >= MIN_LATEST_SESSIONS_FOR_CVR
      && baselineCvr > 0
      && latestCvr / baselineCvr < CVR_DROP_RATIO
    ) {
      out.push({
        fingerprint: buildFingerprint('ga4', `cvr-${clientId}-${latestDate}`),
        type: 'ga4',
        severity: 'warning',
        title: `${name} conversion rate collapse`,
        description: `Conversion rate was ${(latestCvr * 100).toFixed(1)}% on ${latestDate} vs a 30-day average of ${(baselineCvr * 100).toFixed(1)}%.`,
        metric: { label: 'Conv. rate', value: latestCvr, format: 'percent' },
        comparison: { label: '30-day Avg', value: baselineCvr, format: 'percent', trend: 'down' },
        context: { client: name, period: latestDate },
        recommendation: 'Verify key-event tracking fired and the conversion path (forms, CTAs) is working.',
        tags: ['ga4', 'conversion', 'drop'],
        dataSources: ['GA4']
      })
    }

    // --- channel-mix shift ---
    if (latest.sessions >= MIN_TOTAL_SESSIONS_FOR_MIX && avgSessions >= MIN_TOTAL_SESSIONS_FOR_MIX) {
      const baseChannelSessions = new Map<string, number>()
      for (const d of baselineDates) {
        for (const [ch, s] of perDay.get(d)!.byChannel) {
          baseChannelSessions.set(ch, (baseChannelSessions.get(ch) || 0) + s)
        }
      }
      const channels = new Set<string>([...latest.byChannel.keys(), ...baseChannelSessions.keys()])
      for (const ch of channels) {
        const latestShare = latest.sessions > 0 ? (latest.byChannel.get(ch) || 0) / latest.sessions : 0
        const baseShare = baseSessionsSum > 0 ? (baseChannelSessions.get(ch) || 0) / baseSessionsSum : 0
        const shift = latestShare - baseShare
        if (Math.abs(shift) >= MIX_SHIFT_POINTS) {
          out.push({
            fingerprint: buildFingerprint('ga4', `mix-${clientId}-${ch}-${latestDate}`),
            type: 'ga4',
            severity: 'info',
            title: `${name}: ${ch} traffic share ${shift > 0 ? 'surge' : 'drop'}`,
            description: `${ch} was ${Math.round(latestShare * 100)}% of sessions on ${latestDate} vs a 30-day average of ${Math.round(baseShare * 100)}%.`,
            metric: { label: `${ch} share`, value: latestShare, format: 'percent' },
            comparison: { label: '30-day Avg', value: baseShare, format: 'percent', trend: shift > 0 ? 'up' : 'down' },
            context: { client: name, period: latestDate, category: ch },
            recommendation: 'Confirm whether a campaign launch/pause or a referral source explains the shift.',
            tags: ['ga4', 'channel-mix'],
            dataSources: ['GA4']
          })
        }
      }
    }
  }

  return out
}

export const ga4Analyser: Analyser = async (ctx) => {
  const rows = ctx.data.ga4Channel as Ga4ChannelRow[] | null
  if (!rows || rows.length === 0) return []
  return detectGa4Anomalies(rows)
}
