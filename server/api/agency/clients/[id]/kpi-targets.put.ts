import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import { replaceClientKpiTargets } from '~~/server/utils/clients/kpiTargets'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const marketing = await hasFreshMarketingManagementPermission(user.id)
  if (!marketing) await requireRole(event, PERMISSIONS.MANAGEMENT)
  const parsed = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Valid client ID required' })
  const body = await readBody(event)
  const expected = z.string().regex(/^[a-f0-9]{64}$/).safeParse(body?.expectedRevision)
  if (marketing && !expected.success) throw createError({ statusCode: 400, statusMessage: 'Read the current KPI revision before saving' })
  return transaction(async (db) => {
    if (marketing) {
      // Reuse only the uncached native identity/role policy; MCP consent/grants do not authorize browser edits.
      const fresh = await resolveMcpStaffContext(event, user.id, [])
      if (!fresh.permissionGroups?.includes('MARKETING_MANAGEMENT') || fresh.assistantReadOnly) throw createError({ statusCode: 403, statusMessage: 'Writable marketing management permission required' })
    }
    const saved = await replaceClientKpiTargets(db, parsed.data, body?.targets, expected.success ? expected.data : undefined, marketing)
    return { ok: true, count: saved.targets.length, revision: saved.revision }
  })
})
