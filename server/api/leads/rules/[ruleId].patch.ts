import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const Body = z.object({
  enabled: z.boolean().optional(),
  form_name: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const ruleId = getRouterParam(event, 'ruleId')!
  const b = Body.parse(await readBody(event))
  const sets: string[] = []
  const params: any[] = []
  if ('enabled' in b) { params.push(b.enabled); sets.push(`enabled = $${params.length}`) }
  if ('form_name' in b) { params.push(b.form_name); sets.push(`form_name = $${params.length}`) }
  if (!sets.length) return { ok: true }
  params.push(ruleId)
  await execute(
    `UPDATE lead_form_rules SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}`,
    params,
  )
  return { ok: true }
})
