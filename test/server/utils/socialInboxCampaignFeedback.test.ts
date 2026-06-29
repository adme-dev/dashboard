import { describe, expect, it } from 'vitest'
import {
  buildSocialCampaignFeedbackKey,
  isNegativeSocialFeedback,
  parseSocialCampaignFeedbackSummary,
  summarizeSocialCampaignFeedbackRows
} from '~~/server/utils/socialInbox/campaignFeedback'

describe('social inbox campaign feedback', () => {
  it('normalizes paid platform aliases into stable campaign feedback keys', () => {
    expect(buildSocialCampaignFeedbackKey({
      clientId: 'client-1',
      platform: 'facebook',
      campaignId: 'camp-1'
    })).toBe('client-1::meta::camp-1')

    expect(buildSocialCampaignFeedbackKey({
      clientId: 'client-1',
      platform: 'google',
      campaignId: 'camp-2'
    })).toBe('client-1::google_ads::camp-2')
  })

  it('treats negative sentiment and low reviews as negative campaign feedback', () => {
    expect(isNegativeSocialFeedback({ sentiment: '-0.4', rating: null })).toBe(true)
    expect(isNegativeSocialFeedback({ sentiment: 0.4, rating: 2 })).toBe(true)
    expect(isNegativeSocialFeedback({ sentiment: 0.2, rating: 5 })).toBe(false)
  })

  it('parses aggregated SQL feedback into a compact summary', () => {
    const summary = parseSocialCampaignFeedbackSummary({
      totalCount: '4',
      negativeCount: '2',
      latestAt: '2026-06-16T00:00:00.000Z',
      examples: JSON.stringify([
        {
          conversationId: 'conv-1',
          channelType: 'comment',
          preview: 'Not happy with this offer',
          sentiment: -0.8,
          lastMessageAt: '2026-06-16T00:00:00.000Z'
        },
        {
          conversationId: 'conv-2',
          channelType: 'review',
          preview: 'Great team',
          rating: 5,
          lastMessageAt: '2026-06-15T00:00:00.000Z'
        }
      ])
    })

    expect(summary).toEqual({
      totalCount: 4,
      negativeCount: 2,
      latestAt: '2026-06-16T00:00:00.000Z',
      examples: [
        {
          conversationId: 'conv-1',
          channelType: 'comment',
          preview: 'Not happy with this offer',
          permalink: null,
          sentiment: -0.8,
          rating: null,
          lastMessageAt: '2026-06-16T00:00:00.000Z'
        }
      ]
    })
  })

  it('groups raw conversation rows by client, normalized platform, and campaign id', () => {
    const summaries = summarizeSocialCampaignFeedbackRows([
      {
        conversation_id: 'conv-1',
        client_id: 'client-1',
        paid_media_platform: 'instagram',
        paid_media_campaign_id: 'camp-1',
        channel_type: 'comment',
        sentiment: -0.6,
        last_message_preview: 'This is poor',
        last_message_at: '2026-06-12T00:00:00.000Z'
      },
      {
        conversation_id: 'conv-2',
        client_id: 'client-1',
        paid_media_platform: 'meta',
        paid_media_campaign_id: 'camp-1',
        channel_type: 'review',
        rating: 5,
        last_message_preview: 'Excellent',
        last_message_at: '2026-06-13T00:00:00.000Z'
      }
    ])

    expect(summaries.get('client-1::meta::camp-1')).toMatchObject({
      totalCount: 2,
      negativeCount: 1,
      latestAt: '2026-06-13T00:00:00.000Z',
      examples: [{ conversationId: 'conv-1', preview: 'This is poor' }]
    })
  })
})
