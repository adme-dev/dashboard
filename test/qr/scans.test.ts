import { describe, it, expect, vi, beforeEach } from 'vitest'

const { pgClientMock, neonQueryMock } = vi.hoisted(() => ({
  pgClientMock: { connect: vi.fn(), query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) },
  neonQueryMock: vi.fn(),
}))

vi.mock('pg', () => ({ default: { Client: function Client() { return pgClientMock } } }))
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn(() => ({ query: neonQueryMock })) }))
vi.mock('~~/server/utils/db', () => ({ resolveHyperdriveConnectionString: vi.fn() }))
vi.mock('~~/server/utils/exportTokens', () => ({ sha256Hex: vi.fn().mockResolvedValue('hash') }))
vi.mock('~~/server/utils/tracking/client-ip', () => ({ resolveClientIp: vi.fn(() => '1.2.3.4') }))
vi.mock('~~/server/utils/asyncBackground', () => ({ runAfterResponse: vi.fn() }))

import { writeScan } from '../../server/utils/qr/scans'

beforeEach(() => { vi.clearAllMocks() })

describe('writeScan', () => {
  const params = ['qr1', 'c1', 'AU', 'mobile', 'iOS', 'Safari', 'hash', null, 'ua']

  it('uses its OWN pg client over the captured Hyperdrive string (never the request-scoped db helpers)', async () => {
    await writeScan({ hyperdriveCs: 'postgres://hyper', httpCs: 'postgres://http' }, params, 'qr1')
    expect(pgClientMock.connect).toHaveBeenCalledOnce()
    expect(pgClientMock.query).toHaveBeenCalledTimes(2)
    expect(pgClientMock.query.mock.calls[0][0]).toContain('INSERT INTO qr_scans')
    expect(pgClientMock.query.mock.calls[1][0]).toContain('scan_count + 1')
    expect(pgClientMock.end).toHaveBeenCalledOnce() // connection not leaked
    expect(neonQueryMock).not.toHaveBeenCalled()
  })

  it('closes the client even when the insert fails', async () => {
    pgClientMock.query.mockRejectedValueOnce(new Error('boom'))
    await expect(writeScan({ hyperdriveCs: 'postgres://hyper', httpCs: null }, params, 'qr1')).rejects.toThrow('boom')
    expect(pgClientMock.end).toHaveBeenCalledOnce()
  })

  it('falls back to the stateless neon HTTP driver without Hyperdrive', async () => {
    await writeScan({ hyperdriveCs: null, httpCs: 'postgres://neon' }, params, 'qr1')
    expect(neonQueryMock).toHaveBeenCalledTimes(2)
    expect(pgClientMock.connect).not.toHaveBeenCalled()
  })

  it('throws loudly when no connection string was captured', async () => {
    await expect(writeScan({ hyperdriveCs: null, httpCs: null }, params, 'qr1')).rejects.toThrow('no database connection string')
  })
})
