import { describe, it, expect } from 'vitest'
import { buildDraftPrompt, parseDraftResponse } from '~~/server/utils/socialInbox/aiDraft'
import type { AutomationContext } from '~~/server/utils/socialInbox/automationTypes'

const ctx: AutomationContext = {
  conversationId: 'c1', clientId: 'cl1', platform: 'instagram', channelType: 'comment',
  rating: null, inboundMessageId: 'm1', inboundContent: 'do you ship to Perth?',
  participantName: 'Jo', now: new Date('2026-06-01T03:00:00Z'),
}

describe('buildDraftPrompt', () => {
  it('includes the inbound content, platform, and participant', () => {
    const p = buildDraftPrompt(ctx, 'Be warm and concise. Brand: Acme.')
    expect(p).toContain('do you ship to Perth?')
    expect(p).toContain('instagram')
    expect(p).toContain('Jo')
    expect(p).toContain('Acme')
  })
  it('asks for strict JSON output', () => {
    expect(buildDraftPrompt(ctx, '')).toMatch(/json/i)
  })
})

describe('parseDraftResponse — fail-safe', () => {
  it('parses clean JSON', () => {
    const r = parseDraftResponse('{"reply":"Yes, we ship Australia-wide!","confidence":0.9,"risk":false}')
    expect(r).toEqual({ reply: 'Yes, we ship Australia-wide!', confidence: 0.9, risk: false })
  })
  it('extracts JSON embedded in prose / code fences', () => {
    const r = parseDraftResponse('Sure:\n```json\n{"reply":"Hi","confidence":0.8,"risk":false}\n```')
    expect(r.reply).toBe('Hi')
    expect(r.confidence).toBe(0.8)
  })
  it('clamps confidence to 0..1', () => {
    expect(parseDraftResponse('{"reply":"x","confidence":5,"risk":false}').confidence).toBe(1)
    expect(parseDraftResponse('{"reply":"x","confidence":-2,"risk":false}').confidence).toBe(0)
  })
  it('unparseable → fail safe (empty reply, confidence 0, risk true)', () => {
    expect(parseDraftResponse('the model rambled with no json')).toEqual({ reply: '', confidence: 0, risk: true })
  })
  it('missing reply → fail safe', () => {
    expect(parseDraftResponse('{"confidence":0.9,"risk":false}').reply).toBe('')
    expect(parseDraftResponse('{"confidence":0.9,"risk":false}').confidence).toBe(0)
  })
})
