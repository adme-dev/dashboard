/**
 * Email service using Resend
 */

import type { H3Event } from 'h3'
import { Resend } from 'resend'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getCachedCfBinding } from '~~/server/utils/cfBindings'
import { suppressMemberNotificationEmail } from '~~/server/utils/notificationDelivery'

export {
  getCachedCfBinding as getCachedBinding,
  getCachedCfObjectBinding as getCachedObjectBinding,
  setCachedCfBindings as setCfBindings
} from '~~/server/utils/cfBindings'

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

let resend: Resend | null = null
let cachedApiKey: string | null = null

/**
 * Read a Cloudflare Pages binding. Order:
 *   1. Per-request event.context.cloudflare.env (most reliable)
 *   2. Module-cached bindings (set by the cf-env middleware on every request)
 */
function getCfBinding(event: H3Event | undefined, key: string): string | undefined {
  if (event) {
    try {
      const v = (event.context as any).cloudflare?.env?.[key]
      if (typeof v === 'string') return v
    } catch {
      // fall through
    }
  }
  return getCachedCfBinding(key)
}

/**
 * Resolve the Resend API key from all possible sources:
 * 1. CF Pages binding (per-request event or module cache)
 * 2. Nuxt runtimeConfig (supports NUXT_RESEND_API_KEY override)
 * 3. process.env fallback
 */
function resolveApiKey(event?: H3Event): string | null {
  const cfKey = getCfBinding(event, 'RESEND_API_KEY')
  if (cfKey) return cfKey

  const config = useRuntimeConfig()
  if (config.resendApiKey) return config.resendApiKey

  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY

  return null
}

/**
 * Check if the email service is configured (Resend API key present).
 * Pass the H3Event for accurate detection in Cloudflare Pages.
 */
export function isEmailConfigured(event?: H3Event): boolean {
  return !!resolveApiKey(event)
}

export function getResendClient(event?: H3Event): Resend | null {
  const apiKey = resolveApiKey(event)

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not found in CF bindings, runtimeConfig, or process.env')
    return null
  }

  // Re-create client if API key changed (e.g. config reload)
  if (resend && cachedApiKey === apiKey) return resend

  cachedApiKey = apiKey
  resend = new Resend(apiKey)
  return resend
}

export function getEmailConfig(event?: H3Event) {
  const config = useRuntimeConfig()
  return {
    appName: getCfBinding(event, 'APP_NAME') || config.public?.appName || process.env.APP_NAME || 'XeroFlow Agency',
    fromEmail: getCfBinding(event, 'EMAIL_FROM') || config.emailFrom || process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    appUrl: getAppUrl(event)
  }
}

const BRAND_COLOR = '#13B5EA'

function getFromHeader(event?: H3Event): string {
  const { appName, fromEmail } = getEmailConfig(event)
  return `${appName} <${fromEmail}>`
}

/**
 * Two-letter logo monogram from the app name.
 * "XeroFlow Agency" → "XF", "Acme" → "AC", "FooBar Co" → "FB".
 */
