import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const endpoint = readFileSync(
  resolve(root, 'server/api/agency/analytics/personas/provider-settings.put.ts'),
  'utf8',
)
const migration = readFileSync(
  resolve(root, 'server/database/migrations/303_persona_audience_configuration_audit.sql'),
  'utf8',
)
const controls = readFileSync(
  resolve(root, 'app/components/analytics/PersonaProviderConfiguration.vue'),
  'utf8',
)

describe('persona audience configuration contract', () => {
  it('requires persona admin access and a strict audited payload', () => {
    expect(endpoint).toContain('requirePersonaAdminAccess(event)')
    expect(endpoint).toContain('z.strictObject')
    expect(endpoint).toContain("reason: z.string().trim().min(3).max(1000)")
  })

  it('persists entitlement, provider settings and audit atomically', () => {
    expect(endpoint).toContain('WITH entitlement AS')
    expect(endpoint).toContain('provider_setting AS')
    expect(endpoint).toContain('configuration_audit AS')
    expect(endpoint).toContain('client_feature_entitlements')
    expect(endpoint).toContain('crm_persona_audience_provider_settings')
    expect(endpoint).toContain('crm_persona_audience_configuration_audit')
  })

  it('does not grant client authorization or accept provider credentials', () => {
    expect(endpoint).toContain('clientAuthorizationRequired: true')
    expect(endpoint).not.toContain('crm_persona_audience_provider_authorizations')
    expect(endpoint).not.toContain('access_token')
    expect(endpoint).not.toContain('refresh_token')
  })

  it('makes configuration history append-only', () => {
    expect(migration).toContain('BEFORE UPDATE OR DELETE')
    expect(migration).toContain('is append-only')
  })

  it('surfaces agency controls and the separate client-consent gate', () => {
    expect(controls).toContain('Audience activation controls')
    expect(controls).toContain('Client authorization remains a separate portal action')
    expect(controls).toContain("method: 'PUT'")
  })
})
