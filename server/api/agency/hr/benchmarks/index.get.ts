import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)
  const frameworks = await queryRows(
    `SELECT framework.id, framework.framework_key, framework.name, framework.publisher,
            framework.version, framework.source_url, framework.criteria, framework.status,
            framework.reviewed_at, framework.license_terms, framework.role_families,
            framework.levels, framework.review_due_at, framework.activated_at,
            creator.name AS created_by_name, activator.name AS activated_by_name
       FROM hr_benchmark_frameworks framework
       LEFT JOIN team_members creator ON creator.id = framework.created_by
       LEFT JOIN team_members activator ON activator.id = framework.activated_by
      ORDER BY framework.framework_key, framework.created_at DESC`,
  )
  return { frameworks, policy: { activeRequiredForNewRoles: true, historicalVersionsReproducible: true, automaticIndustryClaims: false } }
})
