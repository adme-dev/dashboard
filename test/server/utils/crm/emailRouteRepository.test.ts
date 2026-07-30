import { describe, expect, it, vi } from 'vitest'
import { createCrmEmailReplyToken } from '~~/server/utils/crm/emailReplyToken'
import { resolveCrmInboundEmailRoute } from '~~/server/utils/crm/emailRouteRepository'

const SECRET = 'route-secret-that-is-at-least-thirty-two-bytes'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222'
const ROUTE_ID = '33333333-3333-4333-8333-333333333333'

async function validToken(domain = 'reply.xeroflow.io') {
  return createCrmEmailReplyToken({
    version: 2,
    domain,
    secret: SECRET
  })
}

describe('CRM inbound email route resolution', () => {
  it('verifies the signed token before resolving every tenant-owned route dimension', async () => {
    const created = await validToken()
    const queryOne = vi.fn().mockResolvedValue({
      id: ROUTE_ID,
      client_id: CLIENT_ID,
      conversation_id: CONVERSATION_ID,
      route_kind: 'conversation_reply',
      token_version: 2,
      recipient_domain: 'reply.xeroflow.io'
    })

    await expect(resolveCrmInboundEmailRoute({
      routeKind: 'conversation_reply',
      routeToken: created.token,
      recipientDomain: 'REPLY.XEROFLOW.IO.',
      secrets: { 2: SECRET }
    }, { queryOne })).resolves.toEqual({
      id: ROUTE_ID,
      clientId: CLIENT_ID,
      conversationId: CONVERSATION_ID,
      routeKind: 'conversation_reply',
      tokenVersion: 2,
      recipientDomain: 'reply.xeroflow.io',
      routeTokenHash: created.routeTokenHash
    })

    expect(queryOne).toHaveBeenCalledOnce()
    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('FROM crm_email_routes')
    expect(sql).toContain('route_token_hash = $1')
    expect(sql).toContain('token_version = $2')
    expect(sql).toContain('recipient_domain = $3')
    expect(sql).toContain('route_kind = $4')
    expect(sql).toContain('is_active = TRUE')
    expect(sql).toContain('revoked_at IS NULL')
    expect(sql).toContain('expires_at > NOW()')
    expect(params).toEqual([
      created.routeTokenHash,
      2,
      'reply.xeroflow.io',
      'conversation_reply'
    ])
  })

  it('does not query Postgres for an invalid or wrong-domain token', async () => {
    const created = await validToken('reply.xeroflow.io')
    const queryOne = vi.fn()

    await expect(resolveCrmInboundEmailRoute({
      routeKind: 'conversation_reply',
      routeToken: created.token,
      recipientDomain: 'mail.xeroflow.io',
      secrets: { 2: SECRET }
    }, { queryOne })).resolves.toBeNull()

    expect(queryOne).not.toHaveBeenCalled()
  })

  it('returns null when no active, unrevoked, unexpired route matches', async () => {
    const created = await validToken()
    const queryOne = vi.fn().mockResolvedValue(null)

    await expect(resolveCrmInboundEmailRoute({
      routeKind: 'conversation_reply',
      routeToken: created.token,
      recipientDomain: 'reply.xeroflow.io',
      secrets: { 2: SECRET }
    }, { queryOne })).resolves.toBeNull()
  })
})
