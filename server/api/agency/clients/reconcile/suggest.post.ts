import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { aiGroupCandidates } from '~~/server/utils/xeroReconcileAI'

const schema = z.object({
  candidates: z.array(z.object({ contactId: z.string().min(1), name: z.string().min(1) })).min(1)
})

/**
 * POST /api/agency/clients/reconcile/suggest
 * Runs the Groq grouping over the supplied unresolved candidates. Returns
 * { ok:false, error } on AI failure so the page can fall back to manual grouping.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = schema.parse(await readBody(event))
  const clients = await queryRows<{ id: string; name: string }>(
    `SELECT id, name FROM agency_clients WHERE is_active = true ORDER BY name`
  )
  try {
    const grouping = await aiGroupCandidates(body.candidates, clients)
    return { ok: true, grouping }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'AI grouping failed' }
  }
})
