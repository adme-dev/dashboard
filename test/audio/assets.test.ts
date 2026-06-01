import { describe, it, expect } from 'vitest'
import { buildMasterKey, mapRow } from '~~/server/utils/audio/assets'

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
})
