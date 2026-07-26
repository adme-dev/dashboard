import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('billing operations control plane', () => {
  it('audits subscription and override changes append-only', () => {
    const migration = source('server/database/migrations/306_billing_operations_control_plane.sql')
    expect(migration).toContain('billing_subscription_audit')
    expect(migration).toContain('trg_billing_subscription_audit_append_only')
    expect(migration).toContain('trg_client_subscriptions_audit')
    expect(migration).toContain('trg_client_entitlement_overrides_audit')
  })

  it('keeps agency mutation owner/admin scoped and route-client scoped', () => {
    const endpoint = source('server/api/agency/billing/clients/[id].put.ts')
    expect(endpoint).toContain("requireRole(event, ['owner', 'admin'])")
    expect(endpoint).toContain("getRouterParam(event, 'id')")
    expect(endpoint).toContain('updateClientBilling(clientId, user.id')
  })

  it('keeps portal billing tenant-session scoped', () => {
    const endpoint = source('server/api/portal/billing.get.ts')
    const operations = source('server/utils/billing/operations.ts')
    expect(endpoint).toContain('requireClientAuth(event)')
    expect(endpoint).toContain('getClientBillingOverview(client.clientId)')
    expect(endpoint).not.toContain('getQuery(event)')
    expect(operations).toContain('includeAdmin ? subscription.external_subscription_ref : undefined')
  })

  it('surfaces billing controls to agency and portal users', () => {
    const agency = source('app/pages/agency/operations/billing.vue')
    const portal = source('app/components/crm/BillingAndUsage.vue')
    expect(agency).toContain('/api/agency/billing/clients/')
    expect(portal).toContain('/api/portal/billing')
  })

  it('preserves billing periods and enforces explicit zero limits', () => {
    const operations = source('server/utils/billing/operations.ts')
    const usage = source('server/utils/billing/usage.ts')
    expect(operations).toContain('COALESCE($4::timestamptz, current_period_starts_at)')
    expect(operations).toContain('COALESCE($5::timestamptz, current_period_ends_at)')
    expect(usage).toContain('limit?.hardLimit == null')
  })
})
