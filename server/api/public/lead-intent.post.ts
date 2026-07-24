import { resolveClientIp } from '~~/server/utils/tracking/client-ip'
import { snapshotConsent } from '~~/server/utils/tracking/consent'
import { rateCheck } from '~~/server/utils/tracking/rate-limit'
import {
  isOriginAllowed,
  resolveSiteByWriteKey
} from '~~/server/utils/tracking/site-config'
import {
  storeSubmissionIntent,
  SubmissionIntentSchema
} from '~~/server/utils/leads/submissionIntent'

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function pageOrigin(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).origin
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const requestOrigin = getHeader(event, 'origin') || null
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': requestOrigin || '*',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  })

  try {
    const contentLength = Number(getHeader(event, 'content-length') || 0)
    if (contentLength > 16 * 1024) {
      setResponseStatus(event, 413)
      return { ok: false }
    }

    const writeKey = String(getQuery(event).k || '')
    const site = await resolveSiteByWriteKey(writeKey)
    if (!site) {
      setResponseStatus(event, 403)
      return { ok: false }
    }

    const parsed = SubmissionIntentSchema.safeParse(await readBody(event).catch(() => null))
    if (!parsed.success) {
      setResponseStatus(event, 422)
      return { ok: false }
    }

    const originAllowed = site.allowedOrigins.length
      ? isOriginAllowed(site, requestOrigin)
      : Boolean(requestOrigin && pageOrigin(parsed.data.page_url) === requestOrigin)
    if (!originAllowed) {
      setResponseStatus(event, 403)
      return { ok: false }
    }

    const consent = snapshotConsent({
      consentCookieValue: parsed.data.consent,
      cfIpCountry: getHeader(event, 'cf-ipcountry')
    })
    if (consent.tracking !== 'granted') {
      setResponseStatus(event, 202)
      return { ok: true, stored: false }
    }

    const ip = resolveClientIp(
      getHeader(event, 'cf-connecting-ip'),
      getRequestIP(event, { xForwardedFor: true })
    )
    const ipHash = ip
      ? await sha256Hex(`${ip}:${process.env.TRACKING_IP_SALT || process.env.CRON_SECRET || ''}`)
      : null
    const limiter = (event.context as any).cloudflare?.env?.RATE_LIMITER
    if (limiter) {
      const verdict = await rateCheck(limiter, {
        writeKey: `lead-intent:${writeKey}`,
        ipHash,
        keyLimit: 120,
        ipLimit: 30,
        windowMs: 10_000
      })
      if (!verdict.allowed) {
        setResponseStatus(event, 429)
        return { ok: false }
      }
    }

    const stored = await storeSubmissionIntent({ site, payload: parsed.data })
    setResponseStatus(event, 202)
    return { ok: true, stored }
  } catch (error) {
    console.error({
      event: 'lead_submission_intent_failed',
      errorClass: error instanceof Error ? error.name : 'unknown'
    })
    setResponseStatus(event, 200)
    return { ok: true, stored: false }
  }
})
