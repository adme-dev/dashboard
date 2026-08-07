/**
 * PUBLIC marketing contact form — POST /api/public/contact
 *
 * No auth. Gates: zod validation, a hidden honeypot field, and a soft per-IP
 * throttle. Honeypot hits return ok so bots can't tell they were caught.
 * Delivery is via Resend to CONTACT_RECIPIENT (falls back to the owner).
 */
import { z } from 'zod'
import { getResendClient, getEmailConfig } from '~~/server/utils/email'

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160).optional(),
  teamSize: z.string().trim().max(40).optional(),
  // Optional so the landing-page walkthrough form (no message field) can share
  // this endpoint; the /contact page still requires it client-side.
  message: z.string().trim().min(10).max(4000).optional(),
  website: z.string().max(200).optional().default(''), // honeypot
})

const FALLBACK_RECIPIENT = 'advertising@adme.net.au'

// Soft per-IP throttle. Per-isolate only on Workers, but enough to stop
// naive burst spam; the honeypot handles the dumb bots.
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 5
const recentByIp = new Map<string, number[]>()

function throttled(ip: string): boolean {
  const now = Date.now()
  const hits = (recentByIp.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= MAX_PER_WINDOW) {
    recentByIp.set(ip, hits)
    return true
  }
  hits.push(now)
  recentByIp.set(ip, hits)
  if (recentByIp.size > 5000) recentByIp.clear()
  return false
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default defineEventHandler(async (event) => {
  const parsed = contactSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Please check the form fields and try again.' })
  }
  const { name, email, company, teamSize, message, website } = parsed.data

  // Honeypot filled → pretend success, send nothing.
  if (website) return { ok: true }

  const ip = getHeader(event, 'cf-connecting-ip') || getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (throttled(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many messages — please try again later.' })
  }

  const resend = getResendClient(event)
  if (!resend) {
    console.error('[Contact] RESEND_API_KEY not configured; dropping contact message from', email)
    throw createError({ statusCode: 503, statusMessage: 'The contact form is temporarily unavailable.' })
  }

  const { appName, fromEmail } = getEmailConfig(event)
  const recipient
    = (event.context as any).cloudflare?.env?.CONTACT_RECIPIENT
      || process.env.CONTACT_RECIPIENT
      || FALLBACK_RECIPIENT

  const subject = `XeroFlow contact — ${name}${company ? ` (${company})` : ''}`
  const messageText = message || '(No message — walkthrough request from the landing page form.)'
  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    company ? `Agency: ${company}` : null,
    teamSize ? `Team size: ${teamSize}` : null,
    '',
    messageText,
  ].filter((l): l is string => l !== null)

  const html = `
    <h2 style="margin:0 0 16px">New contact message</h2>
    <table style="border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:2px 12px 2px 0;color:#666">Name</td><td>${escapeHtml(name)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#666">Email</td><td>${escapeHtml(email)}</td></tr>
      ${company ? `<tr><td style="padding:2px 12px 2px 0;color:#666">Agency</td><td>${escapeHtml(company)}</td></tr>` : ''}
      ${teamSize ? `<tr><td style="padding:2px 12px 2px 0;color:#666">Team size</td><td>${escapeHtml(teamSize)}</td></tr>` : ''}
    </table>
    <p style="white-space:pre-wrap">${escapeHtml(messageText)}</p>
  `

  const { error } = await resend.emails.send({
    from: `${appName} <${fromEmail}>`,
    to: recipient,
    replyTo: email,
    subject,
    text: lines.join('\n'),
    html,
  })

  if (error) {
    console.error('[Contact] Resend send failed:', error)
    throw createError({ statusCode: 502, statusMessage: 'We could not send your message. Please try again.' })
  }

  return { ok: true }
})
