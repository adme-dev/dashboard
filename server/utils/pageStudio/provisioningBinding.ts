import { z } from 'zod'

export interface PageStudioProvisioningScope {
  businessId: string
  clientId: string
  environment: 'preview' | 'staging' | 'production'
  siteId: string
  tenantId: string
}

export interface PageStudioProvisionerBinding {
  createProvisioning: (job: unknown) => Promise<unknown>
  readProvisioning?: (requestKey: string, scope: PageStudioProvisioningScope) => Promise<unknown>
}

export class PageStudioProvisioningError extends Error {
  constructor(readonly code: 'PROVISIONER_UNAVAILABLE' | 'PROVISIONER_FAILED' | 'INVALID_PROVISIONING_PLAN', message: string, readonly statusCode = 503) {
    super(message)
    this.name = 'PageStudioProvisioningError'
  }
}

const SavedPlan = z.object({
  starterVersion: z.enum(['limousine-v1', 'floristry-v1', 'retail-v1', 'it-goods-v1', 'import-export-v1']),
  modules: z.array(z.enum(['business-content', 'bookings', 'catalogue', 'delivery', 'email', 'enquiries', 'inventory', 'orders'])).max(12),
  pages: z.array(z.string().min(1).max(100)).min(1).max(32),
  collections: z.array(z.string().min(1).max(100)).min(1).max(32)
})

/** Translate the retained, reviewed Dashboard proposal into the Worker contract.
 * Scope always comes from the authenticated site lookup, not proposal metadata.
 */
export function normalizePageStudioProvisioningPlan(input: unknown, scope: PageStudioProvisioningScope) {
  const parsed = SavedPlan.safeParse(input)
  if (!parsed.success) {
    throw new PageStudioProvisioningError('INVALID_PROVISIONING_PLAN', 'The accepted setup plan has an unsupported template or invalid modules, pages or collections', 422)
  }
  return {
    templateId: parsed.data.starterVersion,
    enabledModules: parsed.data.modules,
    pages: parsed.data.pages,
    collections: parsed.data.collections,
    scope
  }
}

export async function dispatchPageStudioProvisioning(
  binding: PageStudioProvisionerBinding | undefined,
  input: { requestKey: string, scope: PageStudioProvisioningScope, now: string, plan: Record<string, unknown> }
) {
  if (!binding) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Page Studio provisioning service is not configured')
  const plan = normalizePageStudioProvisioningPlan(input.plan, input.scope)
  const id = input.requestKey.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 128)
  try {
    const result = await binding.createProvisioning({
      id,
      requestKey: input.requestKey,
      phase: 'requested',
      attempts: 0,
      error: null,
      plan,
      resources: { contentBinding: null, database: null, site: null },
      scope: input.scope,
      templateId: plan.templateId,
      updatedAt: input.now
    }) as { requestKey?: unknown, scope?: Record<string, unknown> }
    const scope = result?.scope
    if (result?.requestKey !== input.requestKey
      || !scope
      || scope.businessId !== input.scope.businessId
      || scope.clientId !== input.scope.clientId
      || scope.environment !== input.scope.environment
      || scope.siteId !== input.scope.siteId
      || scope.tenantId !== input.scope.tenantId) {
      throw new Error('Provisioning service returned a mismatched scope')
    }
    return result
  } catch (error) {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', error instanceof Error ? error.message : 'Provisioning request failed')
  }
}

export async function readPageStudioProvisioning(
  binding: PageStudioProvisionerBinding | undefined,
  input: { requestKey: string, scope: PageStudioProvisioningScope }
) {
  if (!binding?.readProvisioning) return null
  try {
    const result = await binding.readProvisioning(input.requestKey, input.scope) as { requestKey?: unknown, scope?: Record<string, unknown> } | null
    if (result === null) return null
    const scope = result?.scope
    if (result?.requestKey !== input.requestKey
      || !scope
      || scope.businessId !== input.scope.businessId
      || scope.clientId !== input.scope.clientId
      || scope.environment !== input.scope.environment
      || scope.siteId !== input.scope.siteId
      || scope.tenantId !== input.scope.tenantId) {
      throw new Error('Provisioning service returned a mismatched scope')
    }
    return result
  } catch (error) {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', error instanceof Error ? error.message : 'Provisioning status request failed')
  }
}
