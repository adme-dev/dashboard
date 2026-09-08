export interface PageStudioProvisionerBinding {
  createProvisioning: (job: unknown) => Promise<unknown>
}

export class PageStudioProvisioningError extends Error {
  constructor(readonly code: 'PROVISIONER_UNAVAILABLE' | 'PROVISIONER_FAILED', message: string, readonly statusCode = 503) {
    super(message)
    this.name = 'PageStudioProvisioningError'
  }
}

export async function dispatchPageStudioProvisioning(
  binding: PageStudioProvisionerBinding | undefined,
  input: { requestKey: string, scope: { businessId: string, clientId: string, environment: 'preview' | 'staging' | 'production', siteId: string, tenantId: string }, templateId: string, now: string, plan: Record<string, unknown> }
) {
  if (!binding) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Page Studio provisioning service is not configured')
  const id = input.requestKey.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 128)
  try {
    return await binding.createProvisioning({
      id,
      requestKey: input.requestKey,
      phase: 'requested',
      attempts: 0,
      error: null,
      resources: { contentBinding: null, database: null, site: null },
      scope: input.scope,
      templateId: input.templateId,
      updatedAt: input.now
    })
  } catch (error) {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', error instanceof Error ? error.message : 'Provisioning request failed')
  }
}
