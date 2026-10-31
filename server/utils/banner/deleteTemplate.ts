import type { H3Event } from 'h3'
import { canDeleteBannerTemplate } from '~~/shared/bannerTemplatePermissions'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'

/** Keep ownership and HTML instance references stable until deletion commits. */
export async function deleteBannerTemplate(event: H3Event, kind: 'native' | 'html') {
  const user = await requireWriteAccess(event)
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid template ID' })
  }

  // Table names come exclusively from this closed discriminator, never request input.
  const table = kind === 'html' ? 'banner_custom_templates' : 'banner_templates'
  await transaction(async (db) => {
    const result = await db.query(`
      SELECT created_by AS "createdBy", is_system AS "isSystem"
      FROM ${table} WHERE id = $1 FOR UPDATE
    `, [id])
    const template = result.rows[0]
    if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    if (!canDeleteBannerTemplate(user, template)) {
      throw createError({ statusCode: 403, statusMessage: 'Only the template creator or an administrator can delete this template' })
    }

    if (kind === 'html') {
      // FOR UPDATE above conflicts with the FK key-share lock used by new instances.
      // The separate READ COMMITTED statement also sees instances committed while we waited.
      const instances = await db.query('SELECT id FROM banner_custom_instances WHERE template_id = $1 LIMIT 1', [id])
      if (instances.rows.length > 0) {
        throw createError({ statusCode: 409, statusMessage: 'This HTML template is used by existing banners. It cannot be deleted while those banners depend on it.' })
      }
    }

    await db.query(`DELETE FROM ${table} WHERE id = $1`, [id])
  })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return { success: true, message: 'Template deleted' }
}
