import { describe, expect, it, vi } from 'vitest'
import { createPostgresCrmEmailOutboundPolicyRepository } from '~~/server/utils/crm/emailOutboundPolicy'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const SENDER_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'

describe('CRM email outbound Postgres policy repository', () => {
  it('resolves a canonical person only inside the requested tenant', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      id: PERSON_ID,
      email_address: 'customer@example.net',
      do_not_contact: false,
      do_not_email: false
    })
    const repository = createPostgresCrmEmailOutboundPolicyRepository(queryOne)

    await expect(repository.findRecipient({
      clientId: CLIENT_ID,
      personId: PERSON_ID,
      emailAddress: 'customer@example.net'
    })).resolves.toEqual({
      personId: PERSON_ID,
      emailAddress: 'customer@example.net',
      doNotContact: false,
      doNotEmail: false
    })

    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('FROM crm_people')
    expect(sql).toContain('client_id = $1')
    expect(sql).toContain('id = $2')
    expect(sql).toContain('LOWER(email) = $3')
    expect(sql).toContain('deleted_at IS NULL')
    expect(params).toEqual([CLIENT_ID, PERSON_ID, 'customer@example.net'])
  })

  it.each([
    [null, 'is_default = TRUE'],
    [SENDER_ID, 'id = $2']
  ])('resolves a ready tenant sender for selection %s', async (selection, selectorSql) => {
    const queryOne = vi.fn().mockResolvedValue({
      id: SENDER_ID,
      email_address: 'sales@example.com',
      display_name: 'Sales'
    })
    const repository = createPostgresCrmEmailOutboundPolicyRepository(queryOne)

    await repository.findReadySender({
      clientId: CLIENT_ID,
      senderIdentityId: selection
    })

    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('FROM crm_email_sender_identities')
    expect(sql).toContain('client_id = $1')
    expect(sql).toContain(selectorSql)
    expect(sql).toContain('status = \'ready\'')
    expect(params).toEqual(selection ? [CLIENT_ID, SENDER_ID] : [CLIENT_ID])
  })

  it('checks the canonical case-insensitive suppression list', async () => {
    const queryOne = vi.fn().mockResolvedValue({ suppressed: true })
    const repository = createPostgresCrmEmailOutboundPolicyRepository(queryOne)

    await expect(repository.isSuppressed('customer@example.net')).resolves.toBe(true)

    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('FROM suppression_list')
    expect(sql).toContain('email = $1')
    expect(params).toEqual(['customer@example.net'])
  })

  it('atomically consumes a bounded rate bucket without exposing actor IDs', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      allowed: true,
      reset_at: '2026-07-30T00:01:00.000Z'
    })
    const repository = createPostgresCrmEmailOutboundPolicyRepository(queryOne)

    await expect(repository.consumeRate({
      clientId: CLIENT_ID,
      actorKind: 'portal_user',
      actorId: ACTOR_ID,
      scope: 'minute',
      limit: 30,
      windowSeconds: 60
    })).resolves.toEqual({
      allowed: true,
      resetAt: '2026-07-30T00:01:00.000Z'
    })

    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('INSERT INTO ratelimit_buckets')
    expect(sql).toContain('ON CONFLICT (key) DO UPDATE')
    expect(sql).toContain('OR ratelimit_buckets.count < $3')
    expect(sql).toContain('RETURNING')
    expect(params[1]).toBe(60)
    expect(params[2]).toBe(30)
    expect(params[0]).toMatch(/^crm-email-outbound:minute:[a-f0-9]{64}$/)
    expect(params[0]).not.toContain(CLIENT_ID)
    expect(params[0]).not.toContain(ACTOR_ID)
  })

  it('returns the current reset time when the atomic bucket is exhausted', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      allowed: false,
      reset_at: '2026-07-31T00:00:00.000Z'
    })
    const repository = createPostgresCrmEmailOutboundPolicyRepository(queryOne)

    await expect(repository.consumeRate({
      clientId: CLIENT_ID,
      actorKind: 'agency_user',
      actorId: ACTOR_ID,
      scope: 'day',
      limit: 500,
      windowSeconds: 86400
    })).resolves.toEqual({
      allowed: false,
      resetAt: '2026-07-31T00:00:00.000Z'
    })
  })
})
