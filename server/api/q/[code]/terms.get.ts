/** Public T&Cs for the competition behind a hosted page — current version, rendered as plain HTML. */
import { isValidSlug } from '~~/shared/qr/slug'
import { queryOne } from '~~/server/utils/db'
import { loadPublicQrPage } from '~~/server/utils/qr/pages'
import { renderMarkdownLite, escapeQrHtml } from '~~/server/utils/qr/landing/markdown'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!isValidSlug(code)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const hosted = await loadPublicQrPage(event, code!, { includeDraft: getQuery(event).xf_preview === '1' })
  if (!hosted?.page.competition_id) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const t = await queryOne<{ terms_md: string, version: number, created_at: string }>(
    `SELECT v.terms_md, v.version, v.created_at FROM qr_competition_terms_versions v JOIN qr_competitions c ON c.id = v.competition_id AND c.terms_current_version = v.version WHERE c.id = $1`, [hosted.page.competition_id])
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Terms not published yet' })
  setResponseHeaders(event, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
  const body = t.terms_md.split('\n').map(l => l.startsWith('# ') ? `<h1>${escapeQrHtml(l.slice(2))}</h1>` : l.startsWith('## ') ? `<h2>${escapeQrHtml(l.slice(3))}</h2>` : l).join('\n')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms and Conditions</title><style>body{margin:0;padding:24px;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:720px;margin:0 auto;color:#14181a;background:#fff}h1{font-size:24px}h2{font-size:17px;margin-top:22px}ul{padding-left:20px}.v{color:#666;font-size:12px}</style></head><body>${renderMarkdownLite(body).replace(/&lt;(\/?h[12])&gt;/g, '<$1>')}<p class="v">Version ${t.version} · ${escapeQrHtml(new Date(t.created_at).toDateString())}</p></body></html>`
})
