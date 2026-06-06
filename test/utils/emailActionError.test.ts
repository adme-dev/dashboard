import { describe, expect, it } from 'vitest'
import { describeEmailActionError } from '~~/app/utils/emailActionError'

describe('describeEmailActionError', () => {
  it('uses the response message or status message before falling back', () => {
    expect(describeEmailActionError({
      data: { message: 'campaign_not_sendable', statusMessage: 'ignored' }
    })).toBe('campaign_not_sendable')

    expect(describeEmailActionError({
      data: { statusMessage: 'campaign_not_found' }
    })).toBe('campaign_not_found')
  })

  it('surfaces validation issue details from invalid action payloads', () => {
    expect(describeEmailActionError({
      data: {
        statusMessage: 'invalid_body',
        data: [
          { message: 'Campaign ID is required.' },
          { message: 'Unsupported campaign status.' }
        ]
      }
    })).toBe('invalid_body: Campaign ID is required.; Unsupported campaign status.')
  })

  it('uses a caller supplied fallback when the error has no message', () => {
    expect(describeEmailActionError({}, 'Could not pause campaign.')).toBe('Could not pause campaign.')
  })
})
