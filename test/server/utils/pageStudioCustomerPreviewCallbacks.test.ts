import { describe, expect, it, vi } from 'vitest'
import { customerProvisioningCallbackRuntime, customerSchemaCallbackEnvironment } from '~~/server/utils/pageStudio/customerPreviewCallbacks'
import { collectionUpgradeContract } from '~~/server/utils/pageStudio/schemaUpgradeContract'
import { nativePreviewBindings } from '../../utils/pageStudioNativePreview'

const id = '10000000-0000-4000-8000-000000000001'
const scope = { siteId: id, clientId: id, businessId: id, tenantId: `studio-customer-${id}`, environment: 'staging' }
const request = { requestKey: `page-studio-${id}-1`, scope }
describe('private native preview callback selection', () => {
  it('does not accept actor, provider, environment or malformed scope overrides', () => {
    const env = { ...nativePreviewBindings(), PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
    for (const body of [{ ...request, actor: { kind: 'customer-user' } }, { ...request, environment: 'staging' },
      { ...request, provider: 'native-preview' }, { ...request, scope: { ...scope, businessId: crypto.randomUUID() } }]) {
      expect(() => customerProvisioningCallbackRuntime(env, body)).toThrow()
    }
    expect(() => customerSchemaCallbackEnvironment(env, { actor: { kind: 'customer-user' }, scope }, collectionUpgradeContract)).toThrow()
  })
  it('preserves shared staging and production callback bindings without reading source', () => {
    const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn() }
    expect(customerProvisioningCallbackRuntime({ PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: binding }, request).binding).toBe(binding)
    expect(customerProvisioningCallbackRuntime({ ...nativePreviewBindings(), PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONER: binding },
      { ...request, scope: { ...scope, environment: 'production' } }).binding).toBe(binding)
    expect(binding.readProvisioning).not.toHaveBeenCalled()
  })
  it('fails closed before reading any shared service when dedicated configuration is absent or partial', () => {
    const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn() }
    for (const configuration of [{}, { ...nativePreviewBindings(), PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: undefined }]) {
      expect(() => customerProvisioningCallbackRuntime({ ...configuration, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONER: binding }, request)).toThrow()
    }
    expect(binding.readProvisioning).not.toHaveBeenCalled()
  })
})
