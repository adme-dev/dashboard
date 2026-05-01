// server/utils/leads/destinations/slack.ts
import { registerAdapter } from './index'
import { renderTemplate } from '../templateRender'
import type { DestinationAdapter, DispatchResult } from './types'

interface Cfg { webhook_url: string; channel?: string; mention?: string; message_template?: string }

function autoSummary(lead: any): string {
  const f = lead.field_data ?? {}
  const parts: string[] = []
  if (f.full_name) parts.push(`*${f.full_name}*`)
  if (f.email) parts.push(`✉️ ${f.email}`)
  if (f.phone_number || f.phone) parts.push(`📞 ${f.phone_number ?? f.phone}`)
  if (f.budget) parts.push(`💰 ${f.budget}`)
  return parts.join(' · ')
}

const adapter: DestinationAdapter<Cfg> = {
  type: 'slack',
  validateConfig(config) {
    const c = config as Cfg
    if (!c?.webhook_url || !/^https:\/\/hooks\.slack\.com\/services\//.test(c.webhook_url)) {
      return { valid: false, errors: { webhook_url: 'Must be a Slack incoming webhook URL' } }
    }
    return { valid: true }
  },
  async dispatch(_delivery, lead, config) {
    let messageText: string
    if (config.message_template?.trim()) {
      const { text } = renderTemplate(config.message_template, lead as any)
      messageText = `${config.mention ? config.mention + ' ' : ''}${text}`
    } else {
      messageText = `${config.mention ? config.mention + ' ' : ''}*New lead* — ${lead.source}/${lead.form_name ?? lead.form_id ?? 'unknown'}\n${autoSummary(lead)}`
    }
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: messageText } },
    ]
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      let resp: Response
      try {
        resp = await fetch(config.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks, channel: config.channel }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
      if (!resp.ok) {
        const result: DispatchResult = { status: 'failed', error: `http_${resp.status}` }
        if (resp.status === 429) (result as any).retry_after_ms = 60_000
        return result
      }
      return { status: 'delivered', response_meta: { http_status: resp.status } }
    } catch (e: any) {
      return { status: 'failed', error: `network_error: ${e?.message ?? String(e)}` }
    }
  },
}

registerAdapter(adapter)
export default adapter