function logoMonogram(appName: string): string {
  const words = appName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '••'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * Shared email template renderer — produces the same look used by the
 * magic-link email (light-grey background, white rounded card, black pill
 * CTA). All transactional emails inherit this.
 *
 * Args (loosely the original API kept compatible):
 *   - title:     becomes the centred H1 inside the card
 *   - greeting:  optional intro (e.g. "Hi Paul,") rendered above the body
 *   - bodyHtml:  free-form HTML for the main message
 *   - ctaText/ctaUrl: optional pill-shaped CTA
 *   - footerHtml: extra footer text shown beneath the unsubscribe link
 */
function renderEmailTemplate(options: {
  title: string
  greeting?: string
  bodyHtml: string
  ctaText?: string
  ctaUrl?: string
  footerHtml?: string
  recipientEmail?: string
}): { html: string, text: string } {
  const { appName, appUrl } = getEmailConfig()
  const monogram = logoMonogram(appName)
  const safeAppName = escapeHtml(appName)

  const greetingHtml = options.greeting
    ? `<p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.5;text-align:left;">${options.greeting}</p>`
    : ''

  const ctaButton = options.ctaText && options.ctaUrl
    ? `
      <div style="margin:0 0 28px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${options.ctaUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="50%" fillcolor="#111111">
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">${options.ctaText}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${options.ctaUrl}"
           style="display:inline-block;background-color:#111111;color:#ffffff !important;padding:14px 36px;text-decoration:none;border-radius:100px;font-size:16px;font-weight:600;letter-spacing:-0.01em;border:2px solid #111111;mso-padding-alt:0;">
          ${options.ctaText}
        </a>
        <!--<![endif]-->
      </div>`
    : ''

  const footerExtra = options.footerHtml
    ? `<p style="margin:0 0 8px;color:#999999;font-size:12px;line-height:1.6;">${options.footerHtml}</p>`
    : ''

  const recipientLine = options.recipientEmail
    ? `<p style="margin:0 0 4px;color:#999999;font-size:12px;">You received this because you have an account at ${safeAppName} (${escapeHtml(options.recipientEmail)}).</p>`
    : `<p style="margin:0 0 4px;color:#999999;font-size:12px;">You received this because you have an account at ${safeAppName}.</p>`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111111;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:48px;">
      <div style="display:inline-block;width:40px;height:40px;background:#111111;border-radius:10px;line-height:40px;text-align:center;">
        <span style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:-0.02em;">${monogram}</span>
      </div>
    </div>

    <!-- Card -->
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:20px;padding:48px 40px;text-align:center;">

      <h1 style="margin:0 0 12px;color:#111111;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.25;">
        ${options.title}
      </h1>

      <div style="margin:0 0 32px;color:#666666;font-size:16px;line-height:1.6;text-align:left;">
        ${greetingHtml}
        ${options.bodyHtml}
      </div>

      ${ctaButton}

      <!-- Divider -->
      <div style="height:1px;background:#e0e0e0;margin:0 0 24px;"></div>

      <!-- Fallback link -->
      ${options.ctaUrl
        ? `<p style="margin:0;color:#999999;font-size:13px;line-height:1.6;">
             Or copy this link into your browser:<br>
             <a href="${options.ctaUrl}" style="color:#666666;text-decoration:underline;word-break:break-all;">${options.ctaUrl}</a>
           </p>`
        : `<p style="margin:0;color:#999999;font-size:13px;line-height:1.6;">
             Manage your notifications anytime in your <a href="${appUrl}/settings/notifications" style="color:#666666;text-decoration:underline;">notification settings</a>.
           </p>`}
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;">
      ${footerExtra}
      ${recipientLine}
      <p style="margin:0;color:#bbbbbb;font-size:12px;">
        <a href="${appUrl}/settings/notifications" style="color:#bbbbbb;text-decoration:underline;">Manage notification preferences</a>
      </p>
    </div>

  </div>
</body>
</html>`

  // Plain text — strip HTML, preserve newlines.
  const stripHtml = (s: string) => s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  let text = `${stripHtml(options.title)}\n\n`
  if (options.greeting) text += `${stripHtml(options.greeting)}\n\n`
  text += stripHtml(options.bodyHtml) + '\n\n'
  if (options.ctaText && options.ctaUrl) {
    text += `${options.ctaText}: ${options.ctaUrl}\n\n`
  }
  text += `Manage notification preferences: ${appUrl}/settings/notifications`

  return { html, text }
}

export interface MagicLinkEmailData {
  to: string
  name: string
  magicLinkUrl: string
  event?: H3Event
}

/**
 * Send magic link email
 */
export async function sendMagicLinkEmail(data: MagicLinkEmailData): Promise<void> {
  const client = getResendClient(data.event)
  const { appName } = getEmailConfig(data.event)

  if (!client) {
    console.error('[Email] Cannot send magic link — Resend client not configured. Recipient:', data.to)
    if (import.meta.dev) {
      console.log('[Email] Dev fallback — magic link URL:', data.magicLinkUrl)
      return
    }
    throw new Error('Email service not configured')
  }

  try {
    const safeName = escapeHtml(data.name.split(' ')[0])

    await client.emails.send({
      from: getFromHeader(data.event),
      to: data.to,
      subject: `Your sign-in link for ${appName}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111111;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:48px;">
      <div style="display:inline-block;width:40px;height:40px;background:#111111;border-radius:10px;line-height:40px;text-align:center;">
        <span style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:-0.02em;">XF</span>
      </div>
    </div>

    <!-- Card -->
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:20px;padding:48px 40px;text-align:center;">

      <h1 style="margin:0 0 8px;color:#111111;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.2;">
        Welcome back, ${safeName}
      </h1>

      <p style="margin:0 0 36px;color:#666666;font-size:16px;line-height:1.6;">
        Tap the button below to sign in to your account. This link is valid for one hour.
      </p>

      <!-- CTA Button -->
      <div style="margin:0 0 36px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${data.magicLinkUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="50%" fillcolor="#111111">
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Sign in to ${escapeHtml(appName)}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${data.magicLinkUrl}"
           style="display:inline-block;background-color:#111111;color:#ffffff !important;padding:14px 36px;text-decoration:none;border-radius:100px;font-size:16px;font-weight:600;letter-spacing:-0.01em;border:2px solid #111111;mso-padding-alt:0;">
          Sign in to ${escapeHtml(appName)}
        </a>
        <!--<![endif]-->
      </div>

      <!-- Divider -->
      <div style="height:1px;background:#e0e0e0;margin:0 0 24px;"></div>

      <!-- Fallback link -->
      <p style="margin:0;color:#999999;font-size:13px;line-height:1.6;">
        Or copy this link into your browser:<br>
        <a href="${data.magicLinkUrl}" style="color:#666666;text-decoration:underline;word-break:break-all;">${data.magicLinkUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;">
      <p style="margin:0 0 4px;color:#999999;font-size:12px;">
        You received this because a sign-in was requested for ${escapeHtml(data.to)}.
      </p>
      <p style="margin:0;color:#bbbbbb;font-size:12px;">
        If you didn&rsquo;t request this, you can safely ignore this email.
      </p>
    </div>

  </div>
</body>
</html>`,
      text: `Hi ${data.name},\n\nSign in to ${appName}: ${data.magicLinkUrl}\n\nThis link is valid for one hour.\n\nIf you didn't request this, you can safely ignore this email.`
    })

    console.log('[Email] Magic link sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send magic link:', error)
    throw error
  }
}

// --- Notification email templates ---

export async function sendTaskAssignedEmail(data: {
  to: string
  name: string
  taskTitle: string
  projectName?: string
  assignerName: string
  dueDate?: Date
  taskUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('task_assigned')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Task assigned email (no client) for', data.to)
    return
  }

  const dueLine = data.dueDate
    ? `<p><strong>Due:</strong> ${data.dueDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`
    : ''
  const projectLine = data.projectName
    ? `<p><strong>Project:</strong> ${escapeHtml(data.projectName)}</p>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: `You've been assigned: ${escapeHtml(data.taskTitle)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.assignerName)}</strong> assigned you to a task:</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-weight: 600; font-size: 16px;">${escapeHtml(data.taskTitle)}</p>
      </div>
      ${projectLine}
      ${dueLine}
    `,
    ctaText: 'View Task',
    ctaUrl: data.taskUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `You've been assigned: ${data.taskTitle}`, // plain text context, no escaping needed
      html,
      text
    })
    console.log('[Email] Task assigned email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send task assigned email:', error)
  }
}

