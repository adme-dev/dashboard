import { createError } from 'h3'
import { type CustomerSchemaUpgradeRequest, CustomerSchemaUpgradeStatusSchema } from '~~/shared/pageStudio/customerSchemaUpgrade'
import type { CustomerEditorClaims } from '~~/server/utils/pageStudio/customerEditorToken'
import { NATIVE_SCHEMA_COORDINATOR_URL, NATIVE_SCHEMA_COORDINATOR_ERROR } from '~~/shared/pageStudio/nativeSchemaCoordinator'
import { placedAuthorityFetch } from './placedAuthorityFetch'

const failed = () => createError({ statusCode: 503, statusMessage: NATIVE_SCHEMA_COORDINATOR_ERROR })
export async function callNativeSchemaCoordinator(input: CustomerSchemaUpgradeRequest, claims: CustomerEditorClaims, env: Record<string, unknown>) {
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') throw failed()
  const { request, value } = await placedAuthorityFetch(env.PAGE_STUDIO_MANAGEMENT, NATIVE_SCHEMA_COORDINATOR_URL, { expectedControlPlaneEnvironment: 'production', request: input, claims }, NATIVE_SCHEMA_COORDINATOR_ERROR)
  const result = CustomerSchemaUpgradeStatusSchema.safeParse(value), a = request.request
  if (!result.success || result.data.kind !== a.kind || (a.action === 'start' && result.data.requestId !== a.requestId) || (a.action === 'recover' && result.data.recoveryId !== a.requestId)) throw failed()
  return result.data
}
