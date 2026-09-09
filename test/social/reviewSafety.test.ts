import { describe, expect, it, vi } from 'vitest'
import { googleBusinessProvider } from '~~/server/utils/social-providers/google-business'
import { resolveEffectiveMode, runAutomationForConversation } from '~~/server/utils/socialInbox/automation'
import type { AutomationRule, AutomationContext } from '~~/server/utils/socialInbox/automationTypes'

const rule: AutomationRule = { id: 'r', client_id: 'cl', name: 'Reviews', platform: 'google-business', channel_type: 'review', mode: 'autopilot', conditions: {}, action: {}, approval_by: 'staff', rate_limit: 10, confidence_floor: .8, business_hours: null, priority: 10, enabled: true }
const context: AutomationContext = { conversationId: 'c', clientId: 'cl', platform: 'google-business', channelType: 'review', rating: 5, inboundMessageId: 'm', inboundContent: 'Good service', participantName: 'Sam', now: new Date() }

describe('review automation safety', () => {
  it.each([1, 2, 3, null, 0, 6])('requires a human for rating %s', (rating) => {
    expect(resolveEffectiveMode(rule, { ...context, rating }, { reply: 'Thanks Sam', confidence: .99, risk: false }, { recentCount: 0 }).mode).toBe('approval')
  })
  it.each([4, 5])('allows a safe %s-star reply', (rating) => {
    expect(resolveEffectiveMode(rule, { ...context, rating }, { reply: 'Thanks Sam', confidence: .99, risk: false }, { recentCount: 0 }).mode).toBe('autopilot')
  })
  it.each([
    { first_response_at: new Date().toISOString(), platform_timestamp: new Date().toISOString() },
    { first_response_at: null, platform_timestamp: '2020-01-01T00:00:00Z' },
    { first_response_at: null, platform_timestamp: null },
  ])('does not draft or send for an answered or historical review: %j', async (data) => {
    const db = {
      queryOne: vi.fn(async (sql: string) => {
        if (sql.includes('FROM social_conversations')) return { id: 'c', client_id: 'cl', platform: 'google-business', channel_type: 'review', rating: 5, first_response_at: data.first_response_at }
        if (sql.includes('FROM social_messages')) return { id: 'm', content: 'Good', author_name: 'Sam', platform_timestamp: data.platform_timestamp }
        if (sql.includes('COUNT')) return { n: 0 }
        if (sql.includes('INSERT')) return { id: 'q' }
        return null
      }),
      queryRows: vi.fn(async () => [rule]), execute: vi.fn(async () => 1)
    }
    const deps = { generateDraft: vi.fn(async () => ({ reply: 'Thanks', confidence: .99, risk: false })), dispatch: vi.fn(async () => ({ ok: true })) }
    await runAutomationForConversation(db as any, deps, 'c')
    expect(deps.generateDraft).not.toHaveBeenCalled()
    expect(deps.dispatch).not.toHaveBeenCalled()
  })
})

describe('Google review sync diagnostics and identity', () => {
  it('retains the Google error reason and project without leaking the token', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({error: {
      message: 'Google My Business API is disabled in project 123', status: 'PERMISSION_DENIED',
      details: [{reason: 'SERVICE_DISABLED', metadata: {consumer: 'projects/123'}}]
    }}), {status:403}))
    try {
      await expect(googleBusinessProvider.fetchInbox!({accountId:'acc:loc',accessToken:'secret-token',channelType:'review'})).rejects.toThrow(/SERVICE_DISABLED.*project 123/)
    } finally { spy.mockRestore() }
  })
  it('builds a replyable review resource when Google only returns reviewId', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({reviews:[{reviewId:'r1',starRating:'FIVE'}]})))
    try {
      const res = await googleBusinessProvider.fetchInbox!({accountId:'acc:loc',accessToken:'AT',channelType:'review'})
      expect(res.items[0]?.platformConversationId).toBe('accounts/acc/locations/loc/reviews/r1')
    } finally { spy.mockRestore() }
  })
})


describe('Google review pagination', () => {
  it('checks newest reviews before continuing historical pages', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({reviews:[{reviewId:'new',starRating:'FIVE'}], nextPageToken:'page3'})))
      .mockResolvedValueOnce(new Response(JSON.stringify({reviews:[{reviewId:'old',starRating:'ONE'}], nextPageToken:'page4'})))
    try {
      const res = await googleBusinessProvider.fetchInbox!({accountId:'acc:loc',accessToken:'AT',channelType:'review',cursor:'page3'})
      expect(new URL(String(spy.mock.calls[0]![0])).searchParams.has('pageToken')).toBe(false)
      expect(new URL(String(spy.mock.calls[1]![0])).searchParams.get('pageToken')).toBe('page3')
      expect(res.items.map(i=>i.platformMessageId)).toEqual(['new','old'])
      expect(res.nextCursor).toBe('page4')
    } finally { spy.mockRestore() }
  })
  it('recovers an expired page token without dropping newest reviews', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({reviews:[{reviewId:'new'}],nextPageToken:'fresh-page2'})))
      .mockResolvedValueOnce(new Response('{}',{status:400}))
    try {
      const res = await googleBusinessProvider.fetchInbox!({accountId:'acc:loc',accessToken:'AT',channelType:'review',cursor:'expired'})
      expect(res.items[0]?.platformMessageId).toBe('new')
      expect(res.nextCursor).toBe('fresh-page2')
    } finally { spy.mockRestore() }
  })
})


it('advances from the first page to its returned backfill token on the next poll', async () => {
  const spy = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({reviews:[{reviewId:'new'}],nextPageToken:'page2'})))
    .mockResolvedValueOnce(new Response(JSON.stringify({reviews:[{reviewId:'new'}],nextPageToken:'page2'})))
    .mockResolvedValueOnce(new Response(JSON.stringify({reviews:[{reviewId:'old'}],nextPageToken:'page3'})))
  try {
    const args = {accountId:'acc:loc',accessToken:'AT',channelType:'review' as const}
    const first = await googleBusinessProvider.fetchInbox!(args)
    const second = await googleBusinessProvider.fetchInbox!({...args,cursor:first.nextCursor})
    expect(spy).toHaveBeenCalledTimes(3)
    expect(second.items.map(i=>i.platformMessageId)).toEqual(['new','old'])
    expect(second.nextCursor).toBe('page3')
  } finally { spy.mockRestore() }
})
