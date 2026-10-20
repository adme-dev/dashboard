import { describe, expect, it } from 'vitest'
import { readCustomerActivation } from '~~/server/utils/pageStudio/customerActivation'
import { customerPreviewRuntimeEnvironment } from '~~/server/utils/pageStudio/customerPreviewRuntime'

const base = () => ({ PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production',
  PAGE_STUDIO_PROVISIONER: { createProvisioning() {}, readProvisioning() {} },
  PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget() {} }, PAGE_STUDIO_CHECKPOINTS: { get() {} } })
export const preview = () => ({ PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
  PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: { createProvisioning() {}, readProvisioning() {} },
  PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget() {} },
  PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: { get() {} },
  PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio-customer-preview.xeroflow.io' })
describe('fixed native source runtime selection', () => {
  it('is default-off in production and never falls back to ordinary bindings', () => {
    expect(customerPreviewRuntimeEnvironment(base())).toBeNull()
    expect(customerPreviewRuntimeEnvironment({ ...base(), ...preview(), PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' })).toBeNull()
  })
  it.each(Object.keys(preview()))('fails closed with missing %s', (key) => {
    const env: Record<string, unknown> = { ...base(), ...preview() }
    Reflect.deleteProperty(env, key)
    expect(customerPreviewRuntimeEnvironment(env)).toBeNull()
  })
  it('selects isolated source while retaining production control-plane configuration', () => {
    const env = { ...base(), ...preview(), PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }
    const result = customerPreviewRuntimeEnvironment(env)!
    expect(result.PAGE_STUDIO_PROVISIONER).toBe(env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER)
    expect(result.PAGE_STUDIO_CONTENT_ROUTER).toBe(env.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER)
    expect(result.PAGE_STUDIO_CHECKPOINTS).toBe(env.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS)
    expect(result.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN).toBe(env.PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN)
    expect(result.PAGE_STUDIO_CONTENT_ENVIRONMENT).toBe('staging')
    expect(result.PAGE_STUDIO_RELEASE_ENVIRONMENT).toBe('production')
  })
  it('preserves old staging only when dedicated configuration is entirely absent', () => {
    const env = { ...base(), PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' }
    expect(customerPreviewRuntimeEnvironment(env)).toEqual(env)
    expect(customerPreviewRuntimeEnvironment({ ...env, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' })).toBeNull()
  })
  it.each(['https://evil.test/path', 'http://studio-customer-preview.xeroflow.io', 'https://studio-customer-preview.xeroflow.io/?x=1'])('rejects malformed origin %s', (origin) => {
    expect(customerPreviewRuntimeEnvironment({ ...base(), ...preview(), PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: origin })).toBeNull()
  })
})

it('projects only strictly validated source activation and never masks a duplicate production origin', () => {
  const activation = { previewEnabled: true, previewApprovals: [], cmsSetupEnabled: true, browserEnabled: true, editorEnabled: true,
    productionEditorEnabled: true, productionEditorOrigin: 'https://studio.xeroflow.io' }
  const env = { ...base(), ...preview(), PAGE_STUDIO_CUSTOMER_ACTIVATION: JSON.stringify(activation) }
  const projected = customerPreviewRuntimeEnvironment(env)!
  expect(readCustomerActivation(projected)).toEqual({ previewEnabled: true, previewApprovals: [], cmsSetupEnabled: true, browserEnabled: true, editorEnabled: true })
  expect(projected.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN).toBe(env.PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN)
  expect(JSON.parse(env.PAGE_STUDIO_CUSTOMER_ACTIVATION)).toEqual(activation)
  const conflict = customerPreviewRuntimeEnvironment({ ...env, PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN: activation.productionEditorOrigin })!
  expect(readCustomerActivation(conflict)).toMatchObject({ editorEnabled: false, previewEnabled: false })
})