export async function sendMentionEmail(data: {
  to: string
  name: string
  taskTitle: string
  mentionerName: string
  commentSnippet: string
  taskUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('task_mentioned')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Mention email (no client) for', data.to)
    return
  }

  const { html, text } = renderEmailTemplate({
    title: `${escapeHtml(data.mentionerName)} mentioned you`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.mentionerName)}</strong> mentioned you in <strong>${escapeHtml(data.taskTitle)}</strong>:</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; color: #4b5563; font-style: italic;">"${escapeHtml(data.commentSnippet)}"</p>
      </div>
    `,
    ctaText: 'View Comment',
    ctaUrl: data.taskUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `${data.mentionerName} mentioned you`,
      html,
      text
    })
    console.log('[Email] Mention email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send mention email:', error)
  }
}

export async function sendApprovalRequestEmail(data: {
  to: string
  name: string
  taskTitle: string
  requesterName: string
  stepName?: string
  taskUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('approval_requested')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Approval request email (no client) for', data.to)
    return
  }

  const stepLine = data.stepName
    ? `<p><strong>Step:</strong> ${escapeHtml(data.stepName)}</p>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: `Approval needed: ${escapeHtml(data.taskTitle)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.requesterName)}</strong> has requested your approval:</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-weight: 600; font-size: 16px;">${escapeHtml(data.taskTitle)}</p>
      </div>
      ${stepLine}
      <p>Please review and approve or reject this item.</p>
    `,
    ctaText: 'Review & Approve',
    ctaUrl: data.taskUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Approval needed: ${data.taskTitle}`,
      html,
      text
    })
    console.log('[Email] Approval request email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send approval request email:', error)
  }
}

export async function sendDueReminderEmail(data: {
  to: string
  name: string
  taskTitle: string
  dueDate: Date
  daysRemaining: number
  taskUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('task_due')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Due reminder email (no client) for', data.to)
    return
  }

  const isOverdue = data.daysRemaining < 0
  const when = isOverdue
    ? 'overdue'
    : data.daysRemaining === 0 ? 'today' : data.daysRemaining === 1 ? 'tomorrow' : `in ${data.daysRemaining} days`

  const urgencyColor = isOverdue ? '#dc2626' : data.daysRemaining <= 1 ? '#f59e0b' : BRAND_COLOR
  const urgencyLabel = isOverdue ? 'OVERDUE' : data.daysRemaining <= 1 ? 'URGENT' : 'UPCOMING'

  const { html, text } = renderEmailTemplate({
    title: `Task due ${when}: ${escapeHtml(data.taskTitle)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p>You have a task that ${isOverdue ? 'is overdue' : 'is coming up'}:</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${urgencyColor}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0 0 4px; font-weight: 600; font-size: 16px;">${escapeHtml(data.taskTitle)}</p>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Due: ${data.dueDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          <span style="display: inline-block; margin-left: 8px; background: ${urgencyColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${urgencyLabel}</span>
        </p>
      </div>
    `,
    ctaText: 'View Task',
    ctaUrl: data.taskUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Task due ${when}: ${data.taskTitle}`,
      html,
      text
    })
    console.log('[Email] Due reminder email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send due reminder email:', error)
  }
}

/**
 * Send a pre-rendered white-label analytics report (HTML body) to one or more
 * recipients, optionally appending a link to the archived copy. The HTML is
 * already composed by reportModel.renderReportHtml, so we send it as-is rather
 * than wrapping it in the platform email template.
 */
export async function sendAnalyticsReportEmail(data: {
  event?: H3Event
  to: string[]
  subject: string
  html: string
  reportUrl?: string | null
}): Promise<{ sent: boolean }> {
  const client = getResendClient(data.event)
  if (!client) {
    console.log('[Email] Analytics report (no Resend client) for', data.to.join(', '))
    return { sent: false }
  }
  const html = data.reportUrl
    ? data.html.replace(
        '</body>',
        `<div style="text-align:center;padding:16px;font-size:12px"><a href="${escapeHtml(data.reportUrl)}">View this report online</a></div></body>`
      )
    : data.html
  try {
    await client.emails.send({ from: getFromHeader(data.event), to: data.to, subject: data.subject, html })
    console.log('[Email] Analytics report sent to', data.to.join(', '))
    return { sent: true }
  } catch (error) {
    console.error('[Email] Failed to send analytics report:', error)
    return { sent: false }
  }
}

/**
 * Customer-facing dunning reminder for an outstanding sales invoice.
 * Sent from the agency to the client, chasing payment with a one-click
 * pay link (Xero OnlineInvoiceUrl). Tone adapts to days-overdue.
 */
