import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)
  const [packages, projects, allocations, rateCards] = await Promise.all([
    queryRows(
      `SELECT p.id, p.name, v.id AS version_id, v.version
         FROM social_content_packages p
         JOIN social_content_package_versions v ON v.package_id = p.id AND v.status = 'published'
        WHERE p.status = 'active'
        ORDER BY p.name, v.version DESC`,
    ),
    queryRows('SELECT id, name, status FROM projects WHERE client_id = $1 ORDER BY start_date DESC NULLS LAST, name', [clientId]),
    queryRows(
      `SELECT ba.id, ba.project_id, ba.campaign_type, ba.platform, ba.amount, ba.currency, ba.period, ba.month, ba.state
         FROM job_budget_allocations ba JOIN projects p ON p.id = ba.project_id
        WHERE p.client_id = $1 AND ba.state <> 'paused'
        ORDER BY ba.month DESC NULLS LAST, ba.created_at DESC`,
      [clientId],
    ),
    queryRows(
      `SELECT i.id, i.service_name, i.price, i.price_unit
         FROM rate_card_items i WHERE i.is_active = TRUE ORDER BY i.service_name`,
    ),
  ])
  return {
    packages: packages.map(row => ({ id: row.id, name: row.name, versionId: row.version_id, version: Number(row.version) })),
    projects: projects.map(row => ({ id: row.id, name: row.name, status: row.status })),
    allocations: allocations.map(row => ({
      id: row.id, projectId: row.project_id, campaignType: row.campaign_type, platform: row.platform,
      amount: Number(row.amount), currency: row.currency, period: row.period, month: row.month, state: row.state,
    })),
    rateCards: rateCards.map(row => ({ id: row.id, serviceName: row.service_name, price: Number(row.price), priceUnit: row.price_unit })),
  }
})
