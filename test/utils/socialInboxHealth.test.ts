import { describe, expect, it } from 'vitest'
import { getSocialInboxAccountHealthDisplay, getSocialInboxAccountIssueText } from '../../app/utils/socialInboxHealth'

describe('social inbox account health display', () => {
  it('maps account status to an operator-friendly badge', () => {
    expect(getSocialInboxAccountHealthDisplay('reauth')).toMatchObject({
      label: 'Reconnect required',
      color: 'error'
    })
  })

  it('prefers the stored account error when present', () => {
    expect(getSocialInboxAccountIssueText({
      status: 'attention',
      last_error: 'Meta token rejected',
      cursor_error_count: 2
    })).toBe('Meta token rejected')
  })

  it('falls back to cursor and status explanations', () => {
    expect(getSocialInboxAccountIssueText({
      status: 'attention',
      last_error: null,
      cursor_error_count: 2
    })).toBe('2 sync cursor issues')

    expect(getSocialInboxAccountIssueText({
      status: 'not_synced',
      last_error: null,
      cursor_error_count: 0
    })).toBe('This account has not completed an inbox sync yet.')
  })
})
