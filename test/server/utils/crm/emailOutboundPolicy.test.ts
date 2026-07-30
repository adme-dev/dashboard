import { describe, expect, it, vi } from 'vitest'
import {
  authorizeCrmEmailOutbound,
  type CrmEmailOutboundPolicyRepository,
  type CrmEmailOutboundPolicyRequest
} from '~~/server/utils/crm/emailOutboundPolicy'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const SENDER_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'

const request: CrmEmailOutboundPolicyRequest = {
  clientId: CLIENT_ID,
  personId: PERSON_ID,
  requestedRecipientAddress: 'Customer@Example.net',
  senderIdentityId: null,
  actor: {
    kind: 'portal_user',
    id: ACTOR_ID,
    canSend: true
  }
}

function repository(
  overrides: Partial<CrmEmailOutboundPolicyRepository> = {}
): CrmEmailOutboundPolicyRepository {
  return {
    findRecipient: vi.fn().mockResolvedValue({
      personId: PERSON_ID,
      emailAddress: 'customer@example.net',
      doNotContact: false,
      doNotEmail: false
    }),
    isSuppressed: vi.fn().mockResolvedValue(false),
    findReadySender: vi.fn().mockResolvedValue({
      senderIdentityId: SENDER_ID,
      emailAddress: 'sales@example.com',
      displayName: 'Sales'
    }),
    consumeRate: vi.fn()
      .mockResolvedValueOnce({
        allowed: true,
        resetAt: '2026-07-30T00:01:00.000Z'
      })
      .mockResolvedValueOnce({
        allowed: true,
        resetAt: '2026-07-31T00:00:00.000Z'
      }),
    ...overrides
  }
}

describe('CRM email outbound policy', () => {
  it('grants an authorised tenant recipient and ready sender', async () => {
    const repo = repository()

    await expect(authorizeCrmEmailOutbound(request, repo)).resolves.toEqual({
      allowed: true,
      code: 'allowed',
      personId: PERSON_ID,
      recipient: {
        address: 'customer@example.net',
        name: null
      },
      sender: {
        senderIdentityId: SENDER_ID,
        address: 'sales@example.com',
        name: 'Sales'
      },
      rateLimitResetAt: '2026-07-31T00:00:00.000Z'
    })

    expect(repo.findRecipient).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      personId: PERSON_ID,
      emailAddress: 'customer@example.net'
    })
    expect(repo.findReadySender).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      senderIdentityId: null
    })
    expect(repo.consumeRate).toHaveBeenCalledTimes(2)
  })

  it('denies a caller without server-derived send permission before repository access', async () => {
    const repo = repository()

    await expect(authorizeCrmEmailOutbound({
      ...request,
      actor: { ...request.actor, canSend: false }
    }, repo)).resolves.toEqual({
      allowed: false,
      code: 'permission_denied'
    })

    expect(repo.findRecipient).not.toHaveBeenCalled()
    expect(repo.consumeRate).not.toHaveBeenCalled()
  })

  it.each([
    ['not-an-email'],
    ['customer@example.net\nBcc: victim@example.org'],
    [''],
    ['a'.repeat(321)]
  ])('returns a controlled recipient denial for malformed address %j', async (address) => {
    const repo = repository()

    await expect(authorizeCrmEmailOutbound({
      ...request,
      requestedRecipientAddress: address
    }, repo)).resolves.toEqual({
      allowed: false,
      code: 'recipient_unavailable'
    })

    expect(repo.findRecipient).not.toHaveBeenCalled()
    expect(repo.consumeRate).not.toHaveBeenCalled()
  })

  it('does not distinguish a missing, deleted, or cross-tenant person', async () => {
    const repo = repository({
      findRecipient: vi.fn().mockResolvedValue(null)
    })

    await expect(authorizeCrmEmailOutbound(request, repo)).resolves.toEqual({
      allowed: false,
      code: 'recipient_unavailable'
    })
    expect(repo.isSuppressed).not.toHaveBeenCalled()
    expect(repo.consumeRate).not.toHaveBeenCalled()
  })

  it.each([
    [{ doNotContact: true, doNotEmail: false }],
    [{ doNotContact: false, doNotEmail: true }]
  ])('blocks contact preferences without consuming rate capacity', async (prefs) => {
    const repo = repository({
      findRecipient: vi.fn().mockResolvedValue({
        personId: PERSON_ID,
        emailAddress: 'customer@example.net',
        ...prefs
      })
    })

    await expect(authorizeCrmEmailOutbound(request, repo)).resolves.toEqual({
      allowed: false,
      code: 'recipient_opted_out'
    })
    expect(repo.isSuppressed).not.toHaveBeenCalled()
    expect(repo.consumeRate).not.toHaveBeenCalled()
  })

  it('blocks any canonical suppression without exposing its reason', async () => {
    const repo = repository({
      isSuppressed: vi.fn().mockResolvedValue(true)
    })

    const result = await authorizeCrmEmailOutbound(request, repo)

    expect(result).toEqual({
      allowed: false,
      code: 'recipient_suppressed'
    })
    expect(JSON.stringify(result)).not.toContain('hard_bounce')
    expect(repo.consumeRate).not.toHaveBeenCalled()
  })

  it('does not distinguish a missing, unready, or cross-tenant sender', async () => {
    const repo = repository({
      findReadySender: vi.fn().mockResolvedValue(null)
    })

    await expect(authorizeCrmEmailOutbound(request, repo)).resolves.toEqual({
      allowed: false,
      code: 'sender_unavailable'
    })
    expect(repo.consumeRate).not.toHaveBeenCalled()
  })

  it.each([
    ['minute', '2026-07-30T00:01:00.000Z'],
    ['day', '2026-07-31T00:00:00.000Z']
  ] as const)('returns only a controlled %s rate denial', async (scope, resetAt) => {
    const consumeRate = scope === 'minute'
      ? vi.fn().mockResolvedValue({ allowed: false, resetAt })
      : vi.fn()
          .mockResolvedValueOnce({
            allowed: true,
            resetAt: '2026-07-30T00:01:00.000Z'
          })
          .mockResolvedValueOnce({ allowed: false, resetAt })
    const repo = repository({ consumeRate })

    await expect(authorizeCrmEmailOutbound(request, repo)).resolves.toEqual({
      allowed: false,
      code: 'rate_limited',
      rateLimitResetAt: resetAt
    })
  })

  it('fails closed without leaking repository diagnostics', async () => {
    const repo = repository({
      findRecipient: vi.fn().mockRejectedValue(
        new Error('database failed for customer@example.net in tenant-secret')
      )
    })

    const result = await authorizeCrmEmailOutbound(request, repo)

    expect(result).toEqual({
      allowed: false,
      code: 'policy_unavailable'
    })
    expect(JSON.stringify(result)).not.toContain('customer@example.net')
    expect(JSON.stringify(result)).not.toContain('tenant-secret')
  })
})
