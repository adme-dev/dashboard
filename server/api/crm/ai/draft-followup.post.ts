// server/api/crm/ai/draft-followup.post.ts
// Groq-drafted follow-up email for a stalled deal (P4.3). DRAFT ONLY — returned
// to the rep to edit/accept/dismiss; nothing is sent. Hard-gated on CRM_AI_ENABLED.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { isCrmAiEnabled } from '~~/server/utils/crm/aiConfig'
import { gatherOppContext } from '~~/server/utils/crm/aiSignals'
import { draftFollowUp } from '~~/server/utils/crm/aiDraft'

const Body = z.object({ client_id: z.string().uuid(), opportunity_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  if (!isCrmAiEnabled()) throw createError({ statusCode: 403, statusMessage: 'CRM AI is disabled' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const ctx = await gatherOppContext(parsed.data.client_id, parsed.data.opportunity_id)
  if (!ctx) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  ctx.draft.senderName = (user as { name?: string }).name ?? null
  const draft = await draftFollowUp(ctx.draft)
  return { enabled: true, draft }
})
