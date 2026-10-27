// server/utils/leads/destinations/email.ts
import { Resend } from 'resend'
import { registerAdapter } from './registry'
import { renderTemplate } from '../templateRender'
import { singleEmailAddress, stripHeaderBreaks } from '../emailHeaders'
import type { DestinationAdapter, Lead } from './types'

interface Cfg {
  to: string[]
  subject_template: string
  body_template: string
  from?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Subjects are visible in notification previews and mailbox lists, so they
// carry form metadata only. Field values (name, email, message) stay in the
// body; `{{ field.* }}` and other tokens render empty in the subject.
const SUBJECT_TOKENS: ReadonlySet<string> = new Set(['form_name', 'source'])
const FALLBACK_SUBJECT = 'New lead'

export function renderNotificationSubject(template: string, lead: Lead): string {
  const rendered = stripHeaderBreaks(renderTemplate(template, lead, { allowedTokens: SUBJECT_TOKENS }).text)
  return rendered || FALLBACK_SUBJECT
}

const adapter: DestinationAdapter<Cfg> = {
  type: 'email',
  validateConfig(config) {
    const errors: Record<string, string> = {}
    const c = config as Cfg
    if (!Array.isArray(c?.to) || c.to.length === 0) errors.to = 'At least one recipient'
    else if (c.to.some(t => !EMAIL_RE.test(t))) errors.to = 'Invalid email address'
    if (!c?.subject_template) errors.subject_template = 'Required'
    if (!c?.body_template) errors.body_template = 'Required'
    return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
  },
  async dispatch(delivery, lead, config) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return { status: 'failed', error: 'RESEND_API_KEY missing' }
    const resend = new Resend(apiKey)
    const subject = renderNotificationSubject(config.subject_template, lead)
    const html = renderTemplate(config.body_template, lead, { html: true }).text
    // Replying to the notification reaches the visitor, but only when they
    // submitted exactly one valid address (see contact.post.ts).
    const replyTo = singleEmailAddress(lead.field_data?.email)
    try {
      const { data, error } = await resend.emails.send({
        from: stripHeaderBreaks(config.from ?? 'leads@adme.net.au'),
        to: config.to,
        ...(replyTo ? { replyTo } : {}),
        subject,
        html,
        headers: { 'X-Leads-Idempotency-Key': delivery.idempotency_key },
      })
      if (error) return { status: 'failed', error: (error as any).message ?? 'resend_error' }
      return { status: 'delivered', response_meta: { resend_id: data?.id } }
    } catch (e: any) {
      return { status: 'failed', error: `resend_error: ${e?.message ?? String(e)}` }
    }
  },
}

registerAdapter(adapter)
export default adapter
