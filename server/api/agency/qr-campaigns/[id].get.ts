/** Campaign detail: codes with scans + leads roll-up. GET /api/agency/qr-campaigns/:id */
import { queryOne } from '~~/server/utils/db'
import { campaignCodeRollup, requireCampaignAccess } from '~~/server/utils/qr/campaigns'

export default defineEventHandler(async (event) => {
  const { row } = await requireCampaignAccess(event, getRouterParam(event, 'id'))
  const [codes, client] = await Promise.all([
    campaignCodeRollup(row.id),
    queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [row.client_id])
  ])
  const totals = codes.reduce((t, c) => ({ scans: t.scans + (c.scan_count ?? 0), visitors: t.visitors + (c.visitors ?? 0), leads: t.leads + (c.leads ?? 0) }), { scans: 0, visitors: 0, leads: 0 })
  return { campaign: { ...row, client_name: client?.name ?? null }, codes, totals }
})
