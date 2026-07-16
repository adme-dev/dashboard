import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { normalizeSocialContentPackageInput } from '~~/server/utils/socialNewsGovernance'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const input = normalizeSocialContentPackageInput(await readBody<Record<string, unknown>>(event))
  if (!input.name) throw createError({ statusCode: 400, statusMessage: 'Package name required' })
  const row = await queryOne(
    `WITH package AS (
       INSERT INTO social_content_packages (name, industry, description, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id, name, industry, description
     ), version AS (
       INSERT INTO social_content_package_versions
         (package_id, version, status, profile_defaults, commercial_scope, created_by, published_at)
       SELECT id, 1, 'published', $5::jsonb, $6::jsonb, $4, NOW() FROM package
       RETURNING id, package_id, version, profile_defaults, commercial_scope
     )
     SELECT p.*, v.id AS version_id, v.version, v.profile_defaults, v.commercial_scope
       FROM package p JOIN version v ON v.package_id = p.id`,
    [input.name, input.industry || null, input.description || null, user.id,
      JSON.stringify(input.profileDefaults), JSON.stringify(input.commercialScope)],
  )
  return row
})
