import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const rows = await queryRows(
    `SELECT p.id, p.name, p.industry, p.description,
            v.id AS version_id, v.version, v.profile_defaults, v.commercial_scope
       FROM social_content_packages p
       JOIN LATERAL (
         SELECT * FROM social_content_package_versions
          WHERE package_id = p.id AND status = 'published'
          ORDER BY version DESC LIMIT 1
       ) v ON TRUE
      WHERE p.status = 'active'
      ORDER BY p.name`,
  )
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    versionId: row.version_id,
    version: Number(row.version),
    profileDefaults: row.profile_defaults || {},
    commercialScope: row.commercial_scope || {},
  }))
})
