import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { NATIVE_SCHEMA_AUTHORITY_URL, NativeSchemaAuthorityRequest, NativeSchemaContracts } from '../../../shared/pageStudio/nativeSchemaAuthority'
import { authorizeCustomerSchemaUpgrade } from '../../../server/utils/pageStudio/customerSchemaUpgrade'
import { collectionUpgradeContract, workflowUpgradeContract, collectionStagingUpgradeContract, formDraftsRuntimeContract, formDraftsUpgradeContract } from '../../../server/utils/pageStudio/schemaUpgradeContract'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

const contracts = { 'collection': collectionUpgradeContract, 'workflow': workflowUpgradeContract, 'collection-staging': collectionStagingUpgradeContract, 'form-runtime': formDraftsRuntimeContract, 'form-drafts': formDraftsUpgradeContract }
const rejected = (code: 'NATIVE_SCHEMA_INVALID' | 'NATIVE_SCHEMA_DENIED' | 'NATIVE_SCHEMA_UNAVAILABLE', statusCode: number) => ({ ok: false as const, error: { code, statusCode, message: 'Customer CMS authority could not be verified' } })
/** Production control-plane identities, staging preview scope. No cached admission. */
export async function handleNativeSchemaAuthority(input: unknown, environment: string, runTransaction: RunPageStudioTransaction) {
  const envelope = NativeSchemaAuthorityRequest.safeParse(input)
  if (!envelope.success) return rejected('NATIVE_SCHEMA_INVALID', 400)
  const intent = NativeSchemaContracts[envelope.data.kind].schema.safeParse(envelope.data.intent)
  if (!intent.success || intent.data.actor.kind !== 'customer-user' || intent.data.scope.environment !== 'staging'
    || intent.data.scope.businessId !== intent.data.scope.clientId) return rejected('NATIVE_SCHEMA_INVALID', 400)
  if (environment !== envelope.data.expectedControlPlaneEnvironment) return rejected('NATIVE_SCHEMA_UNAVAILABLE', 503)
  const started = performance.now()
  let outcome = 'denied'
  try {
    const value = await authorizeCustomerSchemaUpgrade(contracts[envelope.data.kind], intent.data, 'staging', { runTransaction })
    outcome = 'authorized'
    return { ok: true as const, value }
  } catch (error) {
    return error && typeof error === 'object' && 'statusCode' in error && [403, 409].includes(Number(error.statusCode))
      ? rejected('NATIVE_SCHEMA_DENIED', 403)
      : rejected('NATIVE_SCHEMA_UNAVAILABLE', 503)
  } finally {
    console.info(JSON.stringify({ event: 'native_schema_authority', kind: envelope.data.kind, elapsedMs: Math.round(performance.now() - started), outcome }))
  }
}

/** Only this fixed private fetch route is placed near the fresh database. */
export async function handleNativeSchemaAuthorityFetch(request: Request, env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: string, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED?: string }, runTransaction: RunPageStudioTransaction) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== NATIVE_SCHEMA_AUTHORITY_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  if (env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') return Response.json(rejected('NATIVE_SCHEMA_UNAVAILABLE', 503), { headers })
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return Response.json(rejected('NATIVE_SCHEMA_INVALID', 400), { headers })
    return Response.json(await handleNativeSchemaAuthority(body.value, env.PAGE_STUDIO_RELEASE_ENVIRONMENT, runTransaction), { headers })
  } catch { return Response.json(rejected('NATIVE_SCHEMA_UNAVAILABLE', 503), { headers }) }
}
