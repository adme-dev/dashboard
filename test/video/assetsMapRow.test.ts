import { describe, it, expect } from 'vitest'
import { mapVideoAssetRow } from '~~/server/utils/video/assets'

describe('mapVideoAssetRow', () => {
  it('maps snake_case to camelCase', () => {
    const row = { id: 'a1', client_id: 'c1', created_by: 'u1', title: 'Spot', source_project_id: 'p1', source_job_id: 'j1', r2_key: 'k.mp4', format: 'reels_9x16', width: 1080, height: 1920, duration_sec: '12.5', thumbnail_key: 'thumbs/a1.jpg', caption_vtt_key: 'captions/a1.vtt', transcript: 'hello world', metadata: { campaign: 'launch' }, generation_prompt: 'wheels turning in sand', generation_model_id: 'aigateway/seedance-i2v', created_at: 't', updated_at: 't' }
    expect(mapVideoAssetRow(row)).toMatchObject({
      id: 'a1',
      clientId: 'c1',
      title: 'Spot',
      sourceJobId: 'j1',
      r2Key: 'k.mp4',
      format: 'reels_9x16',
      width: 1080,
      height: 1920,
      durationSec: 12.5,
      thumbnailKey: 'thumbs/a1.jpg',
      thumbnailUrl: '/api/agency/video/assets/a1/thumbnail',
      captionVttKey: 'captions/a1.vtt',
      captionVttUrl: '/api/agency/video/assets/a1/captions.vtt',
      transcript: 'hello world',
      metadata: { campaign: 'launch' },
      generationPrompt: 'wheels turning in sand',
      generationModelId: 'aigateway/seedance-i2v',
    })
  })
})
