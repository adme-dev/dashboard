// server/api/crm/ai/next-best-action.get.ts
// Explainable next-best-action suggestions for an opportunity (P4.3). Deterministic
// (no LLM) — returns {enabled:false} when CRM_AI_ENABLED is off. Agency-only.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { isCrmAiEnabled } from '~~/server/utils/crm/aiConfig'
import { gatherOppContext } from '~~/server/utils/crm/aiSignals'
import { nextBestActions } from '~~/server/utils/crm/nextBestAction'

const Query = z.object({ client_id: z.string().uuid(), opportunity_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  if (!isCrmAiEnabled()) return { enabled: false, suggestions: [] }
  const q = Query.parse(getQuery(event))
  const ctx = await gatherOppContext(q.client_id, q.opportunity_id)
  if (!ctx) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  return { enabled: true, suggestions: nextBestActions(ctx.signals) }
})
