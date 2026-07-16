import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { isSocialClientId } from '~~/server/utils/social/clientAccess'
import { normalizeSocialContentPackageInput } from '~~/server/utils/socialNewsGovernance'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const packageId = getRouterParam(event, 'packageId') || ''
  if (!isSocialClientId(packageId)) throw createError({ statusCode: 400, statusMessage: 'Invalid packageId' })
  const input = normalizeSocialContentPackageInput(await readBody<Record<string, unknown>>(event))
  const row = await queryOne(
    `INSERT INTO social_content_package_versions
       (package_id, version, status, profile_defaults, commercial_scope, created_by, published_at)
     SELECT p.id,
            COALESCE((SELECT MAX(v.version) + 1 FROM social_content_package_versions v WHERE v.package_id = p.id), 1),
            'published', $2::jsonb, $3::jsonb, $4, NOW()
       FROM social_content_packages p
      WHERE p.id = $1 AND p.status = 'active'
     RETURNING id, package_id, version, profile_defaults, commercial_scope, published_at`,
    [packageId, JSON.stringify(input.profileDefaults), JSON.stringify(input.commercialScope), user.id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Active package not found' })
  return row
})
