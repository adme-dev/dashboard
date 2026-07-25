import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('CRM communications, receptionist and MCP rollout contracts', () => {
  it('stores secret references and token hashes, never raw credentials', () => {
    const migration = source('server/database/migrations/302_crm_communications_receptionist_mcp_control_plane.sql')
    expect(migration).toContain('credential_ref')
    expect(migration).toContain('token_hash')
    expect(migration).not.toContain('access_token TEXT')
    expect(migration).not.toContain('api_key TEXT')
    expect(migration).toContain('trg_receptionist_policy_events_append_only')
    expect(migration).toContain('trg_external_mcp_audit_append_only')
    expect(migration).toContain('FOREIGN KEY (client_id, voice_route_id)')
    expect(migration).toContain('FOREIGN KEY (client_id, mcp_client_id)')
  })

  it('requires independent flags, entitlements and readiness gates', () => {
    const readiness = source('server/utils/crm/platformRolloutReadiness.ts')
    expect(readiness).toContain("AI_PHONE_RECEPTIONIST_ENABLED === 'true'")
    expect(readiness).toContain("EXTERNAL_CLIENT_MCP_ENABLED === 'true'")
    expect(readiness).toContain("'communications.sms'")
    expect(readiness).toContain("'communications.voice'")
    expect(readiness).toContain("'ai.receptionist'")
    expect(readiness).toContain("'mcp.crm'")
    expect(readiness).toContain("evaluation_status === 'passed'")
  })

  it('keeps portal readiness bound to the client session and full CRM mode', () => {
    const endpoint = source('server/api/portal/crm/platform-readiness.get.ts')
    expect(endpoint).toContain('requireClientAuth(event)')
    expect(endpoint).toContain("client.leadCaptureMode !== 'full_crm'")
    expect(endpoint).toContain('client.clientId')
  })
})
