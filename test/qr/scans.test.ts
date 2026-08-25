import { describe, it, expect, vi, beforeEach } from 'vitest'

import { recordScan } from '../../server/utils/qr/scans'

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }))

vi.mock('~~/server/utils/db', () => ({ execute: executeMock }))
vi.mock('~~/server/utils/exportTokens', () => ({ sha256Hex: vi.fn().mockResolvedValue('hash') }))
vi.mock('~~/server/utils/tracking/client-ip', () => ({ resolveClientIp: vi.fn(() => '1.2.3.4') }))

const g = globalThis as any
g.getHeader = (_e: unknown, name: string) => ({ 'user-agent': 'Mozilla/5.0 (iPhone) Mobile Safari/604.1', 'cf-ipcountry': 'AU' }[name] ?? null)
g.getRequestIP = () => '1.2.3.4'

const event = { context: {} } as any
const qr = { id: 'qr1', clientId: 'c1', url: 'https://x', active: true }

beforeEach(() => { vi.clearAllMocks(); executeMock.mockResolvedValue(undefined) })

describe('recordScan (in-request)', () => {
  it('awaits the insert and counter bump before returning', async () => {
    await recordScan(event, qr)
    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(executeMock.mock.calls[0][0]).toContain('INSERT INTO qr_scans')
    expect(executeMock.mock.calls[0][1][0]).toBe('qr1')
    expect(executeMock.mock.calls[0][1][3]).toBe('mobile') // classified device
    expect(executeMock.mock.calls[0][1][2]).toBe('AU') // header fallback when request.cf is absent
    expect(executeMock.mock.calls[0][1].slice(9)).toEqual([null, null, null, null, null, null])
    expect(executeMock.mock.calls[1][0]).toContain('scan_count + 1')
  })

  it('records city / region / postcode from Cloudflare request.cf when present', async () => {
    const cfEvent = { context: { cloudflare: { request: { cf: { country: 'AU', city: 'Frankston', region: 'Victoria', postalCode: '3199', latitude: '-38.1440', longitude: '145.1230' } } } } } as any
    await recordScan(cfEvent, qr)
    const params = executeMock.mock.calls[0][1]
    expect(params[2]).toBe('AU')
    expect(params.slice(9)).toEqual(['Frankston', 'Victoria', '3199', -38.144, 145.123, null])
  })

  it('swallows DB errors so the redirect is never broken', async () => {
    executeMock.mockRejectedValue(new Error('db down'))
    await expect(recordScan(event, qr)).resolves.toBeUndefined()
  })

  it('returns after the timeout when the write hangs, without throwing', async () => {
    vi.useFakeTimers()
    try {
      executeMock.mockImplementation(() => new Promise(() => {})) // hangs forever
      const p = recordScan(event, qr)
      await vi.advanceTimersByTimeAsync(1600)
      await expect(p).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
