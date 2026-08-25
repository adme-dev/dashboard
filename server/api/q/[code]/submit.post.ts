/**
 * Public submit for hosted landing pages. POST /q/<code>/submit (proxied to /api/q/<code>/submit).
 * Validates against the page's own field schema, honeypot + Turnstile + per-IP rate limit,
 * then creates a lead through acceptLead (source 'qr') with the QR attribution attached.
 */
import { randomUUID } from 'node:crypto'
import { isValidSlug } from '~~/shared/qr/slug'
import { normalisePostcode } from '~~/shared/qr/page'
import { resolveQrCode } from '~~/server/utils/qr/resolve'
import { loadPublicQrPage } from '~~/server/utils/qr/pages'
import { buildTrackedUrl } from '~~/shared/qr/tracking'
import { acceptLead, resolveLeadCaptureMode } from '~~/server/utils/leads/acceptance'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { isTurnstileEnabled, verifyTurnstile } from '~~/server/utils/turnstile'
import { resolveClientIp } from '~~/server/utils/tracking/client-ip'
import { snapshotConsent } from '~~/server/utils/tracking/consent'
import { sha256Hex } from '~~/server/utils/exportTokens'
import { execute } from '~~/server/utils/db'

const MAX_BODY = 16 * 1024

function fail(event: any, status: number, message: string) {
  setResponseStatus(event, status)
  return { ok: false, message }
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Cache-Control': 'no-store' })
  const code = getRouterParam(event, 'code')
  if (!isValidSlug(code)) return fail(event, 404, 'Unknown code')
  if (getQuery(event).xf_preview === '1') return fail(event, 403, 'Submissions are disabled in preview')
  if (Number(getHeader(event, 'content-length') || 0) > MAX_BODY) return fail(event, 413, 'Too much data')

  const qr = await resolveQrCode(event, code!)
  if (!qr || !qr.active) return fail(event, 404, 'This code is no longer active')
  const hosted = await loadPublicQrPage(event, code!)
  if (!hosted) return fail(event, 404, 'This page is not available')

  const ip = resolveClientIp(getHeader(event, 'cf-connecting-ip'), getRequestIP(event, { xForwardedFor: true }))
  const salt = process.env.TRACKING_IP_SALT || ''
  const ipHash = ip ? await sha256Hex(`${ip}:${salt}`) : null
  const gate = allowRequest(`qr-submit:${code}:${ipHash ?? 'anon'}`, 8, 10 * 60_000)
  if (!gate.allowed) return fail(event, 429, 'Too many attempts — please try again in a few minutes')

  const raw = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!raw || typeof raw !== 'object') return fail(event, 400, 'Please fill in the form')
  if (typeof raw.website === 'string' && raw.website.trim()) return { ok: true } // honeypot: pretend success

  if (isTurnstileEnabled()) {
    const token = typeof raw['cf-turnstile-response'] === 'string' ? raw['cf-turnstile-response'] : null
    if (!await verifyTurnstile(token, ip || undefined)) return fail(event, 400, 'Please complete the verification and try again')
  }

  const cfg = hosted.page.config
  const fieldData: Record<string, string> = {}
  for (const f of cfg.fields) {
    const v = raw[f.key]
    const s = typeof v === 'string' ? v.trim() : v === true ? 'yes' : ''
    if (f.type === 'checkbox') {
      if (f.required && s !== 'yes') return fail(event, 422, `Please tick "${f.label}"`)
      fieldData[f.key] = s === 'yes' ? 'yes' : 'no'
      continue
    }
    if (!s) {
      if (f.required) return fail(event, 422, `${f.label} is required`)
      continue
    }
    if (s.length > 1000) return fail(event, 422, `${f.label} is too long`)
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return fail(event, 422, 'That email address doesn\'t look right')
    if (f.type === 'tel' && s.replace(/\D/g, '').length < 8) return fail(event, 422, 'That mobile number doesn\'t look right')
    if (f.type === 'postcode') {
      const pc = normalisePostcode(s)
      if (!pc) return fail(event, 422, 'Postcode should be 4 digits')
      fieldData.postcode = pc
      continue
    }
    if (f.type === 'select' && f.options?.length && !f.options.includes(s)) return fail(event, 422, `Please choose a ${f.label.toLowerCase()}`)
    fieldData[f.key] = s
  }
  if (cfg.marketing_consent) fieldData.marketing_consent = raw.marketing_consent === 'yes' || raw.marketing_consent === true ? 'yes' : 'no'

  const landing = typeof raw.landing_page === 'string' ? raw.landing_page.slice(0, 512) : ''
  const tagged = new URL(buildTrackedUrl('https://x.invalid/', { code: code!, enabled: true, medium: qr.utmMedium, source: qr.utmSource, campaign: qr.campaign }))
  const attribution: Record<string, string> = { xf_qr: code! }
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const v = tagged.searchParams.get(k)
    if (v) attribution[k] = v
  }
  if (landing) attribution.landing_page = landing

  const consent = snapshotConsent({ consentCookieValue: getCookie(event, '_xf_consent'), cfIpCountry: getHeader(event, 'cf-ipcountry') })
  const result = await acceptLead(event, {
    lead: {
      client_id: hosted.clientId,
      source: 'qr',
      source_lead_id: `${code}:${randomUUID()}`,
      form_id: hosted.page.id,
      form_name: cfg.headline,
      ad_id: null, ad_name: null, campaign_id: null,
      campaign_name: attribution.utm_campaign ?? null,
      page_id: null,
      submitted_at: new Date().toISOString(),
      field_data: fieldData,
      attribution,
      assigned_to: await resolveAssignedAm(hosted.clientId),
      created_by: null
    },
    consentDecision: consent.tracking,
    leadCaptureMode: await resolveLeadCaptureMode(hosted.clientId)
  })
  if (result.status === 'created') {
    await execute(`UPDATE qr_pages SET submissions_count = submissions_count + 1 WHERE id = $1`, [hosted.page.id]).catch(() => {})
  }
  return { ok: true, redirect: cfg.success_redirect_url }
})
