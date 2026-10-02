import { describe, expect, it } from 'vitest'
import { prepareCampaignVideoPrompt } from '~~/app/utils/video/campaignPrompt'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'

const clientId = 'f7c142a6-a63f-4f75-90aa-700db68c1c76'
describe('campaign video prompt preparation', () => {
  it('keeps the reviewed client preset and selected guide rules with this campaign brief', () => {
    const result = prepareCampaignVideoPrompt({ brandName: 'DriveAgent', templatePrompt: 'Keep the approved wordmark unchanged.', brief: 'Introduce the connected dealership. Book a demo.', guideRules: 'Use restrained lime light trails.' })
    expect(result.error).toBeNull()
    expect(result.prompt).toContain('Keep the approved wordmark unchanged.')
    expect(result.prompt).toContain('Introduce the connected dealership. Book a demo.')
    expect(result.prompt).toContain('Use restrained lime light trails.')
    expect(result.prompt!.length).toBeLessThanOrEqual(2000)
  })
  it('requires a real campaign brief', () => {
    expect(prepareCampaignVideoPrompt({ brief: '   ' }).error).toBeTruthy()
  })
  it('rejects oversize prompts instead of silently truncating important rules', () => {
    const result = prepareCampaignVideoPrompt({ brief: 'Launch', templatePrompt: 'a'.repeat(1950), guideRules: 'Keep every title exactly unchanged.' })
    expect(result.prompt).toBeNull()
    expect(result.error).toContain('2,000')
  })
  it('also works for a client without a default motion preset or shared guide', () => {
    expect(prepareCampaignVideoPrompt({ brief: 'A steady camera with subtle road reflections.' }).prompt).toContain('A steady camera with subtle road reflections.')
  })
})
describe('saved campaign prompt timeline contract', () => {
  const draft = { clientId, brief: 'Book a demo', guideRules: 'Keep the logo readable', prompt: 'Animate the approved artwork.' }
  it('round trips a reviewed prompt without changing the timeline duration', () => {
    const state = TimelineStateSchema.parse({ campaign_prompt: draft })
    expect(state.campaign_prompt).toEqual(draft)
    expect(state.duration_sec).toBe(0)
  })
  it('leaves legacy timelines compatible', () => {
    expect(TimelineStateSchema.parse({}).campaign_prompt).toBeUndefined()
  })
  it('bounds persisted content and requires a client binding', () => {
    expect(TimelineStateSchema.safeParse({ campaign_prompt: { ...draft, prompt: 'x'.repeat(2001) } }).success).toBe(false)
    expect(TimelineStateSchema.safeParse({ campaign_prompt: { ...draft, clientId: '' } }).success).toBe(false)
  })
})
