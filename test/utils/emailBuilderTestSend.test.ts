import { describe, expect, it } from 'vitest'
import {
  buildEmailBuilderTestSendRequest,
  describeEmailBuilderTestSendError
} from '~~/app/utils/emailBuilderTestSend'

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

describe('describeEmailBuilderTestSendError', () => {
  it('includes blocked preflight check messages from campaign test-send failures', () => {
    const message = describeEmailBuilderTestSendError({
      data: {
        statusMessage: 'campaign_preflight_blocked',
        data: {
          preflight: {
            checks: [
              { code: 'sender', label: 'Sender', status: 'blocked', message: 'Missing sender email' },
              { code: 'footer_identity', label: 'Footer identity', status: 'warning', message: 'Footer postal address is short' },
              { code: 'html_size', label: 'HTML size', status: 'pass', message: 'HTML size is within limits' }
            ]
          }
        }
      }
    })

    expect(message).toBe('campaign_preflight_blocked: Sender: Missing sender email; Footer identity: Footer postal address is short')
  })

  it('includes sendability errors from template test-send failures', () => {
    const message = describeEmailBuilderTestSendError({
      data: {
        statusMessage: 'sendability_failed',
        data: {
          errors: [
            { code: 'subject_missing', message: 'Subject line is required.' }
          ]
        }
      }
    })

    expect(message).toBe('sendability_failed: Subject line is required.')
  })
})
