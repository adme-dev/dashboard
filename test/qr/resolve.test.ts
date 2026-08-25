import { describe, it, expect, vi, beforeEach } from 'vitest'

import { resolveQrCode, invalidateQrCache } from '../../server/utils/qr/resolve'

const { kv, db } = vi.hoisted(() => ({
  kv: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  db: { queryOne: vi.fn() }
}))
vi.mock('~~/server/utils/kv', () => ({ kvGet: kv.get, kvPut: kv.put, kvDelete: kv.delete }))
vi.mock('~~/server/utils/db', () => ({ queryOne: db.queryOne, execute: vi.fn() }))

const event = {} as any
beforeEach(() => { vi.clearAllMocks() })

describe('resolveQrCode', () => {
  it('returns the KV hit without touching the DB', async () => {
    kv.get.mockResolvedValue({ id: '1', clientId: 'c', url: 'https://a', active: true })
    const r = await resolveQrCode(event, 'AbC1234')
    expect(r?.url).toBe('https://a')
    expect(db.queryOne).not.toHaveBeenCalled()
  })
  it('falls back to DB and caches for 24h', async () => {
    kv.get.mockResolvedValue(null)
    db.queryOne.mockResolvedValue({ id: '1', client_id: 'c', destination_url: 'https://b', is_active: true, utm_enabled: true, utm_medium: 'signage', utm_source: null, destination_mode: 'url', name: 'Window', folder_name: 'Spring' })
    const r = await resolveQrCode(event, 'AbC1234')
    expect(r).toEqual({ id: '1', clientId: 'c', url: 'https://b', active: true, code: 'AbC1234', utmEnabled: true, utmMedium: 'signage', utmSource: null, campaign: 'Spring', mode: 'url', ab: null })
    expect(kv.put).toHaveBeenCalledWith(event, 'qr:AbC1234', r, 86400)
  })
  it('returns null for unknown codes and does not cache', async () => {
    kv.get.mockResolvedValue(null); db.queryOne.mockResolvedValue(null)
    expect(await resolveQrCode(event, 'AbC1234')).toBeNull()
    expect(kv.put).not.toHaveBeenCalled()
  })
  it('invalidate deletes the key', async () => {
    await invalidateQrCache(event, 'AbC1234')
    expect(kv.delete).toHaveBeenCalledWith(event, 'qr:AbC1234')
  })
})
