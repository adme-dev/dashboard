import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { createBannerVideoExportSession } from '~~/app/utils/bannerVideoExport'

describe('banner video export request identity', () => {
  it('routes the MP4 enqueue request through the shared identity session', () => {
    const source = readFileSync('app/components/banner/BannerExportModal.client.vue', 'utf8')
    const enqueue = source.match(/videoExportSession\.attempt\([\s\S]*?exportProgress\.value = 10/)?.[0]

    expect(enqueue).toContain('\'/api/agency/banner-studio/export-video\'')
    expect(enqueue).toContain('headers,')
  })

  it('retains one key across transport and server failures, then rotates after acceptance', async () => {
    const nextKey = vi.fn()
      .mockReturnValueOnce('banner-render:first')
      .mockReturnValueOnce('banner-render:second')
    const session = createBannerVideoExportSession({ nextKey })
    const sentKeys: string[] = []

    await expect(session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      throw new TypeError('connection reset')
    })).rejects.toThrow('connection reset')
    await expect(session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      throw { statusCode: 503 }
    })).rejects.toEqual({ statusCode: 503 })
    await expect(session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      return 'accepted'
    })).resolves.toBe('accepted')
    await session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      return 'next attempt'
    })

    expect(sentKeys).toEqual([
      'banner-render:first',
      'banner-render:first',
      'banner-render:first',
      'banner-render:second'
    ])
  })

  it('retains the key after a 409 so an ambiguous render cannot gain a fresh dispatch identity', async () => {
    const nextKey = vi.fn()
      .mockReturnValueOnce('banner-render:first')
      .mockReturnValueOnce('banner-render:second')
    const session = createBannerVideoExportSession({ nextKey })
    const sentKeys: string[] = []

    await expect(session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      throw { statusCode: 409 }
    })).rejects.toEqual({ statusCode: 409 })
    await session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      return 'safely replayed request'
    })

    expect(sentKeys).toEqual(['banner-render:first', 'banner-render:first'])
  })

  it('rotates after a definitive validation rejection', async () => {
    const nextKey = vi.fn()
      .mockReturnValueOnce('banner-render:first')
      .mockReturnValueOnce('banner-render:second')
    const session = createBannerVideoExportSession({ nextKey })
    const sentKeys: string[] = []

    await expect(session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      throw { statusCode: 422 }
    })).rejects.toEqual({ statusCode: 422 })
    await session.attempt(async (headers) => {
      sentKeys.push(headers['Idempotency-Key'])
      return 'corrected request'
    })

    expect(sentKeys).toEqual(['banner-render:first', 'banner-render:second'])
  })
})
