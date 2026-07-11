import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync('server/api/agency/monday/webhooks/register.post.ts', 'utf8')
const client = readFileSync('server/utils/mondayClient.ts', 'utf8')

describe('Monday webhook registration contract', () => {
  it('requires HR authorization, approved scope, and an OAuth app token', () => {
    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain('getActiveMondayEvidenceScope()')
    expect(route).toContain("connection.authMethod !== 'oauth'")
  })
  it('registers operational item, subitem, and update events idempotently', () => {
    expect(route).toContain("'create_item'")
    expect(route).toContain("'change_column_value'")
    expect(route).toContain("'create_subitem_update'")
    expect(route).toContain('existingEvents.has(webhookEvent)')
    expect(route).toContain('failed.push')
    expect(route).toContain('results.every(board => board.failed.length === 0)')
    expect(route).toContain('/api/webhooks/monday')
  })
  it('uses a currently supported API version and app-only webhook discovery', () => {
    expect(client).toContain("'API-Version': '2025-04'")
    expect(client).toContain('app_webhooks_only: true')
    expect(client).toContain('create_webhook')
  })
})
