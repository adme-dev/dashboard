import { describe, expect, it } from 'vitest'
import { buildEmailBuilderTestSendRequest } from '~~/app/utils/emailBuilderTestSend'

describe('buildEmailBuilderTestSendRequest', () => {
  it('routes campaign builder test sends through the campaign endpoint', () => {
    const bodySource = { root: { type: 'EmailLayout', data: { childrenIds: [] } } }

    expect(buildEmailBuilderTestSendRequest({
      campaignId: 'camp-1',
      to: '  buyer@example.com  ',
      subject: 'June offers',
      previewText: 'Preview copy',
      bodySource
    })).toEqual({
      url: '/api/email/campaigns/camp-1/test-send',
      body: { to: 'buyer@example.com' }
    })
  })

  it('keeps template builder test sends on the live editor document endpoint', () => {
    const bodySource = { root: { type: 'EmailLayout', data: { childrenIds: ['hero'] } } }

    expect(buildEmailBuilderTestSendRequest({
      campaignId: null,
      to: ' ',
      subject: '',
      previewText: 'Inbox copy',
      bodySource
    })).toEqual({
      url: '/api/email/templates/test-send',
      body: {
        to: null,
        subject: null,
        preview_text: 'Inbox copy',
        body_source: bodySource
      }
    })
  })
})