export async function sendInvoiceReminderEmail(data: {
  to: string
  contactName: string
  invoiceNumber: string
  amountDue: number
  currency: string
  dueDate: string
  daysOverdue: number
  payUrl?: string | null
  agencyName?: string
  event?: H3Event
}): Promise<{ ok: boolean, error?: string }> {
  const client = getResendClient(data.event)
  if (!client) {
    return { ok: false, error: 'Email service not configured (RESEND_API_KEY missing).' }
  }

  const { appName } = getEmailConfig(data.event)
  const agency = data.agencyName || appName
  const overdue = data.daysOverdue > 0
  const amountFmt = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: data.currency || 'AUD',
    maximumFractionDigits: 2
  }).format(data.amountDue)

  let toneOpening: string
  let subject: string
  if (!overdue) {
    toneOpening = `A friendly reminder that invoice ${escapeHtml(data.invoiceNumber)} is due ${escapeHtml(data.dueDate)}. The link below takes you straight to a secure pay page — no Xero login required.`
    subject = `Reminder: invoice ${data.invoiceNumber} due ${data.dueDate}`
  } else if (data.daysOverdue <= 7) {
    toneOpening = `Just a quick note that invoice ${escapeHtml(data.invoiceNumber)} (${escapeHtml(data.dueDate)}) is now ${data.daysOverdue} day${data.daysOverdue === 1 ? '' : 's'} past due. Easy fix — the link below takes you straight to a secure pay page.`
    subject = `Invoice ${data.invoiceNumber} — ${data.daysOverdue} day${data.daysOverdue === 1 ? '' : 's'} overdue`
  } else if (data.daysOverdue <= 30) {
    toneOpening = `Invoice ${escapeHtml(data.invoiceNumber)} was due ${escapeHtml(data.dueDate)} and is now ${data.daysOverdue} days overdue. We'd appreciate prompt payment via the link below — if there's an issue with the invoice please reply to this email so we can resolve it together.`
    subject = `Action needed: invoice ${data.invoiceNumber} ${data.daysOverdue}d overdue`
  } else {
    toneOpening = `Invoice ${escapeHtml(data.invoiceNumber)} is ${data.daysOverdue} days past due. Please settle the balance via the link below as soon as possible. If the invoice is in dispute or you need to discuss a payment plan, reply directly to this email.`
    subject = `URGENT: invoice ${data.invoiceNumber} ${data.daysOverdue}d overdue`
  }

  const bodyHtml = `
    <p style="margin:0 0 16px;">${toneOpening}</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:0 0 24px;text-align:left;">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Invoice</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111827;">${escapeHtml(data.invoiceNumber)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Amount due</p>
      <p style="margin:0 0 12px;font-size:22px;font-weight:700;color:${overdue ? '#dc2626' : '#111827'};">${escapeHtml(amountFmt)}</p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Due ${escapeHtml(data.dueDate)}${overdue ? ` · <span style="color:#dc2626;font-weight:600;">${data.daysOverdue} day${data.daysOverdue === 1 ? '' : 's'} overdue</span>` : ''}
      </p>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;">Thanks,</p>
    <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">${escapeHtml(agency)}</p>
  `

  const { html, text } = renderEmailTemplate({
    title: overdue ? 'Payment overdue' : 'Friendly payment reminder',
    greeting: `Hi ${escapeHtml(data.contactName || 'there')},`,
    bodyHtml,
    ctaText: data.payUrl ? 'Pay invoice' : undefined,
    ctaUrl: data.payUrl || undefined,
    footerHtml: 'If you\'ve already paid, please disregard — payments can take a day or two to clear in our system.',
    recipientEmail: data.to
  })

  try {
    await client.emails.send({
      from: getFromHeader(data.event),
      to: data.to,
      subject,
      html,
      text
    })
    return { ok: true }
  } catch (error: any) {
    console.error('[Email] Failed to send invoice reminder:', error)
    return { ok: false, error: error?.message || String(error) }
  }
}

export async function sendInvitationEmail(data: {
  to: string
  name?: string
  inviterName: string
  inviterEmail?: string
  teamName?: string
  inviteUrl?: string
  role?: string
  departments?: string[]
  message?: string
  token?: string
  expiresAt?: Date
}): Promise<void> {
  const client = getResendClient()
  const { appName, appUrl } = getEmailConfig()
  if (!client) {
    console.log('[Email] Invitation email (no client) for', data.to)
    return
  }

  const teamLabel = data.teamName || appName
  const inviteLink = data.inviteUrl || (data.token ? `${appUrl}/auth/accept-invite?token=${data.token}` : `${appUrl}/auth/register`)
  const safeTeamLabel = escapeHtml(teamLabel)

  const roleLine = data.role ? `<p><strong>Role:</strong> ${escapeHtml(data.role)}</p>` : ''
  const deptLine = data.departments?.length
    ? `<p><strong>Teams:</strong> ${data.departments.map(d => escapeHtml(d)).join(', ')}</p>`
    : ''
  const messageLine = data.message
    ? `<div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;"><p style="margin: 0; color: #4b5563; font-style: italic;">"${escapeHtml(data.message)}"</p></div>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: `You're invited to ${safeTeamLabel}`,
    greeting: data.name ? `Hi ${escapeHtml(data.name)},` : 'Hello,',
    bodyHtml: `
      <p><strong>${escapeHtml(data.inviterName)}</strong> has invited you to join <strong>${safeTeamLabel}</strong> on ${appName}.</p>
      ${roleLine}
      ${deptLine}
      ${messageLine}
      <p>Accept the invitation below to get started.</p>
    `,
    ctaText: 'Accept Invitation',
    ctaUrl: inviteLink
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `You're invited to ${teamLabel}`,
      html,
      text
    })
    console.log('[Email] Invitation email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send invitation email:', error)
  }
}

