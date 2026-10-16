import { createError } from 'h3'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { ManagedTransferCopyAuthorizationSchema } from '~~/shared/pageStudio/managed-transfer-copy-authorization'
import { callManagedTransferCopyExecution } from '~~/server/utils/pageStudio/managedTransferCopyExecutionManagement'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    if (requirePageStudioProvisioningRuntime(env).environment !== 'production') throw createError({ statusCode: 503, statusMessage: 'Production copy inspection is unavailable in this environment' })
    const authorization = ManagedTransferCopyAuthorizationSchema.parse(await readBody(event))
    return await callManagedTransferCopyExecution({ operationId: authorization.operationId, intentDigest: authorization.intentDigest, action: 'authorize', authorization }, { env: env! })
  } catch (error) { return pageStudioInternalHttpError(event, error) }
})
