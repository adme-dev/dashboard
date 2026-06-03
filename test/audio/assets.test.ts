import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB so createMusicAsset can be unit-tested without a connection.
const queryOneMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: any[]) => queryOneMock(...args),
  queryRows: vi.fn(),
}))

const mockPresign = vi.fn()
const mockIsStorageConfigured = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  uploadFile: vi.fn(),
  getPresignedDownloadUrl: (...args: any[]) => mockPresign(...args),
  isStorageConfigured: (...args: any[]) => mockIsStorageConfigured(...args),
}))

import { buildMasterKey, mapRow, createMusicAsset, streamUrlFor } from '~~/server/utils/audio/assets'

describe('buildMasterKey', () => {
  it('namespaces by client when present', () => {
    expect(buildMasterKey('client-123', 'asset-abc', 'mp3'))
      .toBe('audio/client-123/asset-abc/master.mp3')
  })

  it('falls back to org namespace when client is null', () => {
    expect(buildMasterKey(null, 'asset-abc', 'mp3'))
      .toBe('audio/org/asset-abc/master.mp3')
  })
})

describe('mapRow', () => {
  it('maps snake_case DB row to camelCase AudioAsset', () => {
    const row = {
      id: 'a1', client_id: null, created_by: 'u1', kind: 'voiceover',
      status: 'ready', title: 'Promo VO', prompt: 'Hello world', lang: 'en',
      voice: null, channels: ['tiktok'], r2_key_master: 'audio/org/a1/master.mp3',
      variants: {}, duration_sec: '3.2', cost_cents: null, error: null,
      created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    }
    const asset = mapRow(row)
    expect(asset.id).toBe('a1')
    expect(asset.clientId).toBeNull()
    expect(asset.r2KeyMaster).toBe('audio/org/a1/master.mp3')
    expect(asset.channels).toEqual(['tiktok'])
    expect(asset.durationSec).toBe(3.2)
  })

  it('maps music-specific fields', () => {
    const row = {
      id: 'm1', client_id: 'c1', created_by: 'u1', kind: 'music',
      status: 'queued', title: 'Upbeat promo', prompt: 'energetic synthwave',
      lang: null, voice: null, channels: [], r2_key_master: null, variants: {},
      duration_sec: null, cost_cents: null, error: null,
      is_instrumental: true, lyrics: null, format: 'mp3',
      created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    }
    const asset = mapRow(row)
    expect(asset.kind).toBe('music')
    expect(asset.status).toBe('queued')
    expect(asset.isInstrumental).toBe(true)
    expect(asset.format).toBe('mp3')
    expect(asset.lyrics).toBeNull()
  })
})

describe('createMusicAsset', () => {
  beforeEach(() => queryOneMock.mockReset())

  it('inserts a queued music asset with music fields and sets idempotency_key', async () => {
    // param order mirrors the INSERT: id, client_id, created_by, title, prompt,
    // channels, format, is_instrumental, lyrics, idempotency_key
    queryOneMock.mockImplementationOnce(async (_sql: string, params: any[]) => ({
      id: params[0], client_id: params[1], created_by: params[2], kind: 'music',
      status: 'queued', title: params[3], prompt: params[4], lang: null, voice: null,
      channels: params[5], r2_key_master: null, variants: {}, duration_sec: null,
      cost_cents: null, error: null, format: params[6], is_instrumental: params[7],
      lyrics: params[8], created_at: 'now', updated_at: 'now',
    }))

    const asset = await createMusicAsset({
      createdBy: 'u1', clientId: 'c1', title: 'Promo bed', prompt: 'warm acoustic',
      isInstrumental: true, lyrics: null, channels: ['radio'], format: 'mp3',
      idempotencyKey: 'idem-123',
    })

    expect(queryOneMock).toHaveBeenCalledTimes(1)
    const [sql, params] = queryOneMock.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO audio_assets/i)
    expect(sql).toMatch(/'music'/)
    expect(sql).toMatch(/'queued'/)
    expect(params).toContain('idem-123') // idempotency_key set on create (Phase 1 fast-follow)
    expect(asset.kind).toBe('music')
    expect(asset.status).toBe('queued')
    expect(asset.isInstrumental).toBe(true)
    expect(asset.r2KeyMaster).toBeNull() // no master yet — the worker uploads later
    expect(asset.streamUrl).toBeUndefined()
  })
})

describe('streamUrlFor', () => {
  beforeEach(() => {
    mockPresign.mockReset()
    mockIsStorageConfigured.mockReset()
  })

  it('returns a stable same-origin stream endpoint for assets with a master key', async () => {
    mockIsStorageConfigured.mockReturnValue(true)
    mockPresign.mockResolvedValue('https://signed.example.com/audio.wav')

    const url = await streamUrlFor({
      id: 'a1',
      r2KeyMaster: 'audio/org/a1/master.wav',
    } as any)

    expect(url).toBe('/api/agency/audio/assets/a1/stream')
    expect(mockPresign).not.toHaveBeenCalled()
  })

  it('returns undefined when the asset has no master key', async () => {
    await expect(streamUrlFor({ id: 'a1', r2KeyMaster: null } as any)).resolves.toBeUndefined()
  })
})
