import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const service = readFileSync(resolve(root, 'server/utils/persona/exportOperations.ts'), 'utf8')
const agencyEndpoint = readFileSync(
  resolve(root, 'server/api/agency/analytics/personas/operations.get.ts'),
  'utf8',
)
const portalEndpoint = readFileSync(
  resolve(root, 'server/api/portal/analytics/audiences/operations.get.ts'),
  'utf8',
)
const portalComponent = readFileSync(
  resolve(root, 'app/components/analytics/AudienceExportOperations.vue'),
  'utf8',
)

describe('persona audience export operations contract', () => {
  it('defines explicit queue, execution and provider acknowledgement SLOs', () => {
    expect(service).toContain("INTERVAL '5 minutes'")
    expect(service).toContain("INTERVAL '15 minutes'")
    expect(service).toContain("INTERVAL '24 hours'")
    expect(service).toContain('PERCENTILE_CONT(0.95)')
  })

  it('reports queue state, failures and privacy-safe membership counts', () => {
    expect(service).toContain('crm_persona_audience_exports')
    expect(service).toContain('attempted_additions')
    expect(service).toContain('successful_removals')
    expect(service).not.toContain('email_hash')
    expect(service).not.toContain('phone_hash')
  })

  it('keeps agency and portal access tenant-scoped', () => {
    expect(agencyEndpoint).toContain('requirePersonaReadAccess(event)')
    expect(portalEndpoint).toContain('requireClientAuth(event)')
    expect(portalEndpoint).toContain('client.clientId')
  })

  it('redacts internal export identifiers and error messages from clients', () => {
    expect(portalEndpoint).not.toContain('id: item.id')
    expect(portalEndpoint).not.toContain('requestId: item.requestId')
    expect(portalEndpoint).not.toContain('errorMessage: item.errorMessage')
  })

  it('surfaces SLO health and delivery history in the portal', () => {
    expect(portalComponent).toContain('Audience delivery operations')
    expect(portalComponent).toContain('30-day success rate')
    expect(portalComponent).toContain('Stale operations')
    expect(portalComponent).toContain('Recent delivery activity')
  })
})
