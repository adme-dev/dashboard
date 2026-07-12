import { createError, getRouterParam, setHeader } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid benchmark framework' })
  const framework = await transaction(async (db) => {
    const result = await db.query(
      `SELECT * FROM hr_benchmark_frameworks WHERE id = $1 AND status = 'draft' FOR UPDATE`,
      [id.data],
    )
    const draft = result.rows[0]
    if (!draft) throw createError({ statusCode: 409, statusMessage: 'Only a draft benchmark version can be activated' })
    if (!draft.source_url || !draft.license_terms || !draft.review_due_at || !Array.isArray(draft.criteria) || !draft.criteria.length) {
      throw createError({ statusCode: 409, statusMessage: 'Source, licence terms, criteria and review date are required before activation' })
    }
    if (Date.parse(draft.review_due_at) <= Date.now()) throw createError({ statusCode: 409, statusMessage: 'The benchmark review date must be in the future' })
    await db.query("UPDATE hr_benchmark_frameworks SET status = 'retired' WHERE framework_key = $1 AND status = 'active'", [draft.framework_key])
    const activated = await db.query(
      `UPDATE hr_benchmark_frameworks
          SET status = 'active', reviewed_at = NOW(), activated_by = $2, activated_at = NOW()
        WHERE id = $1
        RETURNING id, framework_key, name, publisher, version, status, activated_at`,
      [draft.id, user.id],
    )
    await recordHrAuditEvent({ actorId: user.id, action: 'benchmark_framework.activated', targetType: 'hr_benchmark_framework', targetId: draft.id, metadata: { frameworkKey: draft.framework_key, version: draft.version } }, db)
    return activated.rows[0]
  })
  return { framework }
})
