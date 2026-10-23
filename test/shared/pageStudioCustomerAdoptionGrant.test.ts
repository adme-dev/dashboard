import { describe, expect, it } from 'vitest'
import {
  customerSessionCapabilities,
  customerSessionHasPurpose,
  customerSchemaPreparationCapability,
  CUSTOMER_EDITOR_CAPABILITIES,
  CUSTOMER_CMS_SETUP_CAPABILITIES,
  type CustomerEditorClaims
} from '~~/server/utils/pageStudio/customerEditorToken'

const claims = (capabilities: CustomerEditorClaims['capabilities']): CustomerEditorClaims => ({
  role: 'customer',
  environment: 'staging',
  nonce: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  clientId: '00000000-0000-4000-8000-000000000004',
  siteId: '00000000-0000-4000-8000-000000000005',
  tenantId: 'studio-customer-test',
  capabilities,
  issuedAt: 1,
  expiresAt: 901,
  editorOrigin: 'https://studio.example.test',
  returnUrl: 'https://customers.example.test/studio/dashboard'
})
describe('explicit existing-source adoption child purpose', () => {
  it('grants exactly adoption and preserves both legacy purpose sets', () => {
    expect(customerSessionCapabilities('cms-adoption')).toEqual(['cms:adopt'])
    expect(customerSessionCapabilities('editor')).toEqual([...CUSTOMER_EDITOR_CAPABILITIES])
    expect(customerSessionCapabilities('cms-setup')).toEqual([...CUSTOMER_CMS_SETUP_CAPABILITIES])
  })
  it.each(CUSTOMER_EDITOR_CAPABILITIES)('never admits workspace capability %s in adoption purpose', (capability) => {
    expect(customerSessionHasPurpose(['cms:adopt', capability], 'cms-adoption')).toBe(false)
  })
  it('denies schema preparation even with a syntactically valid adoption child', () => {
    expect(() => customerSchemaPreparationCapability(claims(['cms:adopt']))).toThrow()
    expect(customerSchemaPreparationCapability(claims([...CUSTOMER_CMS_SETUP_CAPABILITIES]))).toBe('cms:prepare')
    expect(customerSchemaPreparationCapability(claims([...CUSTOMER_EDITOR_CAPABILITIES]))).toBe('workspace:create')
  })
  it('rejects old setup capability pair and unknown purposes', () => {
    expect(customerSessionHasPurpose(['cms:prepare', 'cms:adopt'], 'cms-adoption')).toBe(false)
    expect(() => customerSessionCapabilities('adoption')).toThrow()
  })
})
