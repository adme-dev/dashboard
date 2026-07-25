import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('billing, entitlement and usage contracts', () => {
  it('installs plans, subscriptions, overrides and immutable usage', () => {
    const migration = source('server/database/migrations/301_billing_plan_entitlements_usage.sql')
    expect(migration).toContain('billing_plans')
    expect(migration).toContain('client_subscriptions')
    expect(migration).toContain('client_entitlement_overrides')
    expect(migration).toContain('billing_usage_events')
    expect(migration).toContain('trg_billing_usage_events_append_only')
    expect(migration).toContain('billing_entitlement_audit')
    expect(source('server/utils/billing/usage.ts')).toContain('USAGE_METADATA_KEYS')
  })

  it('resolves override, client and plan sources in fail-closed order', () => {
    const resolver = source('server/utils/billing/entitlements.ts')
    expect(resolver).toContain("'override'::text")
    expect(resolver).toContain("'client'::text")
    expect(resolver).toContain("'plan'::text")
    expect(resolver).toContain("status = row?.status ?? 'missing'")
    expect(resolver).toContain('statusCode: 402')
  })

  it('requires destination entitlements before audience activation', () => {
    const activation = source('server/api/agency/analytics/personas/activations.post.ts')
    expect(activation).toContain("requireClientEntitlement(parsed.data.clientId, 'persona.identity')")
    expect(activation).toContain("'audience.google'")
    expect(activation).toContain("'audience.meta'")
  })

  it('keeps the portal entitlement response tenant-session scoped', () => {
    const endpoint = source('server/api/portal/entitlements.get.ts')
    expect(endpoint).toContain('requireClientAuth(event)')
    expect(endpoint).toContain('client.clientId')
    expect(endpoint).not.toContain('getQuery(event)')
  })
})
