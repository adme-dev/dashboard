import { describe, it, expect, vi } from 'vitest'
import { getSocialListening, socialListeningTool, type SocialListeningDeps, type ListeningOverview } from '~~/server/utils/ai/tools/socialListening'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const overview = (): ListeningOverview => ({
  total: 120, sentiment: { positive: 60, neutral: 40, negative: 18, unknown: 2 },
  shareOfVoice: [{ category: 'brand', count: 80 }], topTopics: [{ topic: 'pricing', count: 12 }],
  topSources: [{ source: 'reddit', count: 50 }],
})

describe('get_social_listening', () => {
  it('returns the overview plus up to 5 notable negative mentions (excerpted)', async () => {
    const mentions = Array.from({ length: 7 }, (_, i) => ({ source: 'reddit', sentiment: 'negative', content: `bad thing ${i} ${'x'.repeat(400)}`, title: `t${i}`, url: `https://r/${i}` }))
    const deps: SocialListeningDeps = { resolveClient, overview: vi.fn().mockResolvedValue(overview()), recentNegative: vi.fn().mockResolvedValue(mentions) }
    const res = await getSocialListening({ clientName: 'Acme', period: '30d' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.total).toBe(120)
    expect(data.sentiment.negative).toBe(18)
    expect(data.notableMentions).toHaveLength(5)
    expect(data.notableMentions[0].excerpt.length).toBeLessThanOrEqual(200)
    expect((deps.overview as any).mock.calls[0]).toEqual(['c1', 30, ctx])
  })

  it('still returns the overview if notable-mentions fetch fails', async () => {
    const deps: SocialListeningDeps = { resolveClient, overview: vi.fn().mockResolvedValue(overview()), recentNegative: vi.fn().mockRejectedValue(new Error('x')) }
    const res = await getSocialListening({ clientName: 'Acme', period: '30d' }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.notableMentions).toEqual([])
  })

  it('fails (no fetch) on unknown client; is read-only/untrusted/CLIENTS', async () => {
    const overviewFn = vi.fn()
    const deps: SocialListeningDeps = { resolveClient: vi.fn().mockResolvedValue(null), overview: overviewFn, recentNegative: vi.fn() }
    const res = await getSocialListening({ clientName: 'Nope', period: '30d' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(overviewFn).not.toHaveBeenCalled()
    expect(socialListeningTool.mutates).toBeUndefined()
    expect(socialListeningTool.returnsUntrusted).toBe(true)
    expect(socialListeningTool.requiredPermission).toBe('CLIENTS')
  })
})
