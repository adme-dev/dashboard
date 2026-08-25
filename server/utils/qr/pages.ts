import type { H3Event } from 'h3'
import { kvGet, kvPut, kvDelete } from '~~/server/utils/kv'
import { queryOne, queryRows } from '~~/server/utils/db'
import { QrPageConfigSchema, type QrPageConfig, type QrPageTemplate } from '~~/shared/qr/page'

export interface QrPageRow {
  id: string
  qr_code_id: string
  template: QrPageTemplate
  config: QrPageConfig
  competition_id: string | null
  is_published: boolean
  published_at: string | null
  submissions_count: number
  created_at: string
  updated_at: string
}

export interface PublicQrPage {
  page: QrPageRow
  clientId: string
  clientName: string
  assets: { hero: string | null, logo: string | null }
}

const TTL = 3600
const key = (code: string) => `qr:page:${code}`

export function assetPublicPath(pageId: string, assetId: string): string {
  return `/api/q/assets/${pageId}/${assetId}`
}

async function assetPaths(pageId: string, config: QrPageConfig): Promise<{ hero: string | null, logo: string | null }> {
  const ids = [config.hero_asset_id, config.logo_asset_id].filter(Boolean) as string[]
  if (!ids.length) return { hero: null, logo: null }
  const rows = await queryRows<{ id: string, kind: 'hero' | 'logo' }>(`SELECT id, kind FROM qr_page_assets WHERE page_id = $1 AND id = ANY($2::uuid[])`, [pageId, ids])
  const find = (id: string | null, kind: 'hero' | 'logo') => (id && rows.some(r => r.id === id && r.kind === kind) ? assetPublicPath(pageId, id) : null)
  return { hero: find(config.hero_asset_id, 'hero'), logo: find(config.logo_asset_id, 'logo') }
}

/** Public page lookup by short code (KV-cached). Returns null when there is no published page. */
export async function loadPublicQrPage(event: H3Event, code: string, opts: { includeDraft?: boolean } = {}): Promise<PublicQrPage | null> {
  if (!opts.includeDraft) {
    const cached = await kvGet<PublicQrPage>(event, key(code))
    if (cached) return cached
  }
  const row = await queryOne<any>(
    `SELECT p.*, c.client_id, cl.name AS client_name FROM qr_pages p
     JOIN qr_codes c ON c.id = p.qr_code_id JOIN agency_clients cl ON cl.id = c.client_id
     WHERE c.code = $1 ${opts.includeDraft ? '' : 'AND p.is_published = TRUE'}`, [code])
  if (!row) return null
  const parsed = QrPageConfigSchema.safeParse(row.config)
  if (!parsed.success) return null
  const page: QrPageRow = { ...row, config: parsed.data }
  delete (page as any).client_id
  delete (page as any).client_name
  const result: PublicQrPage = { page, clientId: row.client_id, clientName: row.client_name, assets: await assetPaths(row.id, parsed.data) }
  if (!opts.includeDraft) await kvPut(event, key(code), result, TTL)
  return result
}

export async function invalidateQrPageCache(event: H3Event, code: string): Promise<void> {
  await kvDelete(event, key(code))
}
