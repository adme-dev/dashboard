/** Existing browser entry point prepares immutable paid launch reviews; execution requires the exact independently approved revision. */
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import { requireDepartmentClient } from '~~/server/utils/ai/marketing/departmentCampaignSupport'
import { metaLaunchInput, metaLaunchExact } from '~~/server/utils/ai/marketing/departmentMetaCampaignSchemas'
import { runDepartmentMetaCampaignOperation } from '~~/server/utils/ai/marketing/departmentMetaCampaignOperations'
import { paidHash } from '~~/server/utils/ai/marketing/departmentPaidProposals'

const legacy = metaLaunchInput.omit({ clientId: true, exportId: true }).extend({ exportId: z.string().uuid().optional() })
const governed = metaLaunchExact.extend({ action: z.enum(['approve', 'execute']) })
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const ctx = await resolveMcpStaffContext(event, user.id, [])
  if ((!ctx.permissionGroups?.includes('MARKETING_MANAGEMENT') && !ctx.permissionGroups?.includes('ADMIN')) || ctx.assistantReadOnly) throw createError({ statusCode: 403, statusMessage: 'Marketing management required' })
  const raw = await readBody(event)
  let name: string, input: Record<string, unknown>
  if (raw?.action) {
    const parsed = governed.safeParse(raw)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Exact proposal and revision acknowledgement required' })
    const { action, ...args } = parsed.data
    name = action === 'approve' ? 'marketing_approve_meta_ad_launch' : 'marketing_execute_meta_ad_launch'
    input = args
  } else {
    const parsed = legacy.safeParse(raw)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Valid paused ad details required' })
    const published = await queryOneFresh<{ client_id: string, project_id: string, format_key: string }>(`SELECT b.client_id,p.project_id,p.format_key FROM banner_published p JOIN banner_projects b ON b.id=p.project_id WHERE p.id=$1`, [parsed.data.publishedId])
    if (!published?.client_id) throw createError({ statusCode: 404, statusMessage: 'Client banner unavailable' })
    await requireDepartmentClient(ctx, published.client_id)
    const image = await queryOneFresh<{ id: string }>(`SELECT id FROM banner_exports WHERE project_id=$1 AND format_key=$2 AND export_type IN ('png','jpg','jpeg') AND ($3::uuid IS NULL OR id=$3) ORDER BY exported_at DESC,id DESC LIMIT 1`, [published.project_id, published.format_key, parsed.data.exportId ?? null])
    if (!image) throw createError({ statusCode: 409, statusMessage: 'Export this banner as PNG or JPG before preparing the ad review' })
    name = 'marketing_prepare_meta_ad_launch'
    input = { ...parsed.data, clientId: published.client_id, exportId: image.id }
  }
  const digest = paidHash({ actorId: user.id, name, input })
  const result = await runDepartmentMetaCampaignOperation(name, input, { ...ctx, source: undefined }, `browser:${digest}`, digest)
  if (!result.ok) throw createError({ statusCode: result.code === 'reconciliation_required' ? 409 : 403, statusMessage: result.error, data: { code: result.code, details: result.details } })
  return result.data
})
