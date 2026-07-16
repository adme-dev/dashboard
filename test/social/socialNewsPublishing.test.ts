import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildNewsPublishTargets } from '~~/app/utils/socialNewsPublishing'

describe('buildNewsPublishTargets', () => {
  it('targets only checked accounts on checked platforms', () => {
    const accounts = [
      { id: 'fb-1', platform: 'facebook' },
      { id: 'ig-1', platform: 'instagram' },
      { id: 'li-1', platform: 'linkedin' },
    ]
    expect(buildNewsPublishTargets(accounts, ['fb-1', 'ig-1', 'li-1'], ['facebook', 'instagram'])).toEqual([
      { platform: 'facebook', accountId: 'fb-1' },
      { platform: 'instagram', accountId: 'ig-1' },
    ])
  })

  it('returns no targets when selected accounts do not match selected platforms', () => {
    expect(buildNewsPublishTargets([{ id: 'ig-1', platform: 'instagram' }], ['ig-1'], ['linkedin'])).toEqual([])
  })

  it('keeps the news draft action disabled until a connected target exists', () => {
    const source = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')
    expect(source).toContain('!publishTargetCount')
    expect(source).toContain('Select at least one connected account')
  })
})
