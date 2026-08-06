import { describe, expect, it, vi } from 'vitest'

import {
  createClientPortalAccessRequestSession,
  createClientPortalOpenController
} from '../../app/utils/clientPortalAccessRequest'

function uuidFactory(...ids: string[]) {
  const randomUUID = vi.fn()
  ids.forEach(id => randomUUID.mockReturnValueOnce(id))
  return randomUUID
}

describe('agency client portal access request identity', () => {
  it('retains the identical key across transport, 5xx, and a retryable 409, then rotates after success', async () => {
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

  it('clears a retained key when a later 409 is explicitly terminal, then uses a fresh key', async () => {
    const randomUUID = uuidFactory(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
    const sentKeys: string[] = []
    const responses: unknown[] = [
      { statusCode: 500 },
      {
        statusCode: 409,
        data: {
          statusCode: 409,
          statusMessage: 'God mode client portal access is not safely replayable',
          data: { code: 'client_portal_access_unreplayable' }
        }
      },
      { ok: true }
    ]
    const send = vi.fn(async (_url: string, options: Record<string, unknown>) => {
      sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
      const response = responses.shift()
      if (response && typeof response === 'object' && 'statusCode' in response) throw response
      return response
    })
    const session = createClientPortalAccessRequestSession(send, { randomUUID })

    await expect(session.request('client-one')).rejects.toMatchObject({ statusCode: 500 })
    await expect(session.request('client-one')).rejects.toMatchObject({ statusCode: 409 })
    await expect(session.request('client-one')).resolves.toEqual({ ok: true })

    expect(sentKeys).toEqual([
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:22222222-2222-4222-8222-222222222222'
    ])
  })

  it('retains a genuinely retryable 409 without the terminal classification', async () => {
    const randomUUID = uuidFactory(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
    const sentKeys: string[] = []
    const send = vi.fn()
      .mockImplementationOnce(async (_url: string, options: Record<string, unknown>) => {
        sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
        throw { statusCode: 409, data: { statusMessage: 'Still in progress' } }
      })
      .mockImplementationOnce(async (_url: string, options: Record<string, unknown>) => {
        sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
        return { ok: true }
      })
    const session = createClientPortalAccessRequestSession(send, { randomUUID })

    await expect(session.request('client-one')).rejects.toMatchObject({ statusCode: 409 })
    await expect(session.request('client-one')).resolves.toEqual({ ok: true })

    expect(sentKeys).toEqual([
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:11111111-1111-4111-8111-111111111111'
    ])
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

  it('executes the real page open orchestration with stable retry identity and success side effects', async () => {
    const sentKeys: string[] = []
    const failure = new TypeError('connection reset')
    const send = vi.fn()
      .mockImplementationOnce(async (_url: string, options: Record<string, unknown>) => {
        sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
        throw failure
      })
      .mockImplementationOnce(async (_url: string, options: Record<string, unknown>) => {
        sentKeys.push((options.headers as Record<string, string>)['Idempotency-Key'])
        return { ok: true }
      })
    const accessRequests = createClientPortalAccessRequestSession(send, {
      randomUUID: () => '11111111-1111-4111-8111-111111111111'
    })
    const refreshActivity = vi.fn()
    const navigate = vi.fn()
    const notifyError = vi.fn()
    const opening: boolean[] = []
    const controller = createClientPortalOpenController({
      accessRequests,
      refreshActivity,
      navigate,
      notifyError,
      setOpening: value => opening.push(value)
    })

    await expect(controller.open('client-one', '/portal/projects?status=active')).resolves.toBe(false)
    await expect(controller.open('client-one', '/portal/projects?status=active')).resolves.toBe(true)

    expect(sentKeys).toEqual([
      'portal-access:11111111-1111-4111-8111-111111111111',
      'portal-access:11111111-1111-4111-8111-111111111111'
    ])
    expect(notifyError).toHaveBeenCalledWith(failure)
    expect(refreshActivity).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/portal/projects?status=active')
    expect(opening).toEqual([true, false, true, false])
  })
})
