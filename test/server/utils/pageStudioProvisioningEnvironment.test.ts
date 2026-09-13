import { describe, expect, it, vi } from 'vitest'
import { getPageStudioProvisioningRuntime, requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

describe('server-owned provisioning environment', () => {
  const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn() }

  it.each(['staging', 'production'] as const)('selects the configured %s environment', (environment) => {
    expect(requirePageStudioProvisioningRuntime({ PAGE_STUDIO_PROVISIONING_ENVIRONMENT: environment, PAGE_STUDIO_PROVISIONER: binding }))
      .toEqual({ environment, binding })
  })

  it.each([undefined, 'preview', 'main', '', 'Production'])('does not infer staging from an absent or invalid setting (%s)', (environment) => {
    const env = { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: environment, PAGE_STUDIO_PROVISIONER: binding }
    expect(getPageStudioProvisioningRuntime(env)).toBeNull()
    expect(() => requirePageStudioProvisioningRuntime(env)).toThrow(expect.objectContaining({ code: 'PROVISIONER_UNAVAILABLE', statusCode: 503 }))
  })

  it.each([undefined, {}, { createProvisioning: vi.fn() }, { createProvisioning: true, readProvisioning: vi.fn() }])('requires both private coordinator methods', (incompleteBinding) => {
    expect(getPageStudioProvisioningRuntime({ PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONER: incompleteBinding })).toBeNull()
  })
})