export async function sendVerificationEmail(data: {
  to: string
  name: string
  verificationUrl?: string
  token?: string
}): Promise<void> {
  const client = getResendClient()
  const { appUrl } = getEmailConfig()
  if (!client) {
    console.log('[Email] Verification email (no client) for', data.to)
    return
  }

  const verifyLink = data.verificationUrl || (data.token ? `${appUrl}/auth/verify?token=${data.token}` : `${appUrl}/auth/verify`)

  const { html, text } = renderEmailTemplate({
    title: 'Verify your email',
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p>Please verify your email address to complete your account setup.</p>
      <p style="color: #6b7280; font-size: 13px;">This link will expire in 24 hours.</p>
    `,
    ctaText: 'Verify Email',
    ctaUrl: verifyLink
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: 'Verify your email',
      html,
      text
    })
    console.log('[Email] Verification email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error)
  }
}

export async function sendWelcomeEmail(data: {
  to: string
  name: string
}): Promise<void> {
  const client = getResendClient()
  const { appName, appUrl } = getEmailConfig()
  if (!client) {
    console.log('[Email] Welcome email (no client) for', data.to)
    return
  }

  const { html, text } = renderEmailTemplate({
    title: `Welcome to ${appName}!`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p>Welcome aboard! Your account is all set. Here are a few things to get started:</p>
      <ul style="padding-left: 20px; color: #374151;">
        <li style="margin-bottom: 8px;"><strong>Create your first project</strong> &mdash; organize your work into boards and tasks.</li>
        <li style="margin-bottom: 8px;"><strong>Invite your team</strong> &mdash; collaborate in real time with assignments and approvals.</li>
        <li style="margin-bottom: 8px;"><strong>Customize your workflow</strong> &mdash; set up columns, statuses, and automations that fit your process.</li>
      </ul>
    `,
    ctaText: 'Go to Dashboard',
    ctaUrl: `${appUrl}/agency`
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Welcome to ${appName}!`,
      html,
      text
    })
    console.log('[Email] Welcome email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error)
  }
}

/**
 * Double-opt-in confirmation email for the public subscribe form (email
 * marketing Phase 4). Transactional — fires only on an explicit public signup
 * to a double-opt-in list, and is best-effort (silently skips when Resend isn't
 * configured). Independent of the campaign EMAIL_SENDING_ENABLED hard gate.
 * The confirmUrl (with its signed token) is built by the caller.
 */
export async function sendDoubleOptInEmail(data: {
  to: string
  listName: string
  confirmUrl: string
}): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Double opt-in email (no client) for', data.to)
    return
  }

  const { html, text } = renderEmailTemplate({
    title: 'Confirm your subscription',
    greeting: 'Hi,',
    bodyHtml: `
      <p>Please confirm you'd like to receive emails from <strong>${escapeHtml(data.listName)}</strong>.</p>
      <p style="color: #6b7280; font-size: 13px;">If you didn't request this, you can safely ignore this email &mdash; you won't be subscribed.</p>
    `,
    ctaText: 'Confirm subscription',
    ctaUrl: data.confirmUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Confirm your subscription to ${data.listName}`,
      html,
      text
    })
    console.log('[Email] Double opt-in email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send double opt-in email:', error)
  }
}

export async function sendPasswordResetEmail(data: {
  to: string
  name: string
  resetUrl?: string
  token?: string
  expiresAt?: Date
}): Promise<void> {
  const client = getResendClient()
  const { appUrl } = getEmailConfig()
  if (!client) {
    console.log('[Email] Password reset email (no client) for', data.to)
    return
  }

  const resetLink = data.resetUrl || (data.token ? `${appUrl}/auth/reset-password?token=${data.token}` : `${appUrl}/auth/reset-password`)

  const { html, text } = renderEmailTemplate({
    title: 'Reset your password',
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
      <p style="color: #6b7280; font-size: 13px;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    `,
    ctaText: 'Reset Password',
    ctaUrl: resetLink
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: 'Reset your password',
      html,
      text
    })
    console.log('[Email] Password reset email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send password reset email:', error)
  }
}

export async function sendQuoteEmail(data: {
  to: string
  quoteId: string
  quoteUrl?: string
  clientName?: string
  clientContactName?: string
  quoteNumber?: string
  total?: number
  currency?: string
  validUntil?: Date
  lineItems?: Array<{ description: string, quantity: number, unitPrice: number, total: number }>
  clientNotes?: string
  senderName?: string
  senderEmail?: string
}): Promise<void> {
  const client = getResendClient()
  const { appUrl } = getEmailConfig()
  if (!client) {
    console.log('[Email] Quote email (no client) for', data.to)
    return
  }

  const quoteLink = data.quoteUrl || `${appUrl}/quotes/${data.quoteId}`
  const quoteLabel = data.quoteNumber || data.quoteId

  let itemsHtml = ''
  if (data.lineItems?.length) {
    const rows = data.lineItems.map(item =>
      `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(item.description)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.quantity}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.unitPrice, data.currency)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.total, data.currency)}</td>
      </tr>`
    ).join('')

    itemsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Item</th>
            <th style="padding: 8px 12px; text-align: right; font-weight: 600;">Qty</th>
            <th style="padding: 8px 12px; text-align: right; font-weight: 600;">Price</th>
            <th style="padding: 8px 12px; text-align: right; font-weight: 600;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  const totalLine = data.total != null
    ? `<p style="font-size: 18px; font-weight: 700; text-align: right; margin: 8px 0;">Total: ${formatCurrency(data.total, data.currency)}</p>`
    : ''

  const validLine = data.validUntil
    ? `<p style="color: #6b7280; font-size: 13px;">Valid until ${data.validUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>`
    : ''

  const notesLine = data.clientNotes
    ? `<div style="background: #f3f4f6; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><p style="margin: 0; color: #4b5563; font-size: 14px;">${escapeHtml(data.clientNotes)}</p></div>`
    : ''

  const greeting = data.clientContactName ? `Hi ${escapeHtml(data.clientContactName)},` : 'Hello,'

  const { html, text } = renderEmailTemplate({
    title: 'Your quote is ready',
    greeting,
    bodyHtml: `
      <p>Your quote <strong>#${escapeHtml(quoteLabel)}</strong> has been prepared and is ready for your review.</p>
      ${itemsHtml}
      ${totalLine}
      ${validLine}
      ${notesLine}
    `,
    ctaText: 'View Quote',
    ctaUrl: quoteLink,
    footerHtml: data.senderName
      ? `<p style="font-size: 12px; color: #9ca3af;">Sent by ${escapeHtml(data.senderName)}${data.senderEmail ? ` (${escapeHtml(data.senderEmail)})` : ''}</p>`
      : ''
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Your quote #${quoteLabel} is ready`,
      html,
      text
    })
    console.log('[Email] Quote email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send quote email:', error)
  }
}

