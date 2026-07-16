import { describe, expect, it } from 'vitest'
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
})
