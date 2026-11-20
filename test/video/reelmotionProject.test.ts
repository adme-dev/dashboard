import { describe, expect, it, vi } from 'vitest'
import { getOrCreateReelmotionProjectIn } from '../../server/utils/audio/reelmotionProject'

describe('ordinary-staff ReelMotion companion recovery', () => {
  const clientId = '11111111-1111-4111-8111-111111111111'
  const bannerId = '22222222-2222-4222-8222-222222222222'
  it('reconciles the same source for the same actor after a lost response without another insert', async () => {
    let created: any
    const queries: string[] = []
    const db = { query: async (sql: string) => {
      queries.push(sql)
      if (sql.includes('FROM banner_projects')) return { rows: [{ id: bannerId, clientId, status: 'draft', tags: ['source:reelmotion'], name: 'Reel', canvasData: { custom_1080x1920: { playback: { duration: 38.4, loopCount: 0 }, layers: [{ type: 'audio', src: 'voice', endTime: 38.4 }] } } }] }
      if (sql.includes('FROM banner_assets')) return { rows: [{ id: 'voice', url: 'voice', r2Key: 'banner-assets/actor/voice.mp3', clientId, mimeType: 'audio/mpeg' }] }
      return { rows: [] }
    } }
    const deps = {
      find: vi.fn(async () => created || null),
      create: vi.fn(async (_db, input) => { created = { project: { id: input.id, clientId, createdBy: 'actor', mediaType: 'av' }, timeline: { state: input.initialState } }; return created })
    }
    const input = { bannerId, clientId, actor: { id: 'actor', role: 'member' } }
    const first = await getOrCreateReelmotionProjectIn(db as never, input, deps as never)
    const retry = await getOrCreateReelmotionProjectIn(db as never, input, deps as never)
    expect(first.project.id).toBe(retry.project.id)
    expect(deps.create).toHaveBeenCalledTimes(1)
    expect(queries[0]).toContain('pg_advisory_xact_lock')
    await expect(getOrCreateReelmotionProjectIn(db as never, { ...input, clientId: 'other' }, deps as never)).rejects.toThrow(/client/i)
  })
})
