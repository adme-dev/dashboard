import { createError, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'

const Body = z.object({
  frameworkKey: z.enum(['ami-mcf', 'sfia-9', 'pmi-pmcd']),
  name: z.string().trim().min(3).max(300),
  publisher: z.string().trim().min(2).max(300),
  version: z.string().trim().min(1).max(100),
  sourceUrl: z.string().url().max(1000),
  licenseTerms: z.string().trim().min(10).max(2000),
  roleFamilies: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
  levels: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  criteria: z.array(z.object({ dimension: z.string().trim().min(2).max(200), description: z.string().trim().max(1000).optional() })).min(1).max(100),
  reviewDueAt: z.string().date(),
})

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid benchmark framework draft', data: { issues: parsed.error.issues } })
  if (Date.parse(parsed.data.reviewDueAt) <= Date.now()) throw createError({ statusCode: 400, statusMessage: 'Benchmark review date must be in the future' })
  const input = parsed.data
  const framework = await transaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO hr_benchmark_frameworks
        (framework_key, name, publisher, version, source_url, criteria, status,
         license_terms, role_families, levels, review_due_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'draft', $7, $8::jsonb, $9::jsonb, $10, $11)
       RETURNING id, framework_key, name, publisher, version, status`,
      [input.frameworkKey, input.name, input.publisher, input.version, input.sourceUrl,
        JSON.stringify(input.criteria), input.licenseTerms, JSON.stringify(input.roleFamilies),
        JSON.stringify(input.levels), input.reviewDueAt, user.id],
    )
    await recordHrAuditEvent({ actorId: user.id, action: 'benchmark_framework.draft_created', targetType: 'hr_benchmark_framework', targetId: inserted.rows[0].id, metadata: { frameworkKey: input.frameworkKey, version: input.version } }, db)
    return inserted.rows[0]
  })
  return { framework }
})
