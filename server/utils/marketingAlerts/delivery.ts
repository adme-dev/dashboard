// Delivery for marketing alerts: one daily digest (new/escalated alerts since the last digest,
// plus a count of ongoing ones) and an immediate message for critical alerts that just opened or
// escalated. Channels: a configured Slack incoming webhook and/or XeroFlow in-app notifications
// for an explicit recipient allowlist.
//
// The global staff-notification pause (USER_MEMBER_NOTIFICATIONS_DISABLED) suppresses BOTH
// channels here: a suppressed attempt is recorded, nothing is sent, and alerts stay un-notified.
import type { MarketingAlertsConfig } from './config'
import type { DeliveryStatus } from './store'
import { SEVERITY_RANK, type MarketingAlertSeverity, type StoredMarketingAlert } from './types'

export interface SlackBlock { type: string, text?: { type: string, text: string } }

export interface DeliveryDeps {
  isPaused: () => boolean
  postSlack: (webhookUrl: string, blocks: SlackBlock[], channel?: string) => Promise<{ ok: boolean, error?: string }>
  /** Budget Review webhook (agency_settings 'budget_slack'), only consulted when configured to reuse it. */
  loadBudgetSlackWebhook: () => Promise<{ webhookUrl: string | null, channel: string | null }>
  resolveRecipientIds: (emails: string[]) => Promise<string[]>
  notify: (userId: string, params: { title: string, message: string, link: string, metadata: Record<string, unknown> }) => Promise<unknown>
  recordDelivery: (entry: { kind: 'immediate' | 'digest', channel: 'slack' | 'in_app', status: DeliveryStatus, alertIds: string[], detail?: string | null }) => Promise<void>
  digestAlreadyHandled: (channel: 'slack' | 'in_app') => Promise<boolean>
  markImmediateNotified: (ids: string[]) => Promise<void>
  markDigested: (ids: string[]) => Promise<void>
}

export interface DeliveryContext {
  config: MarketingAlertsConfig
  now: Date
  /** Absolute origin for Slack links, e.g. https://agency-dashboard-6cm.pages.dev */
  appUrl: string
  localHour: number
  localDateLabel: string
}

export interface DeliveryResult {
  immediate: { eligible: number, slack: DeliveryStatus | 'off', inApp: DeliveryStatus | 'off' }
  digest: { due: boolean, alerts: number, slack: DeliveryStatus | 'off' | 'already_handled', inApp: DeliveryStatus | 'off' | 'already_handled' }
}

const icon = (severity: MarketingAlertSeverity): string => severity === 'critical' ? '🔴' : severity === 'warning' ? '🟠' : 'ℹ️'
/** Slack mrkdwn control characters must be escaped in user-derived text. */
export const escapeSlack = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const absolute = (appUrl: string, link: string): string => /^https?:\/\//.test(link) ? link : `${appUrl.replace(/\/$/, '')}${link.startsWith('/') ? '' : '/'}${link}`
const NOTIFY_ONLY = '_Notify-only: nothing was changed in any ad account._'

/** Critical alerts that opened or escalated inside the window and have not been sent immediately. */
export function selectImmediate(alerts: StoredMarketingAlert[], now: Date, windowHours: number): StoredMarketingAlert[] {
  const cutoff = now.getTime() - windowHours * 3_600_000
  return alerts.filter((alert) => {
    if (alert.severity !== 'critical' || alert.immediateNotifiedAt) return false
    const since = Date.parse(alert.severityChangedAt ?? alert.firstDetectedAt)
    return Number.isFinite(since) && since >= cutoff
  })
}

/** New for the digest = never included in a digest, or escalated to a higher severity since. */
export function selectDigestNew(alerts: StoredMarketingAlert[]): StoredMarketingAlert[] {
  return alerts.filter((alert) => {
    if (!alert.lastDigestAt) return true
    return !!alert.severityChangedAt && Date.parse(alert.severityChangedAt) > Date.parse(alert.lastDigestAt)
  })
}

function alertLine(alert: StoredMarketingAlert, appUrl: string): string {
  return `${icon(alert.severity)} ${escapeSlack(alert.summary)} <${absolute(appUrl, alert.deepLink)}|Open>\n    ↳ ${escapeSlack(alert.nextStep)} · \`${alert.id.slice(0, 8)}\``
}

