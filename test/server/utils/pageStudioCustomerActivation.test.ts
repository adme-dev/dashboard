import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCustomerActivation } from '~~/server/utils/pageStudio/customerActivation'

const key = 'PAGE_STUDIO_CUSTOMER_ACTIVATION'
const scalarKeys = ['PREVIEW_ENABLED', 'PREVIEW_APPROVALS', 'CMS_SETUP_ENABLED', 'BROWSER_ENABLED', 'EDITOR_ENABLED']
  .map(name => `PAGE_STUDIO_CUSTOMER_${name}`)
const enabled = { previewEnabled: true, previewApprovals: [], cmsSetupEnabled: true, browserEnabled: true, editorEnabled: true }
const closed = { previewEnabled: false, previewApprovals: [], cmsSetupEnabled: false, browserEnabled: false, editorEnabled: false }
const approval = { workspaceId: '11111111-1111-4111-8111-111111111111', starterVersion: 'floristry-v1',
  policy: { approvalId: '22222222-2222-4222-8222-222222222222', approvedBy: '33333333-3333-4333-8333-333333333333',
    expiresAt: '2027-01-01T00:00:00.000Z', pagesPerSiteLimit: 3, storageBytesLimit: 1000, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 1000 } }
const bundle = (value: unknown) => ({ [key]: JSON.stringify(value) })
beforeEach(() => {
  for (const name of [key, ...scalarKeys]) vi.stubEnv(name, undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('atomic customer activation configuration', () => {
  it('defaults off and retains explicit legacy local settings', () => {
    expect(readCustomerActivation({})).toEqual(closed)
    for (const name of scalarKeys) vi.stubEnv(name, name.endsWith('APPROVALS') ? '[]' : 'true')
    expect(readCustomerActivation({})).toEqual(enabled)
    expect(readCustomerActivation({ PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: false }).editorEnabled).toBe(false)
  })
  it('keeps malformed legacy approvals isolated to preview, preserving the existing scalar path', () => {
    expect(readCustomerActivation({ PAGE_STUDIO_CUSTOMER_PREVIEW_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: 'true',
      PAGE_STUDIO_CUSTOMER_PREVIEW_APPROVALS: '{}' })).toEqual({ ...closed, editorEnabled: true })
  })
  it('accepts complete bundles and existing strict approvals', () => {
    expect(readCustomerActivation(bundle({ ...enabled, previewApprovals: [approval] }))).toEqual({ ...enabled, previewApprovals: [approval] })
  })
  it.each(['previewEnabled', 'cmsSetupEnabled', 'browserEnabled', 'editorEnabled'])('keeps %s independent', (field) => {
    expect(readCustomerActivation(bundle({ ...enabled, [field]: false }))).toEqual({ ...enabled, [field]: false })
  })
  it.each([undefined, null, '', '{', 'null', '[]', 'true', '{}', 1, enabled])('closes all gates on malformed raw binding %j', (raw) => {
    vi.stubEnv(key, JSON.stringify(enabled))
    for (const name of scalarKeys) vi.stubEnv(name, name.endsWith('APPROVALS') ? '[]' : 'true')
    expect(readCustomerActivation({ [key]: raw })).toEqual(closed)
  })
  it.each(Object.keys(enabled))('requires field %s without process recovery', (field) => {
    const partial = Object.fromEntries(Object.entries(enabled).filter(([name]) => name !== field))
    for (const name of scalarKeys) vi.stubEnv(name, name.endsWith('APPROVALS') ? '[]' : 'true')
    expect(readCustomerActivation(bundle(partial))).toEqual(closed)
  })
  it.each(['true', 1, null, [], {}])('rejects coerced flag types %j', (value) => {
    for (const field of ['previewEnabled', 'cmsSetupEnabled', 'browserEnabled', 'editorEnabled']) {
      expect(readCustomerActivation(bundle({ ...enabled, [field]: value }))).toEqual(closed)
    }
  })
  it.each([
    { ...enabled, extra: true }, { ...enabled, previewApprovals: '{}' },
    { ...enabled, previewApprovals: [{ ...approval, extra: true }] },
    { ...enabled, previewApprovals: [{ ...approval, workspaceId: 'foreign' }] },
    { ...enabled, previewApprovals: [{ ...approval, policy: { ...approval.policy, pagesPerSiteLimit: 2 } }] },
    { ...enabled, previewApprovals: [approval, approval] },
    { ...enabled, previewApprovals: Array.from({ length: 101 }, (_, i) => ({ ...approval, workspaceId: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}` })) }
  ])('invalidates every gate on unknown fields or invalid approval policy %#', (value) => {
    expect(readCustomerActivation(bundle(value))).toEqual(closed)
  })
  it.each(scalarKeys)('rejects co-configured scalar %s even when matching', (name) => {
    expect(readCustomerActivation({ ...bundle(enabled), [name]: name.endsWith('APPROVALS') ? '[]' : 'true' })).toEqual(closed)
    expect(readCustomerActivation({ ...bundle(enabled), [name]: undefined })).toEqual(closed)
  })
  it('uses the complete Cloudflare bundle without process overrides or conflicts', () => {
    vi.stubEnv(key, JSON.stringify(enabled))
    for (const name of scalarKeys) vi.stubEnv(name, 'true')
    expect(readCustomerActivation(bundle(closed))).toEqual(closed)
    expect(readCustomerActivation(bundle(enabled))).toEqual(enabled)
  })
  it('supports a local bundle but cannot override explicitly configured Cloudflare scalars', () => {
    vi.stubEnv(key, JSON.stringify(enabled))
    expect(readCustomerActivation({})).toEqual(enabled)
    expect(readCustomerActivation({ PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: 'false' })).toEqual(closed)
  })
})
