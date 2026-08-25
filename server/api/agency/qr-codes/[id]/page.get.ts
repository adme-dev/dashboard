import { queryOne } from '~~/server/utils/db'
import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { QrPageConfigSchema, defaultPageConfig } from '~~/shared/qr/page'

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const page = await queryOne<any>(`SELECT * FROM qr_pages WHERE qr_code_id = $1`, [row.id])
  if (!page) {
    const client = await queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [row.client_id])
    return { page: null, draft: { template: 'lead', config: defaultPageConfig('lead', { name: row.name, clientName: client?.name }) } }
  }
  const parsed = QrPageConfigSchema.safeParse(page.config)
  return { page: { ...page, config: parsed.success ? parsed.data : page.config } }
})
