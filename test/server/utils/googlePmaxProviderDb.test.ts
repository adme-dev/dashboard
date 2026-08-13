import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clients: [] as Array<{
    connect: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }>,
  Client: vi.fn()
}))

vi.mock('pg', () => ({
  default: {
    Client: mocks.Client
  }
}))

import { queryRows } from '../../../workers/google-pmax-provider/src/db'

describe('Google PMax provider Hyperdrive client lifecycle', () => {
  beforeEach(() => {
    mocks.clients.length = 0
    mocks.Client.mockReset().mockImplementation(function () {
      const client = {
        connect: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ rows: [{ ok: true }] }),
        end: vi.fn().mockResolvedValue(undefined)
      }
      mocks.clients.push(client)
      return client
    })
  })

  it('creates and closes a fresh Hyperdrive client for every query boundary', async () => {
    await expect(queryRows('postgres://hyperdrive', 'SELECT 1')).resolves.toEqual([{ ok: true }])
    await expect(queryRows('postgres://hyperdrive', 'SELECT 2')).resolves.toEqual([{ ok: true }])

    expect(mocks.Client).toHaveBeenCalledTimes(2)
    expect(mocks.clients).toHaveLength(2)
    expect(mocks.clients[0]?.connect).toHaveBeenCalledOnce()
    expect(mocks.clients[0]?.end).toHaveBeenCalledOnce()
    expect(mocks.clients[1]?.connect).toHaveBeenCalledOnce()
    expect(mocks.clients[1]?.end).toHaveBeenCalledOnce()
  })
})