export async function sendClientPortalInviteEmail(data: {
  to: string
  name?: string
  portalUrl?: string
  clientUserName?: string
  clientName?: string
  inviterName?: string
  token?: string
  expiresAt?: Date
  permissions?: Record<string, boolean>
}): Promise<void> {
  const client = getResendClient()
  const { appName, appUrl } = getEmailConfig()
  if (!client) {
    console.log('[Email] Client portal invite email (no client) for', data.to)
    return
  }

  const recipientName = data.name || data.clientUserName || 'there'
  const portalLink = data.portalUrl || (data.token ? `${appUrl}/client-portal/accept?token=${data.token}` : `${appUrl}/client-portal`)
  const orgName = data.clientName || appName

  const { html, text } = renderEmailTemplate({
    title: 'Access your client portal',
    greeting: `Hi ${escapeHtml(recipientName)},`,
    bodyHtml: `
      <p>${data.inviterName ? `<strong>${escapeHtml(data.inviterName)}</strong> has invited you to` : 'You now have'} access to the <strong>${escapeHtml(orgName)}</strong> client portal where you can:</p>
      <ul style="padding-left: 20px; color: #374151;">
        <li style="margin-bottom: 8px;">Track project progress in real time</li>
        <li style="margin-bottom: 8px;">Review and approve deliverables</li>
        <li style="margin-bottom: 8px;">Communicate directly with the team</li>
      </ul>
    `,
    ctaText: 'Open Portal',
    ctaUrl: portalLink
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Access your ${orgName} client portal`,
      html,
      text
    })
    console.log('[Email] Client portal invite email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send client portal invite email:', error)
  }
}

export async function sendClientApprovalRequestEmail(data: {
  to: string
  clientName: string
  itemTitle?: string
  approvalUrl: string
  approvalTitle?: string
  projectName?: string
  approvalType?: string
  requesterName?: string
  description?: string
  dueDate?: Date
  expiresAt?: Date
}): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Client approval request email (no client) for', data.to)
    return
  }

  const title = data.approvalTitle || data.itemTitle || 'Item'
  const safeTitle = escapeHtml(title)
  const projectLine = data.projectName ? `<p><strong>Project:</strong> ${escapeHtml(data.projectName)}</p>` : ''
  const typeLine = data.approvalType ? `<p><strong>Type:</strong> ${escapeHtml(data.approvalType)}</p>` : ''
  const requesterLine = data.requesterName ? `<p>Requested by <strong>${escapeHtml(data.requesterName)}</strong></p>` : ''
  const descLine = data.description ? `<p style="color: #4b5563;">${escapeHtml(data.description)}</p>` : ''
  const dueLine = data.dueDate
    ? `<p style="color: #6b7280; font-size: 13px;">Due by ${data.dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: `Approval needed from ${escapeHtml(data.clientName)}`,
    greeting: `Hi ${escapeHtml(data.clientName)},`,
    bodyHtml: `
      <p>An item is ready for your review and approval:</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-weight: 600; font-size: 16px;">${safeTitle}</p>
      </div>
      ${projectLine}
      ${typeLine}
      ${requesterLine}
      ${descLine}
      ${dueLine}
      <p>Please review and let us know if it's approved or needs changes.</p>
    `,
    ctaText: 'Review & Approve',
    ctaUrl: data.approvalUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Approval needed: ${title}`,
      html,
      text
    })
    console.log('[Email] Client approval request email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send client approval request email:', error)
  }
}

/**
 * Send board change notification email
 */
export async function sendBoardChangeEmail(data: {
  to: string
  name: string
  boardName: string
  actorName: string
  action: string
  itemTitle?: string
  boardUrl: string
  itemUrl?: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('board_change')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Board change email (no client) for', data.to)
    return
  }

  const itemLine = data.itemTitle
    ? `<p style="margin: 12px 0; padding: 12px 16px; background: #f3f4f6; border-radius: 6px; font-weight: 600;">${escapeHtml(data.itemTitle)}</p>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: `Activity on ${escapeHtml(data.boardName)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.actorName)}</strong> ${escapeHtml(data.action)} on <strong>${escapeHtml(data.boardName)}</strong>.</p>
      ${itemLine}
    `,
    ctaText: data.itemUrl ? 'View Item' : 'View Board',
    ctaUrl: data.itemUrl || data.boardUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `[${data.boardName}] ${data.actorName} ${data.action}`,
      html,
      text
    })
    console.log('[Email] Board change email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send board change email:', error)
  }
}

export async function sendOfficeFollowUpEmail(data: {
  to: string
  subject: string
  body: string
  meetingTitle: string
}, event?: H3Event): Promise<void> {
  const client = getResendClient(event)
  if (!client) {
    console.log('[Email] Office follow-up email (no client) for', data.to)
    return
  }

  const safeBody = escapeHtml(data.body).replace(/\n/g, '<br>')
  const { html, text } = renderEmailTemplate({
    title: escapeHtml(data.subject),
    bodyHtml: `
      <p style="margin: 0 0 12px;">Follow-up from <strong>${escapeHtml(data.meetingTitle)}</strong>.</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; white-space: pre-wrap;">${safeBody}</p>
      </div>
    `,
    recipientEmail: data.to
  })

  try {
    await client.emails.send({
      from: getFromHeader(event),
      to: data.to,
      subject: data.subject,
      html,
      text
    })
    console.log('[Email] Office follow-up email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send office follow-up email:', error)
    throw error
  }
}

