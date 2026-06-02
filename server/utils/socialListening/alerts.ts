// server/utils/socialListening/alerts.ts
// Listening alerts (Slice 4d). DOUBLY dormant: nothing fires unless SOCIAL_LISTENING_ALERTS_ENABLED
// === 'true' AND SOCIAL_LISTENING_NOTIFY_ALLOWLIST resolves to at least one recipient. Pure
// detectors + an injected dispatch so the gating/decisions are unit-testable without DB/notifs.
import type { createNotification } from '~~/server/utils/notifications'

export type AlertEnv = Record<string, string | undefined>

/** HARD gate — exact "true" (mirrors SOCIAL_AUTOMATION_ENABLED / SOCIAL_REPORTS_ENABLED). */
export function isListeningAlertsEnabled(env: AlertEnv): boolean {
  return env.SOCIAL_LISTENING_ALERTS_ENABLED === 'true'
}

/** Parse the recipient email allowlist. Empty/unset → empty set (no fan-out). */
export function parseAlertAllowlist(raw: string | undefined): Set<string> {
  const out = new Set<string>()
  for (const e of (raw ?? '').split(',')) { const v = e.trim().toLowerCase(); if (v) out.add(v) }
  return out
}

export interface SpikeOpts { minToday: number; multiplier: number }
/** Pure: today's volume is a spike if it clears an absolute floor AND exceeds mean(baseline)×multiplier.
 *  No baseline → never a spike (avoids day-one false alarms). */
export function detectVolumeSpike(today: number, baseline: number[], opts: SpikeOpts): { spiked: boolean; ratio: number | null } {
  if (!baseline.length || today < opts.minToday) return { spiked: false, ratio: null }
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length
  const ratio = mean === 0 ? null : today / mean
  const spiked = today >= opts.minToday && today >= mean * opts.multiplier
  return { spiked, ratio }
}

export interface AlertDbRunner {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  execute: (sql: string, params?: any[]) => Promise<number>
}
export interface DispatchDeps {
  db: AlertDbRunner
  env: AlertEnv
  notify: typeof createNotification
  baseUrl: string
}

/**
 * Resolve recipients (allowlist emails → active team_member ids), then for each new negative mention
 * (alerted_at IS NULL) notify every recipient once and stamp alerted_at. No-op unless the gate is on
 * AND the allowlist resolves to >=1 recipient. Returns the count of notifications raised.
 */
export async function dispatchListeningAlerts(deps: DispatchDeps): Promise<number> {
  const { db, env, notify, baseUrl } = deps
  if (!isListeningAlertsEnabled(env)) return 0
  const allow = parseAlertAllowlist(env.SOCIAL_LISTENING_NOTIFY_ALLOWLIST)
  if (allow.size === 0) return 0

  const recipients = await db.queryRows<{ id: string }>(
    `SELECT id::text AS id FROM team_members WHERE is_active = TRUE AND lower(email) = ANY($1)`,
    [[...allow]])
  if (!recipients.length) return 0

  const negs = await db.queryRows<{ id: string; client_id: string; title: string | null; content: string | null; url: string | null }>(
    `SELECT id, client_id, title, content, url FROM social_listening_mentions
       WHERE alerted_at IS NULL AND sentiment = 'negative' ORDER BY created_at ASC LIMIT 50`)
  let raised = 0
  for (const m of negs) {
    const snippet = (m.title || m.content || 'New negative mention').slice(0, 140)
    for (const r of recipients) {
      // Isolate per-recipient failures so one bad notify doesn't abort the run and re-alert the
      // whole batch next cron (alerted_at is stamped below regardless).
      try {
        await notify({
          userId: r.id, type: 'system', reason: 'direct',
          title: 'Negative brand mention detected',
          message: snippet,
          link: m.url || `${baseUrl}/agency/social/listening`,
          metadata: { source: 'social_listening', mentionId: m.id, clientId: m.client_id },
        })
        raised++
      } catch (err) {
        console.error('listening.alert.notify_failed', { mentionId: m.id, userId: r.id, error: String(err) })
      }
    }
    await db.execute(`UPDATE social_listening_mentions SET alerted_at = NOW() WHERE id = $1`, [m.id])
  }
  return raised
}
