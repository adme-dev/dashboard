import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = new Map<string, { value: any; expiresAt: number }>()

vi.mock('~~/server/utils/kv', () => ({
  kvGet: async (_event: any, key: string) => {
    const v = mem.get(key)
    if (!v) return null
    if (v.expiresAt < Date.now()) { mem.delete(key); return null }
    return v.value
  },
  kvPut: async (_event: any, key: string, value: any, ttl: number) => {
    mem.set(key, { value, expiresAt: Date.now() + ttl * 1000 })
  },
  kvDelete: async (_event: any, key: string) => { mem.delete(key) },
}))

import { acquireScanLock, releaseScanLock } from '~~/server/utils/anomalyDetection/kvLock'

beforeEach(() => { mem.clear() })

describe('scan KV lock', () => {
  it('acquires when free', async () => {
    expect(await acquireScanLock('tenant-A')).toBe(true)
  })

  it('rejects when already held', async () => {
    await acquireScanLock('tenant-A')
    expect(await acquireScanLock('tenant-A')).toBe(false)
  })

  it('releases and allows re-acquisition', async () => {
    await acquireScanLock('tenant-A')
    await releaseScanLock('tenant-A')
    expect(await acquireScanLock('tenant-A')).toBe(true)
  })

  it('isolates tenants', async () => {
    await acquireScanLock('tenant-A')
    expect(await acquireScanLock('tenant-B')).toBe(true)
  })

  it('uses a 5-minute TTL on the lock value', async () => {
    await acquireScanLock('tenant-A')
    const entry = (mem as any).get('anomaly-scan-lock:tenant-A')
    expect(entry).toBeDefined()
    // TTL should be ~300000ms in the future (allow 1s tolerance)
    const ttl = entry.expiresAt - Date.now()
    expect(ttl).toBeGreaterThan(299_000)
    expect(ttl).toBeLessThanOrEqual(300_000)
  })
})