export function buildImmediateBlocks(alerts: StoredMarketingAlert[], appUrl: string): SlackBlock[] {
  const shown = alerts.slice(0, 5)
  const blocks: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `*🔴 ${alerts.length} new critical marketing alert${alerts.length === 1 ? '' : 's'}*` } },
    { type: 'section', text: { type: 'mrkdwn', text: shown.map(a => alertLine(a, appUrl)).join('\n').slice(0, 2900) } }
  ]
  if (alerts.length > shown.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `…and ${alerts.length - shown.length} more in today's digest.` } })
  }
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: NOTIFY_ONLY } })
  return blocks
}

export function buildDigestBlocks(open: StoredMarketingAlert[], fresh: StoredMarketingAlert[], opts: { date: string, appUrl: string }): SlackBlock[] {
  const count = (severity: MarketingAlertSeverity) => open.filter(a => a.severity === severity).length
  const ongoing = open.length - fresh.length
  const header = `*📣 Marketing alerts — ${escapeSlack(opts.date)}*\n${fresh.length} new · ${ongoing} ongoing (${count('critical')} critical · ${count('warning')} warning · ${count('info')} info)`
  const blocks: SlackBlock[] = [{ type: 'section', text: { type: 'mrkdwn', text: header } }]
  // Info alerts are summarised as a count only; they never get their own line.
  const listed = fresh.filter(a => a.severity !== 'info').sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const shown = listed.slice(0, 12)
  if (shown.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: shown.map(a => alertLine(a, opts.appUrl)).join('\n').slice(0, 2900) } })
  }
  if (listed.length > shown.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `…and ${listed.length - shown.length} more new alert(s).` } })
  }
  if (!fresh.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No new conditions since yesterday; ongoing alerts are not repeated.' } })
  }
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: NOTIFY_ONLY } })
  return blocks
}

function inAppMessage(alerts: StoredMarketingAlert[]): string {
  const lines = alerts.slice(0, 3).map(a => `${a.severity === 'critical' ? 'Critical' : a.severity === 'warning' ? 'Warning' : 'Info'}: ${a.summary}`)
  const more = alerts.length > 3 ? `\n…and ${alerts.length - 3} more.` : ''
  return `${lines.join('\n')}${more}`.slice(0, 1000)
}

async function resolveSlackTarget(config: MarketingAlertsConfig, deps: DeliveryDeps): Promise<{ webhookUrl: string, channel: string | null } | null> {
  if (config.slack.webhookUrl) return { webhookUrl: config.slack.webhookUrl, channel: config.slack.channel }
  if (!config.slack.useBudgetSlackWebhook) return null
  const budget = await deps.loadBudgetSlackWebhook()
  return budget.webhookUrl ? { webhookUrl: budget.webhookUrl, channel: config.slack.channel ?? budget.channel } : null
}

async function sendBatch(
  kind: 'immediate' | 'digest',
  batch: StoredMarketingAlert[],
  blocks: SlackBlock[],
  inApp: { title: string, message: string, link: string },
  ctx: DeliveryContext,
  deps: DeliveryDeps,
  channels: { slack: boolean, inApp: boolean }
): Promise<{ slack: DeliveryStatus | 'off', inApp: DeliveryStatus | 'off' }> {
  const ids = batch.map(a => a.id)
  const result: { slack: DeliveryStatus | 'off', inApp: DeliveryStatus | 'off' } = { slack: 'off', inApp: 'off' }
  const paused = deps.isPaused()

  if (channels.slack) {
    if (paused) {
      result.slack = 'suppressed_paused'
    } else {
      const target = await resolveSlackTarget(ctx.config, deps)
      if (!target) {
        result.slack = 'skipped_no_target'
      } else {
        const res = await deps.postSlack(target.webhookUrl, blocks, target.channel ?? undefined)
        result.slack = res.ok ? 'sent' : 'failed'
        if (!res.ok) console.warn('[marketing-alerts] Slack delivery failed', { kind, error: res.error })
      }
    }
    await deps.recordDelivery({ kind, channel: 'slack', status: result.slack, alertIds: ids, detail: paused ? 'USER_MEMBER_NOTIFICATIONS_DISABLED' : null })
  }

  if (channels.inApp) {
    if (paused) {
      result.inApp = 'suppressed_paused'
    } else {
      const recipients = await deps.resolveRecipientIds(ctx.config.recipientEmails)
      if (!recipients.length) {
        result.inApp = 'skipped_no_target'
      } else {
        let delivered = 0
        for (const userId of recipients) {
          try {
            await deps.notify(userId, { ...inApp, metadata: { kind: `marketing_alert_${kind}`, alertIds: ids } })
            delivered++
          } catch (err) {
            console.warn('[marketing-alerts] in-app delivery failed', { kind, userId, error: String(err) })
          }
        }
        result.inApp = delivered > 0 ? 'sent' : 'failed'
      }
    }
    await deps.recordDelivery({ kind, channel: 'in_app', status: result.inApp, alertIds: ids, detail: paused ? 'USER_MEMBER_NOTIFICATIONS_DISABLED' : null })
  }
  return result
}

