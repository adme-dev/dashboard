import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/338_google_ads_mcp_action_control.sql', import.meta.url),
  'utf8'
)

describe('Google Ads MCP action-control migration', () => {
  it('creates tenant-scoped plans, append-only events, and versioned policies', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_ads_action_plans')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_ads_action_events')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS google_ads_automation_policies')
    expect(migration).toContain('UNIQUE (client_id, idempotency_key)')
    expect(migration).toContain('FOREIGN KEY (client_id, connection_id)')
    expect(migration).toContain('REFERENCES social_connections (client_id, id)')
    expect(migration).toContain('REFERENCES team_members(id)')
  })

  it('protects immutable plans and append-only audit events in the database', () => {
    expect(migration).toContain('protect_google_ads_action_plan_content')
    expect(migration).toContain('protect_google_ads_automation_policy_content')
    expect(migration).toContain('prevent_google_ads_action_event_mutation')
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON google_ads_action_events/)
  })

  it('links the existing approval queue to a Google Ads action plan', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS google_ads_action_plan_id UUID')
    expect(migration).toContain('REFERENCES google_ads_action_plans(id)')
  })
})
