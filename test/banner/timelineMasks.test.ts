import { describe, it, expect } from 'vitest'
import gsap from 'gsap'
import { registerTimelineMaskUpdate, updateTimelineMasks } from '~/utils/bannerTimelineMasks'
import { createBannerSocialDraftSession } from '~/utils/bannerSocialDraftSession'

describe('mask render order', () => {
  it('reads delayed child transforms on forward and backward seeks', () => {
    const target = { x: 0 }
    let seen = -1
    const tl = gsap.timeline({ paused: true })
    registerTimelineMaskUpdate(tl, () => { seen = target.x })
    tl.to(target, { x: 100, duration: 1, ease: 'none' }, 1)
    tl.seek(1.5, false)
    expect(seen).toBe(50)
    tl.seek(1.25, false)
    expect(seen).toBe(25)
    tl.seek(0)
    updateTimelineMasks(tl)
    expect(seen).toBe(0)
    tl.kill()
  })
})

describe('social draft retry recovery', () => {
  it.each([500, 503, 409, undefined])('uses a new execution after failure %s', async statusCode => {
    let next = 0
    const keys: string[] = []
    const session = createBannerSocialDraftSession(() => `key-${++next}`)
    await expect(session.attempt(async headers => {
      keys.push(headers['Idempotency-Key']!)
      throw { statusCode }
    })).rejects.toEqual({ statusCode })
    const result = await session.attempt(async headers => {
      keys.push(headers['Idempotency-Key']!)
      return { postId: 'same-job-deduplicated-post' }
    })
    expect(keys).toEqual(['key-1', 'key-2'])
    expect(result.postId).toBe('same-job-deduplicated-post')
  })
})