export async function deliverMarketingAlerts(open: StoredMarketingAlert[], ctx: DeliveryContext, deps: DeliveryDeps): Promise<DeliveryResult> {
  const { config } = ctx
  const channelsOn = { slack: config.delivery.slack, inApp: config.delivery.inApp }
  const result: DeliveryResult = {
    immediate: { eligible: 0, slack: 'off', inApp: 'off' },
    digest: { due: false, alerts: 0, slack: 'off', inApp: 'off' }
  }
  if (!channelsOn.slack && !channelsOn.inApp) return result // shadow mode: persist only

  // Immediate: critical only.
  const immediate = selectImmediate(open, ctx.now, config.thresholds.immediateWindowHours)
  result.immediate.eligible = immediate.length
  if (immediate.length) {
    const sent = await sendBatch('immediate', immediate, buildImmediateBlocks(immediate, ctx.appUrl), {
      title: `${immediate.length} critical marketing alert${immediate.length === 1 ? '' : 's'}`,
      message: inAppMessage(immediate),
      link: immediate[0]!.deepLink
    }, ctx, deps, channelsOn)
    result.immediate.slack = sent.slack
    result.immediate.inApp = sent.inApp
    // Marked only when at least one channel actually delivered, so a pause or outage never
    // silently swallows a critical alert (it still lands in the next digest either way).
    if (sent.slack === 'sent' || sent.inApp === 'sent') await deps.markImmediateNotified(immediate.map(a => a.id))
  }

  // Digest: once per tenant-local day per channel, at the configured hour.
  if (ctx.localHour !== config.digestHour) return result
  result.digest.due = true
  const channels = {
    slack: channelsOn.slack && !(await deps.digestAlreadyHandled('slack')),
    inApp: channelsOn.inApp && !(await deps.digestAlreadyHandled('in_app'))
  }
  if (channelsOn.slack && !channels.slack) result.digest.slack = 'already_handled'
  if (channelsOn.inApp && !channels.inApp) result.digest.inApp = 'already_handled'
  if (!channels.slack && !channels.inApp) return result

  const fresh = selectDigestNew(open)
  result.digest.alerts = open.length
  if (!open.length) {
    // Nothing open: no message. Record so the day is handled.
    for (const channel of ['slack', 'in_app'] as const) {
      if (channel === 'slack' ? channels.slack : channels.inApp) {
        await deps.recordDelivery({ kind: 'digest', channel, status: 'skipped_no_target', alertIds: [], detail: 'no open alerts' })
        if (channel === 'slack') result.digest.slack = 'skipped_no_target'
        else result.digest.inApp = 'skipped_no_target'
      }
    }
    return result
  }
  const counts = `${open.filter(a => a.severity === 'critical').length} critical · ${open.filter(a => a.severity === 'warning').length} warning`
  const sent = await sendBatch('digest', fresh.length ? fresh : open, buildDigestBlocks(open, fresh, { date: ctx.localDateLabel, appUrl: ctx.appUrl }), {
    title: `Marketing alerts: ${fresh.length} new, ${open.length - fresh.length} ongoing`,
    message: fresh.length ? inAppMessage(fresh.filter(a => a.severity !== 'info')) || counts : `No new conditions. Open: ${counts}.`,
    link: fresh[0]?.deepLink ?? open[0]!.deepLink
  }, ctx, deps, channels)
  if (channels.slack) result.digest.slack = sent.slack
  if (channels.inApp) result.digest.inApp = sent.inApp
  if (sent.slack === 'sent' || sent.inApp === 'sent') await deps.markDigested(fresh.map(a => a.id))
  return result
}
