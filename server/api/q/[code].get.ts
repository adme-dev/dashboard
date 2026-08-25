/** Public QR redirect. GET /q/:code → 302 destination. Scan logged in-request (timeout-capped). */
import { isValidSlug } from '~~/shared/qr/slug'
import { resolveQrCode } from '~~/server/utils/qr/resolve'
import { recordScan, scanIpHash } from '~~/server/utils/qr/scans'
import { pickVariant } from '~~/shared/qr/ab'
import { qrNotFoundPage } from '~~/server/utils/qr/not-found-page'
import { buildTrackedUrl } from '~~/shared/qr/tracking'
import { loadPublicQrPage } from '~~/server/utils/qr/pages'
import { renderQrLandingPage } from '~~/server/utils/qr/landing/render'
import { isTurnstileEnabled } from '~~/server/utils/turnstile'
import { snapshotConsent } from '~~/server/utils/tracking/consent'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { competitionIsOpen, parseCompetitionRow } from '~~/server/utils/qr/competitions'
import { launchState } from '~~/shared/qr/page'

function notFound(event: any) {
  setResponseStatus(event, 404)
  setResponseHeaders(event, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' })
  return qrNotFoundPage()
}

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!isValidSlug(code)) return notFound(event)
  let qr
  try {
    qr = await resolveQrCode(event, code)
  } catch (err) {
    console.error('[qr:resolve]', err)
    qr = null
  }
  if (!qr || !qr.active) return notFound(event)
  const preview = getQuery(event).xf_preview === '1'
  if (preview) {
    // Staff preview: never counts as a scan, never accepts submissions. Drafts visible.
    try {
      await requireAuth(event)
    } catch {
      return notFound(event)
    }
  }
  // A/B arm: only for URL redirects (hosted pages have one destination). Same person → same arm all day.
  const variant = !preview && qr.ab?.enabled && qr.ab.variantBUrl && (qr.mode ?? 'url') === 'url'
    ? pickVariant(await scanIpHash(event), qr.ab.splitPct)
    : null
  if (!preview) await recordScan(event, qr, { variant }) // never throws; capped at SCAN_WRITE_TIMEOUT_MS
  if (qr.mode === 'page' || preview) {
    const hosted = await loadPublicQrPage(event, code!, { includeDraft: preview })
    if (hosted) {
      const consent = snapshotConsent({ consentCookieValue: getCookie(event, '_xf_consent'), cfIpCountry: getHeader(event, 'cf-ipcountry') })
      setResponseHeaders(event, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'strict-origin-when-cross-origin' })
      let competition: { termsUrl: string | null, skillQuestion: string | null, closedReason: string | null } | null = null
      if (hosted.page.competition_id) {
        const crow = await queryOne<any>(`SELECT * FROM qr_competitions WHERE id = $1`, [hosted.page.competition_id])
        if (crow) {
          const comp = parseCompetitionRow(crow)
          const win = competitionIsOpen(comp)
          competition = { termsUrl: `/q/${code}/terms`, skillQuestion: comp.type === 'skill' ? comp.details.skill_question : null, closedReason: win.open || preview ? null : win.reason }
        }
      }
      const cfg = hosted.page.config
      const launched = hosted.page.template === 'interest' && !preview && launchState(cfg).launched
        ? { headline: cfg.launch.launched_headline, body: cfg.launch.launched_body, redirectUrl: cfg.launch.launched_redirect_url }
        : null
      const offer = hosted.page.template === 'subscribe' && cfg.subscribe.offer_code ? { code: cfg.subscribe.offer_code, note: cfg.subscribe.offer_note } : null
      return renderQrLandingPage({
        code: code!, config: hosted.page.config, assets: hosted.assets, competition, launched, offer,
        submitPath: `/q/${code}/submit`, preview,
        turnstileSiteKey: isTurnstileEnabled() ? (useRuntimeConfig().public as any).turnstileSiteKey || null : null,
        allowPixels: !preview && consent.tracking === 'granted'
      })
    }
    if (qr.mode === 'page') return notFound(event) // page mode but nothing published yet
  }
  setResponseHeaders(event, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' })
  const destination = variant === 'B' && qr.ab?.variantBUrl ? qr.ab.variantBUrl : qr.url
  const target = buildTrackedUrl(destination, { code: qr.code ?? code!, enabled: qr.utmEnabled ?? true, medium: qr.utmMedium, source: qr.utmSource, campaign: qr.campaign, variant })
  return sendRedirect(event, target, 302)
})
