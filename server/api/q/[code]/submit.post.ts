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
import { execute, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { competitionIsOpen, entrantKey, parseCompetitionRow } from '~~/server/utils/qr/competitions'

const MAX_BODY = 16 * 1024

function fail(event: any, status: number, message: string) {
  setResponseStatus(event, status)
  return { ok: false, message }
}

async function handleSubmit(event: any) {
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

  // Competition entry gate: open window, T&Cs acceptance, per-person limit, skill answer, state eligibility.
  let competition: ReturnType<typeof parseCompetitionRow> | null = null
  let entrant: string | null = null
  if (hosted.page.competition_id) {
    const crow = await queryOne<any>(`SELECT * FROM qr_competitions WHERE id = $1`, [hosted.page.competition_id])
    if (!crow) return fail(event, 404, 'This competition is no longer available')
    competition = parseCompetitionRow(crow)
    const win = competitionIsOpen(competition)
    if (!win.open) return fail(event, 409, win.reason)
    if (raw.accept_terms !== 'yes' && raw.accept_terms !== true) return fail(event, 422, 'Please accept the terms and conditions')
    if (competition.type === 'skill' && !(typeof raw.answer === 'string' && raw.answer.trim().length >= 3)) return fail(event, 422, 'Please answer the competition question')
    entrant = entrantKey(fieldData)
    if (!entrant) return fail(event, 422, 'A mobile number or email is required to enter')
    const existing = await queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM qr_competition_entries WHERE competition_id = $1 AND entrant_hash = $2`, [competition.id, await sha256Hex(`${competition.id}:${entrant}`)])
    if ((existing?.n ?? 0) >= competition.details.eligibility.max_entries_per_person) return fail(event, 409, competition.details.eligibility.max_entries_per_person === 1 ? 'You have already entered this competition' : 'You have reached the entry limit for this competition')
    if (fieldData.postcode) {
      const st = await queryOne<{ state: string }>(`SELECT state FROM geo_au_postcodes WHERE postcode = $1`, [fieldData.postcode])
      if (st && !competition.details.eligibility.states.includes(st.state as any)) return fail(event, 422, `This competition is open to residents of ${competition.details.eligibility.states.join(', ')} only`)
    }
  }

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
    if (competition && entrant) {
      const st = fieldData.postcode ? await queryOne<{ state: string }>(`SELECT state FROM geo_au_postcodes WHERE postcode = $1`, [fieldData.postcode]) : null
      await execute(
        `INSERT INTO qr_competition_entries (competition_id, qr_code_id, lead_id, entrant_hash, terms_version, answer, postcode, state, ip_hash, ua)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [competition.id, qr.id, result.leadId, await sha256Hex(`${competition.id}:${entrant}`), competition.terms_current_version,
          typeof raw.answer === 'string' ? raw.answer.trim().slice(0, 1000) : null, fieldData.postcode ?? null, st?.state ?? null, ipHash, (getHeader(event, 'user-agent') || '').slice(0, 512) || null])
    }
  }
  return { ok: true, redirect: cfg.success_redirect_url }
}

export default defineEventHandler(async (event) => {
  try {
    return await handleSubmit(event)
  } catch (err: any) {
    // Never leak internals to scanners; staff sessions get the message so prod failures are diagnosable
    // (Pages' tail does not surface request exceptions reliably).
    console.error('[qr:submit] failed', err?.message, err?.stack)
    if (typeof err?.statusCode === 'number' && err.statusCode < 500) throw err
    let staff = false
    try {
      await requireAuth(event)
      staff = true
    } catch {
      // not a staff session
    }
    setResponseStatus(event, 500)
    return { ok: false, message: staff ? `Submit failed: ${err?.message ?? err}` : 'Something went wrong — please try again.' }
  }
})
