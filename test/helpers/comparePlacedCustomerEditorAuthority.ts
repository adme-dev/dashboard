import { expect } from 'vitest'
import { assertCustomerEditorSessionAuthority } from '../../server/utils/pageStudio/customerEditorSessionAuthority'
import { handleCustomerEditorAuthorityFetch } from '../../workers/page-studio-management/src/customerEditorAuthority'
import { CUSTOMER_EDITOR_AUTHORITY_URL } from '../../shared/pageStudio/customerEditorAuthorityTransport'
import { destinationActivation } from './pageStudioDestinationActivation'
import type { RunPageStudioTransaction } from '../../shared/pageStudio/controlTypes'

/** Exercise the same real PG proof through both entry paths, including denials. */
export async function comparePlacedCustomerEditorAuthority(claims: unknown, capability: string, workspaceId: string, editorOrigin: string, run: RunPageStudioTransaction) {
  const direct = await Promise.allSettled([run(db => assertCustomerEditorSessionAuthority(claims, capability, db))])
  let transactions = 0
  const response = await placedCustomerEditorAuthority(claims, capability, workspaceId, editorOrigin, async (work) => {
    transactions++
    return run(work)
  })
  const result = direct[0]!
  if (result.status === 'fulfilled') {
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authorized: true, sessionId: result.value.claims.nonce, capability })
    expect(transactions).toBe(1)
    return result.value
  }
  expect([400, 401, 403, 409]).toContain(response.status)
  throw result.reason
}

export async function placedCustomerEditorAuthority(claims: unknown, capability: string, workspaceId: string, editorOrigin: string, run: RunPageStudioTransaction) {
  const activation = JSON.parse(destinationActivation(workspaceId).PAGE_STUDIO_CUSTOMER_ACTIVATION)
  activation.productionEditorOrigin = editorOrigin
  const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_ACTIVATION: JSON.stringify(activation), PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: editorOrigin, PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: { createProvisioning() {}, readProvisioning() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: { get() {} } }
  return handleCustomerEditorAuthorityFetch(new Request(CUSTOMER_EDITOR_AUTHORITY_URL, { method: 'POST', body: JSON.stringify({ expectedControlPlaneEnvironment: 'production', claims, capability }) }), env, run)
}