export async function sendOfficeMeetingInviteEmail(data: {
  to: string
  meetingTitle: string
  inviteUrl: string
  scheduleLabel?: string
  roomName?: string | null
  note?: string
}, event?: H3Event): Promise<void> {
  const client = getResendClient(event)
  if (!client) {
    console.log('[Email] Office meeting invite email (no client) for', data.to)
    return
  }

  const detailRows = [
    data.scheduleLabel ? `<p style="margin:0 0 8px;color:#555555;font-size:14px;"><strong>When:</strong> ${escapeHtml(data.scheduleLabel)}</p>` : '',
    data.roomName ? `<p style="margin:0 0 8px;color:#555555;font-size:14px;"><strong>Room:</strong> ${escapeHtml(data.roomName)}</p>` : ''
  ].filter(Boolean).join('')
  const noteHtml = data.note
    ? `<p style="margin:16px 0 0;color:#555555;font-size:14px;line-height:1.6;">${escapeHtml(data.note).replace(/\n/g, '<br>')}</p>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: `You're invited to ${escapeHtml(data.meetingTitle)}`,
    bodyHtml: `
      <p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.6;">Use the lobby link below to join from your browser. No account is required.</p>
      ${detailRows}
      ${noteHtml}
    `,
    ctaText: 'Open Meeting Lobby',
    ctaUrl: data.inviteUrl,
    recipientEmail: data.to
  })

  try {
    await client.emails.send({
      from: getFromHeader(event),
      to: data.to,
      subject: `Meeting invite: ${data.meetingTitle}`,
      html,
      text
    })
    console.log('[Email] Office meeting invite email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send office meeting invite email:', error)
    throw error
  }
}

export async function sendHrReviewAssignmentEmail(data: {
  to: string
  name: string
  cycleName: string
  roleTitle: string
  dueLabel: string
  assignmentUrl: string
  calendarInvite: string
}, event?: H3Event): Promise<boolean> {
  if (suppressMemberNotificationEmail('hr_review_assigned')) return false
  const client = getResendClient(event)
  if (!client) {
    console.log('[Email] HR review assignment email (no client) for', data.to)
    return false
  }

  const { html, text } = renderEmailTemplate({
    title: 'Your business review is ready',
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p>You have been invited to complete <strong>${escapeHtml(data.cycleName)}</strong>.</p>
      <p><strong>Role profile:</strong> ${escapeHtml(data.roleTitle)}<br>
      <strong>Required by:</strong> ${escapeHtml(data.dueLabel)}</p>
      <p>Your questionnaire is private to the restricted review workflow. A calendar file is attached as a deadline reminder; it contains no answers or private review content.</p>
    `,
    ctaText: 'Open My Review',
    ctaUrl: data.assignmentUrl,
    recipientEmail: data.to,
  })

  const result = await client.emails.send({
    from: getFromHeader(event),
    to: data.to,
    subject: `Action required: ${data.cycleName}`,
    html,
    text,
    attachments: [{
      filename: 'business-review-deadline.ics',
      content: data.calendarInvite,
      contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
    }],
  })
  if (result.error) {
    throw new Error(`HR review assignment email rejected: ${result.error.message}`)
  }
  return true
}

export async function sendHrReviewLifecycleEmail(data: {
  to: string
  name: string
  cycleName: string
  action: 'reminder' | 'overdue' | 'extension' | 'reschedule' | 'cancel' | 'reopen' | 'interview' | 'interview_cancelled'
  message: string
  assignmentUrl: string
  calendarInvite?: string
  calendarMethod?: 'REQUEST' | 'CANCEL'
}, event?: H3Event): Promise<boolean> {
  if (suppressMemberNotificationEmail(`hr_review_${data.action}`)) return false
  const client = getResendClient(event)
  if (!client) return false
  const labels = {
    reminder: 'Business review due soon', overdue: 'Business review overdue',
    extension: 'Business review extension approved', reschedule: 'Business review deadline updated',
    cancel: 'Business review assignment cancelled', reopen: 'Business review response reopened',
    interview: 'Business review interview scheduled',
    interview_cancelled: 'Business review interview cancelled',
  }
  const { html, text } = renderEmailTemplate({
    title: labels[data.action],
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `<p>${escapeHtml(data.message)}</p><p>This notice contains no questionnaire answers or private evidence.</p>`,
    ctaText: data.action === 'cancel' ? undefined : 'Open My Review',
    ctaUrl: data.action === 'cancel' ? undefined : data.assignmentUrl,
    recipientEmail: data.to,
  })
  const result = await client.emails.send({
    from: getFromHeader(event), to: data.to, subject: `${labels[data.action]}: ${data.cycleName}`, html, text,
    attachments: data.calendarInvite ? [{
      filename: 'business-review-deadline.ics', content: data.calendarInvite,
      contentType: `text/calendar; method=${data.calendarMethod || (data.action === 'cancel' ? 'CANCEL' : 'REQUEST')}; charset=UTF-8`,
    }] : undefined,
  })
  if (result.error) throw new Error(`HR review lifecycle email rejected: ${result.error.message}`)
  return true
}

export async function sendBoardMemberAddedEmail(data: {
  to: string
  name: string
  boardName: string
  adderName: string
  boardUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('board_member_added')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Board member added email (no client) for', data.to)
    return
  }

  const { html, text } = renderEmailTemplate({
    title: `You've been added to ${escapeHtml(data.boardName)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.adderName)}</strong> added you to the <strong>${escapeHtml(data.boardName)}</strong> board.</p>
      <p>You'll see updates from this board in your inbox and can jump in to collaborate.</p>
    `,
    ctaText: 'Open Board',
    ctaUrl: data.boardUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `${data.adderName} added you to ${data.boardName}`,
      html,
      text
    })
    console.log('[Email] Board member added email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send board member added email:', error)
  }
}

/**
 * Send AI agent digest email
 */
export async function sendAiDigestEmail(data: {
  to: string
  name: string
  reportTitle: string
  reportSummary: string
  findingsCount: number
  reportUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('ai_digest')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] AI digest email (no client) for', data.to)
    return
  }

  const findingsBadge = data.findingsCount > 0
    ? `<span style="display: inline-block; background: #7c3aed; color: white; padding: 2px 10px; border-radius: 12px; font-size: 13px; font-weight: 600;">${data.findingsCount} finding${data.findingsCount === 1 ? '' : 's'}</span>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: escapeHtml(data.reportTitle),
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p>Your AI digest is ready. ${findingsBadge}</p>
      <div style="background: #f3f4f6; border-left: 4px solid #7c3aed; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; color: #4b5563; font-size: 14px; white-space: pre-line;">${escapeHtml(data.reportSummary)}</p>
      </div>
      <p style="color: #6b7280; font-size: 13px;">View the full report for detailed findings and recommended actions.</p>
    `,
    ctaText: 'View Full Report',
    ctaUrl: data.reportUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `${data.reportTitle} - ${data.findingsCount} finding${data.findingsCount === 1 ? '' : 's'}`,
      html,
      text
    })
    console.log('[Email] AI digest email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send AI digest email:', error)
  }
}

// --- Brief notification email templates ---

export async function sendBriefStatusEmail(data: {
  to: string
  name: string
  briefTitle: string
  referenceNumber: string
  actorName: string
  oldStatus: string
  newStatus: string
  briefUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('brief_status')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Brief status email (no client) for', data.to)
    return
  }

  const formatStatus = (s: string) =>
    s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const { html, text } = renderEmailTemplate({
    title: `Brief status updated: ${escapeHtml(data.briefTitle)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.actorName)}</strong> updated the status of a brief:</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0 0 4px; font-weight: 600; font-size: 16px;">${escapeHtml(data.briefTitle)}</p>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Ref: ${escapeHtml(data.referenceNumber)}</p>
      </div>
      <p><strong>Status:</strong> ${formatStatus(data.oldStatus)} &rarr; ${formatStatus(data.newStatus)}</p>
    `,
    ctaText: 'View Brief',
    ctaUrl: data.briefUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `Brief "${data.briefTitle}" status: ${formatStatus(data.newStatus)}`,
      html,
      text
    })
    console.log('[Email] Brief status email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send brief status email:', error)
  }
}

export async function sendBriefCommentEmail(data: {
  to: string
  name: string
  briefTitle: string
  referenceNumber: string
  commenterName: string
  commentSnippet: string
  isInternal: boolean
  briefUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('brief_comment')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Brief comment email (no client) for', data.to)
    return
  }

  const prefix = data.isInternal ? '[Internal] ' : ''

  const { html, text } = renderEmailTemplate({
    title: `${prefix}New comment on ${escapeHtml(data.briefTitle)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.commenterName)}</strong> commented on brief <strong>${escapeHtml(data.briefTitle)}</strong> (${escapeHtml(data.referenceNumber)}):</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; color: #4b5563; font-style: italic;">"${escapeHtml(data.commentSnippet)}"</p>
      </div>
    `,
    ctaText: 'View Brief',
    ctaUrl: data.briefUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `${prefix}${data.commenterName} commented on "${data.briefTitle}"`,
      html,
      text
    })
    console.log('[Email] Brief comment email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send brief comment email:', error)
  }
}

export async function sendBriefAssignedEmail(data: {
  to: string
  name: string
  briefTitle: string
  referenceNumber: string
  assignerName: string
  briefUrl: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('brief_assigned')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Brief assigned email (no client) for', data.to)
    return
  }

  const { html, text } = renderEmailTemplate({
    title: `Brief assigned: ${escapeHtml(data.briefTitle)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p><strong>${escapeHtml(data.assignerName)}</strong> assigned you to a brief:</p>
      <div style="background: #f3f4f6; border-left: 4px solid ${BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0 0 4px; font-weight: 600; font-size: 16px;">${escapeHtml(data.briefTitle)}</p>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Ref: ${escapeHtml(data.referenceNumber)}</p>
      </div>
    `,
    ctaText: 'View Brief',
    ctaUrl: data.briefUrl
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `You've been assigned: ${data.briefTitle}`,
      html,
      text
    })
    console.log('[Email] Brief assigned email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send brief assigned email:', error)
  }
}

