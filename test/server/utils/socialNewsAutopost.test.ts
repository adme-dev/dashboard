import { describe, expect, it } from 'vitest'
import { eligiblePublishedStory, planNewsSlots, canonicalNewsUrl } from '../../../server/utils/socialNewsAutopostPlan'

const now = new Date('2026-10-02T06:00:00Z')
const story = { id: 'story-1', slug: 'a-new-car-story', title: 'New car announced', standfirst: 'The manufacturer has announced a new model.', status: 'published', publishedAt: '2026-10-02T05:00:00Z', image: { url: '/api/news/media/story-1', generated: true } }
const slot = { id: 'news', day_of_week: 5, time_of_day: '17:30:00', timezone: 'Australia/Melbourne', capacity: 1, platforms: ['facebook'], metadata: { contentKind: 'news' } }

describe('published-news intake', () => {
  it('creates attributed factual copy and preserves illustration disclosure', () => {
    const result = eligiblePublishedStory(story, now)!
    expect(result.url).toBe('https://driveagent.news/news/a-new-car-story')
    expect(result.mediaUrl).toBe('https://driveagent.news/api/news/media/story-1')
    expect(result.content).toContain(story.title)
    expect(result.content).toContain(story.standfirst)
    expect(result.content).toContain('2 October 2026')
    expect(result.content).toContain('AI-generated illustration')
  })
  it.each([
    { status: 'retracted' }, { archive: { kind: 'f1-backfill' } },
    { publishedAt: '2026-09-20T05:00:00Z' }, { publishedAt: '2026-10-03T05:00:00Z' },
    { publishedAt: 'invalid' }, { image: null }, { image: { url: 'https://evil.example/image.jpg' } },
    { slug: '../admin' }, { title: '' }, { id: null }
  ])('rejects ineligible source data %j', (patch) => {
    expect(eligiblePublishedStory({ ...story, ...patch }, now)).toBeNull()
  })
  it('deduplicates tracked and untracked article URLs', () => {
    expect(canonicalNewsUrl('https://driveagent.news/news/a-new-car-story?utm_source=facebook#top')).toBe('https://driveagent.news/news/a-new-car-story')
    expect(canonicalNewsUrl('https://other.example/news/a-new-car-story')).toBeNull()
  })
})

describe('news slot planning', () => {
  it('uses only news slots and respects occupied capacity', () => {
    const slots = [slot, { ...slot, id: 'sponsor', time_of_day: '16:30', metadata: { contentKind: 'sponsor' } }]
    expect(planNewsSlots(slots, [], now, 7).map(x => x.at)).toEqual(['2026-10-02T07:30:00.000Z'])
    expect(planNewsSlots(slots, [{ scheduled_at: '2026-10-02T07:30:00Z' }], now, 7)).toEqual([])
  })
  it('handles Melbourne daylight saving without changing local posting times', () => {
    const slots = [slot, { ...slot, id: 'sunday', day_of_week: 0 }]
    expect(planNewsSlots(slots, [], now, 7).map(x => x.at)).toEqual(['2026-10-02T07:30:00.000Z', '2026-10-04T06:30:00.000Z'])
  })
  it('leaves the occupied unit free only when capacity permits', () => {
    expect(planNewsSlots([{ ...slot, capacity: 2 }], [{ scheduled_at: '2026-10-02T07:30:00Z' }], now, 7)).toHaveLength(1)
  })
  it('does not double-count overlapping slot definitions', () => {
    expect(planNewsSlots([slot, { ...slot, id: 'duplicate' }], [], now, 7)).toHaveLength(1)
  })
  it('requires a future slot and a Facebook-compatible platform', () => {
    expect(planNewsSlots([{ ...slot, platforms: ['instagram'] }], [], now, 7)).toEqual([])
    expect(planNewsSlots([slot], [], new Date('2026-10-02T07:29:00Z'), 1)).toEqual([])
  })
})
