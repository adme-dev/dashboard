import { createError } from 'h3'
import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionCanonical, collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TRANSFER_AUTHORITIES, TRANSFER_AUTHORITY_ORIGIN, TRANSFER_AUTHORITY_ERROR, transferAuthorityKey, transferAuthorityWire, matchingTransferAuthorityResult, type TransferAuthority } from '../../../shared/pageStudio/managedTransferAuthorityTransport'
import { requirePageStudioProvisioningRuntime } from '../../../server/utils/pageStudio/provisioningBinding'
import { readManagedTransferExecutionContext, authorizeManagedTransferExecution } from '../../../server/utils/pageStudio/managedTransferExecution'
import { authorizeManagedTransferSourceDrafts } from '../../../server/utils/pageStudio/managedTransferSourceDrafts'
import { authorizeManagedTransferDestinationCatalogue } from '../../../server/utils/pageStudio/managedTransferDestinationCatalogue'
import { authorizeManagedTransferDestinationExecution } from '../../../server/utils/pageStudio/managedTransferDestinationExecution'
import { authorizeManagedTransferFormsHistory } from '../../../server/utils/pageStudio/managedTransferFormsHistory'
import { ManagedTransferCopyExecutionManagementRequestSchema as CopyRequest, ManagedTransferCopyExecutionManagementResultSchema as CopyResult } from '../../../shared/pageStudio/managed-transfer-copy-execution-management'
import { ManagedTransferDestinationAuthoringManagementRequestSchema as AuthoringRequest, ManagedTransferDestinationAuthoringManagementResultSchema as AuthoringResult } from '../../../shared/pageStudio/managed-transfer-destination-authoring-management'
import { ManagedTransferSourceRetentionManagementRequestSchema as RetentionRequest, ManagedTransferSourceRetentionManagementResultSchema as RetentionResult } from '../../../shared/pageStudio/managed-transfer-source-retention-management'
import { ManagedTransferCopyAuthorizationSchema } from '../../../shared/pageStudio/managed-transfer-copy-authorization'
import { handleManagedTransferCopyExecutionManagement } from './managedTransferCopyExecutionManagement'
import { handleManagedTransferDestinationAuthoringManagement } from './managedTransferDestinationAuthoringManagement'
import { handleManagedTransferSourceRetentionManagement } from './managedTransferSourceRetentionManagement'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

async function invoke(key: TransferAuthority, input: unknown, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const options = { env, runTransaction }
  switch (key) {
    case 'execution/context': return readManagedTransferExecutionContext(input, options)
    case 'execution/authorize': return authorizeManagedTransferExecution(input, options)
    case 'source-drafts/authorize': return authorizeManagedTransferSourceDrafts(input, options)
    case 'destination-catalogue/authorize': return authorizeManagedTransferDestinationCatalogue(input, options)
    case 'destination-execution/authorize': return authorizeManagedTransferDestinationExecution(input, options)
    case 'forms-history/authorize': return authorizeManagedTransferFormsHistory(input, options)
  }
  // These three already used Management RPC. Retain the exact inner envelope,
  // digest, canonical limits and handler; do not invoke Pages or nest a runner.
  let request: unknown
  let handler: (input: unknown, env: Record<string, unknown>, run: RunPageStudioTransaction) => Promise<unknown>
  if (key === 'copy-graph/authorize') {
    const authorization = ManagedTransferCopyAuthorizationSchema.parse(input)
    request = CopyRequest.parse({ operationId: authorization.operationId, intentDigest: authorization.intentDigest, action: 'authorize', authorization, expectedEnvironment: 'production' })
    handler = handleManagedTransferCopyExecutionManagement
  } else if (key === 'destination-authoring/authorize') {
    request = AuthoringRequest.parse({ action: 'authorize', authorization: input, expectedEnvironment: 'production' })
    if (new TextEncoder().encode(collectionCanonical(request)).byteLength > 300000) throw createError({ statusCode: 503 })
    handler = handleManagedTransferDestinationAuthoringManagement
  } else {
    request = RetentionRequest.parse({ authorization: input, expectedEnvironment: 'production' })
    if (new TextEncoder().encode(collectionCanonical(request)).byteLength > 65536) throw createError({ statusCode: 503 })
    handler = handleManagedTransferSourceRetentionManagement
  }
  const requestDigest = await collectionDigest(request)
  const response = await handler(structuredClone(request), env, runTransaction)
  const result = (key === 'copy-graph/authorize' ? CopyResult : key === 'destination-authoring/authorize' ? AuthoringResult : RetentionResult).parse(response)
  if (result.requestDigest !== requestDigest) throw createError({ statusCode: 503 })
  if (!result.ok) throw createError({ statusCode: result.error.statusCode })
  return matchingTransferAuthorityResult(key, input, result.value)
}

/** Fixed read/authorization callbacks only. Original SQL and every fresh fence are unchanged; no retry is added. */
export async function handleManagedTransferAuthorityFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const url = new URL(request.url), key = transferAuthorityKey(url.pathname)
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (!key || request.url !== TRANSFER_AUTHORITY_ORIGIN + url.pathname || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  const config = { ...env }, { maximum } = TRANSFER_AUTHORITIES[key]
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  try {
    const body = await boundedBody(request, maximum + 128)
    if (body.tooLarge) return reply(TRANSFER_AUTHORITY_ERROR, 413)
    digest = await collectionDigest(body.value)
    const parsed = transferAuthorityWire(key).safeParse(body.value)
    if (!parsed.success) return reply(TRANSFER_AUTHORITY_ERROR, 400)
    if (config.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true'
      || requirePageStudioProvisioningRuntime(config).environment !== 'production') return reply(TRANSFER_AUTHORITY_ERROR, 503)
    const input = structuredClone(parsed.data.input)
    const value = matchingTransferAuthorityResult(key, input, await invoke(key, structuredClone(input), config, runTransaction))
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) return reply(TRANSFER_AUTHORITY_ERROR, 503)
    return reply(value)
  } catch (error) {
    const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
    return reply(TRANSFER_AUTHORITY_ERROR, [400, 401, 403, 409, 413].includes(status) ? status : 503)
  }
}
