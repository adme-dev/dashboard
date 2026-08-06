import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { createClientPortalAccessRequestSession } from '../../app/utils/clientPortalAccessRequest'

function uuidFactory(...ids: string[]) {
  const randomUUID = vi.fn()
  ids.forEach(id => randomUUID.mockReturnValueOnce(id))
  return randomUUID
}

describe('agency client portal access request identity', () => {
  it('retains the identical key across transport, 5xx, and 409 failures, then rotates after success', async () => {
    const randomUUID = uuidFactory(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
    const sentKeys: string[] = []
    const failures: unknown[] = [
      new TypeError('Failed to fetch'),
      { statusCode: 500 },
      { response: { status: 503 } },
      { statusCode: 409 }
    ]
    const send = vi.fn(async (_url: string, options: Record<string, unknown>) => {
      sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
      const failure = failures.shift()
      if (failure) throw failure
      return { ok: true }
    })
    const session = createClientPortalAccessRequestSession(send, { randomUUID })

    for (let index = 0; index < 4; index++) {
      await expect(session.request('client-one')).rejects.toBeTruthy()
    }
    await expect(session.request('client-one')).resolves.toEqual({ ok: true })
    await expect(session.request('client-one')).resolves.toEqual({ ok: true })

    expect(sentKeys).toEqual([
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:22222222-2222-4222-8222-222222222222'
    ])
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })

  it.each([400, 404, 422, 428])('rotates after decisive HTTP %s', async (statusCode) => {
    const randomUUID = uuidFactory(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
    const sentKeys: string[] = []
    const send = vi.fn()
      .mockImplementationOnce(async (_url: string, options: Record<string, unknown>) => {
        sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
        throw { statusCode }
      })
      .mockImplementationOnce(async (_url: string, options: Record<string, unknown>) => {
        sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
        return { ok: true }
      })
    const session = createClientPortalAccessRequestSession(send, { randomUUID })

    await expect(session.request('client-one')).rejects.toEqual({ statusCode })
    await expect(session.request('client-one')).resolves.toEqual({ ok: true })

    expect(sentKeys).toEqual([
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:22222222-2222-4222-8222-222222222222'
    ])
  })

  it('keeps independent request identities for different clients', async () => {
    const randomUUID = uuidFactory(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
    const requests: Array<{ clientId: string, key: string }> = []
    const send = vi.fn(async (_url: string, options: Record<string, unknown>) => {
      requests.push({
        clientId: (options.body as { clientId: string }).clientId,
        key: (options.headers as Record<string, string>)['Idempotency-Key']
      })
      throw new TypeError('connection lost')
    })
    const session = createClientPortalAccessRequestSession(send, { randomUUID })

    await expect(session.request('client-one')).rejects.toThrow('connection lost')
    await expect(session.request('client-two')).rejects.toThrow('connection lost')
    await expect(session.request('client-one')).rejects.toThrow('connection lost')

    expect(requests).toEqual([
      { clientId: 'client-one', key: 'portal-access:11111111-1111-4111-8111-111111111111' },
      { clientId: 'client-two', key: 'portal-access:22222222-2222-4222-8222-222222222222' },
      { clientId: 'client-one', key: 'portal-access:11111111-1111-4111-8111-111111111111' }
    ])
  })

  it('drives the authenticated page request through the tested session behavior and preserves failure UX', async () => {
    const send = vi.fn(async () => ({ ok: true }))
    const session = createClientPortalAccessRequestSession(send, {
      randomUUID: () => '11111111-1111-4111-8111-111111111111'
    })

    await session.request('client-one')

    expect(send).toHaveBeenCalledWith('/api/agency/client-portal/access', {
      method: 'POST',
      body: { clientId: 'client-one' },
      headers: { 'Idempotency-Key': 'portal-access:11111111-1111-4111-8111-111111111111' }
    })

    const page = readFileSync('app/pages/agency/client-portal.vue', 'utf8')
    expect(page).toContain('createClientPortalAccessRequestSession(apiFetch)')
    expect(page).toContain('portalAccessRequests.request(targetClientId)')
    expect(page).toContain('title: \'Failed to open portal\'')
    expect(page).toContain('description: errorMessage(err)')
    expect(page).toContain('color: \'error\'')
  })
})
