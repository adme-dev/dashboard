import { createError } from 'h3'
import { z } from 'zod'
import { CustomerEditorClaimsSchema, CustomerEditorCapabilitySchema } from '../../../server/utils/pageStudio/customerEditorToken'
import { assertCustomerEditorSessionAuthority } from '../../../server/utils/pageStudio/customerEditorSessionAuthority'
import { customerDestinationGuard, readCustomerActivation } from '../../../server/utils/pageStudio/customerActivation'
import { customerPreviewRuntimeEnvironment } from '../../../server/utils/pageStudio/customerPreviewRuntime'
import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { CUSTOMER_EDITOR_AUTHORITY_URL, CUSTOMER_EDITOR_AUTHORITY_ERROR } from '../../../shared/pageStudio/customerEditorAuthorityTransport'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

const Input = z.object({ expectedControlPlaneEnvironment: z.literal('production'), claims: CustomerEditorClaimsSchema, capability: CustomerEditorCapabilitySchema }).strict()
/** Already verified Pages claims;
exact stored session admission remains authoritative. */
export async function handleCustomerEditorAuthorityFetch(request: Request, env: Record<string, unknown>, run: RunPageStudioTransaction) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== CUSTOMER_EDITOR_AUTHORITY_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...headers, 'x-request-digest': digest } })
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return reply(CUSTOMER_EDITOR_AUTHORITY_ERROR, 400)
    digest = await collectionDigest(body.value)
    const parsed = Input.safeParse(body.value)
    if (!parsed.success) return reply(CUSTOMER_EDITOR_AUTHORITY_ERROR, 400)
    const { claims, capability } = parsed.data
    const configuration = () => {
      if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production') throw createError({ statusCode: 503 })
      const activation = readCustomerActivation(env)
      const native = claims.environment === 'staging'
        ? env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED === 'true' && customerPreviewRuntimeEnvironment(env)
        : null
      const editor = claims.environment === 'staging' ? native && native.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN : activation.productionEditorOrigin
      if (!activation.editorEnabled || !claims.capabilities.includes(capability) || claims.editorOrigin !== editor
        || claims.returnUrl !== 'https://app.xeroflow.io/studio/dashboard'
        || (claims.environment === 'production' && !activation.productionEditorEnabled)) throw createError({ statusCode: 403 })
      if (claims.environment === 'production') customerDestinationGuard(env)?.(claims.workspaceId)
    }
    configuration()
    await run(async (db) => {
      await assertCustomerEditorSessionAuthority(claims, capability, db)
    })
    configuration()
    return reply({ authorized: true, sessionId: claims.nonce, capability })
  } catch (error) {
    const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
    return reply(CUSTOMER_EDITOR_AUTHORITY_ERROR, [400, 401, 403, 409].includes(status) ? status : 503)
  }
}
