// server/utils/leads/ack/config.ts
// Opt-in visitor auto-acknowledgement ("we got your enquiry") for lead forms.
// It is OFF unless an `autoresponder_email` destination is added to a form
// rule; nothing here enables it.
//
// Content is static and client-authored: no `{{ }}` tokens, so nothing the
// visitor typed (name, message) is ever echoed back to the address they gave.

import { getCachedCfBinding } from '~~/server/utils/cfBindings'
import { singleEmailAddress, stripHeaderBreaks } from '../emailHeaders'

// ---------------------------------------------------------------------------
// PLACEHOLDERS: pending a product decision. Do not replace these with final
// copy or a real sender in code review; the owner decides them.
// ---------------------------------------------------------------------------

/** Env var holding the XeroFlow-owned sender address (bare address only), e.g.
 * on a dedicated acknowledgement subdomain. PLACEHOLDER: the sending domain is
 * not chosen yet. While unset, every acknowledgement is skipped. */
export const LEAD_ACK_FROM_ENV = 'LEAD_ACK_FROM_ADDRESS'

/** Marks text that must be replaced before an acknowledgement can be saved or
 * sent. Config containing it fails validation and is skipped at dispatch. */
export const LEAD_ACK_PLACEHOLDER_MARKER = '[[PLACEHOLDER'

/** Starting copy for the editor. PLACEHOLDER: wording to be decided; the
 * marker guarantees this exact text can never reach a visitor. */
export const LEAD_ACK_DEFAULT_COPY = Object.freeze({
  subject: `${LEAD_ACK_PLACEHOLDER_MARKER}: acknowledgement subject, to be written by the client]]`,
  body_text: `${LEAD_ACK_PLACEHOLDER_MARKER}: acknowledgement message, to be written by the client. Static text only; it must not quote the enquiry.]]`
})

// ---------------------------------------------------------------------------

export const LEAD_ACK_DEFAULT_DAILY_CAP = 50
export const LEAD_ACK_MAX_DAILY_CAP = 200
export const LEAD_ACK_RECIPIENT_WINDOW_HOURS = 24

export interface LeadAckConfig {
  subject: string
  body_text: string
  /** The client's inbox; visitor replies to the acknowledgement go here. */
  reply_to: string
  /** Optional display name for the XeroFlow sender, e.g. the business name. */
  from_name?: string
  /** Per-site (client) acknowledgements per rolling 24 h. */
  daily_cap?: number
}

const TOKEN_SYNTAX = /\{\{|\}\}/
const SUBJECT_MAX = 200
const BODY_MAX = 5000
const FROM_NAME_MAX = 80
const FROM_NAME_FORBIDDEN = /[<>"@,;:\\]/

export type LeadAckConfigCheck
  = | { valid: true, config: Required<Omit<LeadAckConfig, 'from_name'>> & { from_name: string | null } }
    | { valid: false, errors: Record<string, string> }

export function checkLeadAckConfig(raw: unknown): LeadAckConfigCheck {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}
  const text = (key: 'subject' | 'body_text', max: number) => {
    const value = typeof c[key] === 'string' ? (c[key] as string).trim() : ''
    if (!value) errors[key] = 'Required'
    else if (value.length > max) errors[key] = `At most ${max} characters`
    else if (TOKEN_SYNTAX.test(value)) errors[key] = 'Template tokens are not allowed; use static text'
    else if (value.includes(LEAD_ACK_PLACEHOLDER_MARKER)) errors[key] = 'Replace the placeholder text'
    return value
  }
  const subject = stripHeaderBreaks(text('subject', SUBJECT_MAX))
  const body_text = text('body_text', BODY_MAX)
  const replyTo = singleEmailAddress(c.reply_to)
  if (!replyTo) errors.reply_to = 'One valid email address'
  let from_name: string | null = null
  if (c.from_name !== undefined && c.from_name !== null && c.from_name !== '') {
    const name = typeof c.from_name === 'string' ? stripHeaderBreaks(c.from_name) : ''
    if (!name || name.length > FROM_NAME_MAX || FROM_NAME_FORBIDDEN.test(name)) errors.from_name = 'Plain name, at most 80 characters'
    else from_name = name
  }
  let daily_cap = LEAD_ACK_DEFAULT_DAILY_CAP
  if (c.daily_cap !== undefined && c.daily_cap !== null) {
    if (!Number.isInteger(c.daily_cap) || (c.daily_cap as number) < 1 || (c.daily_cap as number) > LEAD_ACK_MAX_DAILY_CAP) {
      errors.daily_cap = `Whole number from 1 to ${LEAD_ACK_MAX_DAILY_CAP}`
    } else daily_cap = c.daily_cap as number
  }
  if (Object.keys(errors).length) return { valid: false, errors }
  return { valid: true, config: { subject, body_text, reply_to: replyTo!, from_name, daily_cap } }
}

/** The configured XeroFlow sender, or null when not configured/invalid. */
export function leadAckSenderAddress(): string | null {
  return singleEmailAddress(process.env[LEAD_ACK_FROM_ENV] || getCachedCfBinding(LEAD_ACK_FROM_ENV))
}
