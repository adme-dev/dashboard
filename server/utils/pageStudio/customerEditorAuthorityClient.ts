import { createError } from 'h3'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { CUSTOMER_EDITOR_AUTHORITY_URL, CUSTOMER_EDITOR_AUTHORITY_ERROR } from '~~/shared/pageStudio/customerEditorAuthorityTransport'
import { placedAuthorityFetch } from './placedAuthorityFetch'
import type { CustomerEditorClaims, CustomerEditorCapability } from './customerEditorToken'

export async function authorizePlacedCustomerEditor(claims: CustomerEditorClaims, capability: CustomerEditorCapability, binding: unknown) {
  const { request, value } = await placedAuthorityFetch(binding, CUSTOMER_EDITOR_AUTHORITY_URL, { expectedControlPlaneEnvironment: 'production', claims, capability }, CUSTOMER_EDITOR_AUTHORITY_ERROR)
  if (collectionCanonical(value) !== collectionCanonical({ authorized: true, sessionId: request.claims.nonce, capability: request.capability })) throw createError({ statusCode: 503, statusMessage: CUSTOMER_EDITOR_AUTHORITY_ERROR })
}
