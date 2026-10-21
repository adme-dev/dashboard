import { createError } from 'h3'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { CUSTOMER_EDITOR_AUTHORITY_URL, CUSTOMER_EDITOR_AUTHORITY_ERROR, CUSTOMER_EDITOR_CHECKPOINT_URL } from '~~/shared/pageStudio/customerEditorAuthorityTransport'
import { PageStudioCheckpointSchema } from './controlSchemas'
import { placedAuthorityFetch } from './placedAuthorityFetch'
import type { CustomerEditorClaims, CustomerEditorCapability } from './customerEditorToken'

export async function authorizePlacedCustomerEditor(claims: CustomerEditorClaims, capability: CustomerEditorCapability, binding: unknown) {
  const { request, value } = await placedAuthorityFetch(binding, CUSTOMER_EDITOR_AUTHORITY_URL, { expectedControlPlaneEnvironment: 'production', claims, capability }, CUSTOMER_EDITOR_AUTHORITY_ERROR)
  if (collectionCanonical(value) !== collectionCanonical({ authorized: true, sessionId: request.claims.nonce, capability: request.capability })) throw createError({ statusCode: 503, statusMessage: CUSTOMER_EDITOR_AUTHORITY_ERROR })
}

const checkpoint = PageStudioCheckpointSchema.pick({ checkpointId: true, digest: true, objectKey: true }).nullable()
/** Native metadata only; one placed attempt, with no local fallback. */
export async function readPlacedCustomerEditorCheckpoint(claims: CustomerEditorClaims, binding: unknown) {
  const { value } = await placedAuthorityFetch(binding, CUSTOMER_EDITOR_CHECKPOINT_URL, { expectedControlPlaneEnvironment: 'production', claims, capability: 'workspace:reconnect' }, CUSTOMER_EDITOR_AUTHORITY_ERROR)
  const result = checkpoint.safeParse(value)
  if (!result.success) throw createError({ statusCode: 503, statusMessage: CUSTOMER_EDITOR_AUTHORITY_ERROR })
  return result.data
}
