import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const endpoint = readFileSync(
  resolve(root, 'server/api/portal/analytics/audiences/identity-health.get.ts'),
  'utf8',
)
const component = readFileSync(
  resolve(root, 'app/components/analytics/IdentityHealthPanel.vue'),
  'utf8',
)

describe('portal persona identity health contract', () => {
  it('uses tenant-scoped client authentication and the governed reconciliation service', () => {
    expect(endpoint).toContain('requireClientAuth(event)')
    expect(endpoint).toContain('client.clientId')
    expect(endpoint).toContain('getIdentityReconciliationSnapshot(client.clientId)')
  })

  it('exposes aggregate health without profile IDs or case evidence', () => {
    expect(endpoint).toContain('leadLinkageRate')
    expect(endpoint).toContain('consentLinkageRate')
    expect(endpoint).not.toContain('primaryProfileId:')
    expect(endpoint).not.toContain('secondaryProfileId:')
    expect(endpoint).not.toContain('evidence:')
  })

  it('keeps merge and split controls agency-only', () => {
    expect(endpoint).toContain('clientMergeAccess: false')
    expect(component).toContain('profile merges remain agency-controlled')
    expect(component).not.toContain("method: 'POST'")
    expect(component).not.toContain("method: 'PATCH'")
  })

  it('surfaces linkage rates, reconciliation issues and safeguards', () => {
    expect(component).toContain('Identity resolution health')
    expect(component).toContain('Reconciliation attention')
    expect(component).toContain('Two-person approval')
    expect(component).toContain('Rollback')
  })
})
