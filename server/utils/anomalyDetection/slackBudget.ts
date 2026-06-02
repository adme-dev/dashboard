// Pure Slack-block builders + a small webhook poster for the budget review.
// Mirrors the leads Slack adapter (server/utils/leads/destinations/slack.ts):
// blocks payload, https://hooks.slack.com/services/ only, 30s timeout. fetch is
// injectable for testing.

export interface SlackBlock {
  type: string
  text?: { type: string; text: string }
}

export interface BudgetSlackItem {
  type: string
  severity: string
  title: string
  description: string
  client?: string | null
}

export function validateWebhook(url: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\//.test(url)
}

const icon = (sev: string) => (sev === 'critical' ? '🔴' : sev === 'warning' ? '🟠' : 'ℹ️')

export function buildDigestBlocks(
  items: BudgetSlackItem[],
  opts: { date: string; dashboardUrl: string },
): SlackBlock[] {
  if (items.length === 0) {
    return [{
      type: 'section',
      text: { type: 'mrkdwn', text: `*🗓️ Daily Budget Review — ${opts.date}*\n✅ No pacing issues detected across active campaigns.` },
    }]
  }
  const nCrit = items.filter(i => i.severity === 'critical').length
  const nWarn = items.filter(i => i.severity === 'warning').length
  const clients = new Set(items.map(i => i.client).filter(Boolean)).size
  const header: SlackBlock = {
    type: 'section',
    text: { type: 'mrkdwn', text: `*🗓️ Daily Budget Review — ${opts.date}*\n${nCrit} critical · ${nWarn} warning across ${clients} client(s)` },
  }
  const lines = items.slice(0, 10).map(i => `• ${icon(i.severity)} ${i.title} — ${i.description}`).join('\n')
  const body: SlackBlock = { type: 'section', text: { type: 'mrkdwn', text: lines } }
  const footer: SlackBlock = { type: 'section', text: { type: 'mrkdwn', text: `<${opts.dashboardUrl}|View all budget issues →>` } }
  return [header, body, footer]
}

export function buildCriticalBlocks(items: BudgetSlackItem[]): SlackBlock[] {
  if (items.length === 0) return []
  if (items.length > 3) {
    return [{
      type: 'section',
      text: { type: 'mrkdwn', text: `*⚠️ ${items.length} new critical budget issues detected* — see today's digest or the dashboard.` },
    }]
  }
  return items.map(i => ({
    type: 'section',
    text: { type: 'mrkdwn', text: `*${icon(i.severity)} ${i.title}*\n${i.description}` },
  }))
}

export async function postSlack(
  webhookUrl: string,
  blocks: SlackBlock[],
  channel?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const resp = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, channel }),
      signal: ctrl.signal,
    })
    if (!resp.ok) return { ok: false, error: `http_${resp.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: `network_error: ${e?.message ?? String(e)}` }
  } finally {
    clearTimeout(timer)
  }
}
