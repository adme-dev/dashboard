import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TRANSFER_WORKFLOW_URL, TransferWorkflowRequestSchema } from '../../../shared/pageStudio/transferWorkflow'
import { handleTransferWorkflow } from './transferWorkflow'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

/** Placement changes only transport; the coordinator still owns every transaction. */
export async function handleTransferWorkflowFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const config = { ...env }
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== TRANSFER_WORKFLOW_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const denied = (status = 503) => reply('Transfer status could not be confirmed. Refresh the saved request before continuing.', status)
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return denied(400)
    digest = await collectionDigest(body.value)
    const parsed = TransferWorkflowRequestSchema.safeParse(body.value)
    if (!parsed.success) return denied(400)
    if (config.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') return denied()
    return reply(await handleTransferWorkflow(parsed.data, config, runTransaction))
  } catch { return denied() }
}