export async function sendAnomalyAlertEmail(data: {
  to: string
  name: string
  title: string
  description: string
  metricLabel?: string
  metricValue?: string // already-formatted, e.g. "$50,000" or "12%"
  recommendation?: string
  url: string
}): Promise<void> {
  if (suppressMemberNotificationEmail('anomaly_critical')) return
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Anomaly alert email (no client) for', data.to)
    return
  }

  const metricLine = (data.metricLabel && data.metricValue)
    ? `<p><strong>${escapeHtml(data.metricLabel)}:</strong> ${escapeHtml(data.metricValue)}</p>`
    : ''
  const recommendationBlock = data.recommendation
    ? `<div style="background: #fff7e6; border-left: 4px solid #f39c12; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
         <p style="margin: 0; font-weight: 600; font-size: 13px; color: #7a5b00;">Recommended next step</p>
         <p style="margin: 4px 0 0 0; font-size: 14px; color: #5a4400;">${escapeHtml(data.recommendation)}</p>
       </div>`
    : ''

  const { html, text } = renderEmailTemplate({
    title: `[Critical] ${escapeHtml(data.title)}`,
    greeting: `Hi ${escapeHtml(data.name)},`,
    bodyHtml: `
      <p style="font-size: 12px; color: #c43c3c; font-weight: 600; letter-spacing: 0.04em;">CRITICAL ANOMALY</p>
      <p style="font-size: 16px; line-height: 1.5; margin: 8px 0 16px 0;">${escapeHtml(data.description)}</p>
      ${metricLine}
      ${recommendationBlock}
    `,
    ctaText: 'Open in dashboard',
    ctaUrl: data.url
  })

  try {
    await client.emails.send({
      from: getFromHeader(),
      to: data.to,
      subject: `[Critical] ${data.title}`,
      html,
      text
    })
    console.log('[Email] Anomaly alert email sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send anomaly alert email:', error)
  }
}

/**
 * Format a number as currency
 */
function formatCurrency(amount: number, currency?: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD'
  }).format(amount)
}
