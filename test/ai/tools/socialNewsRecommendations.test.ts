import { describe, expect, it } from 'vitest'
import { getSocialNewsRecommendations, socialNewsRecommendationsTool, type SocialNewsRecommendationDeps } from '~~/server/utils/ai/tools/socialNewsRecommendations'

const ctx = { userId: 'u1', userRole: 'admin', event: { headers: new Headers() } as any }

describe('recommend_social_news', () => {
  it('returns explainable client, audience, account, story, and saved-slot recommendations', async () => {
    const deps: SocialNewsRecommendationDeps = {
      load: async () => ({
        client: { id: 'c1', name: 'Arctic Campers' },
        profile: { targetAudience: 'Australian touring families', preferredPlatforms: ['facebook'], timezone: 'Australia/Melbourne' },
        accounts: [{ id: 'a1', platform: 'facebook', accountName: 'Arctic Campers' }],
        stories: [{ id: 'n1', title: 'Regional touring demand grows', sourceUrl: 'https://example.test/story', relevanceScore: 7, relevanceReasons: ['Pillar: touring advice'] }],
        nextSlot: new Date('2026-07-20T23:00:00.000Z'),
      }),
    }
    const result = await getSocialNewsRecommendations({ clientName: 'Arctic Campers', limit: 3 }, ctx, deps)
    expect(result.ok).toBe(true)
    expect((result as any).data).toMatchObject({
      client: { id: 'c1', name: 'Arctic Campers' },
      audience: 'Australian touring families',
      postingWindow: { at: '2026-07-20T23:00:00.000Z', evidence: 'saved_client_slot' },
      candidates: [{ storyId: 'n1', targets: [{ accountId: 'a1', platform: 'facebook' }] }],
    })
  })

  it('labels missing timing evidence instead of inventing an optimal time', async () => {
    const deps: SocialNewsRecommendationDeps = {
      load: async () => ({
        client: { id: 'c1', name: 'Client' },
        profile: { targetAudience: '', preferredPlatforms: [], timezone: 'Australia/Melbourne' },
        accounts: [], stories: [], nextSlot: null,
      }),
    }
    const result = await getSocialNewsRecommendations({ clientName: 'Client', limit: 3 }, ctx, deps)
    expect((result as any).data.postingWindow).toEqual({ at: null, evidence: 'insufficient_data' })
  })

  it('is a read-only, permission-gated, untrusted tool', () => {
    expect(socialNewsRecommendationsTool.name).toBe('recommend_social_news')
    expect(socialNewsRecommendationsTool.requiredPermission).toBe('CLIENTS')
    expect(socialNewsRecommendationsTool.returnsUntrusted).toBe(true)
    expect(socialNewsRecommendationsTool.mutates).toBeUndefined()
  })
})
