import { describe, expect, it } from 'vitest'
import {
  buildEmailBuilderScheduleRequest,
  extractEmailBuilderScheduleError,
  isEmailBuilderScheduleBlocked,
  shouldDisableEmailBuilderScheduleAction,
  validateEmailBuilderScheduleAt
} from '~~/app/utils/emailBuilderSchedule'

describe('buildEmailBuilderScheduleRequest', () => {
  it('routes campaign scheduling through the campaign patch endpoint', () => {
    expect(buildEmailBuilderScheduleRequest({
      campaignId: 'camp-1',
      scheduledAt: '2026-06-06T00:00:00.000Z'
    })).toEqual({
      url: '/api/email/campaigns/camp-1',
      body: { scheduled_at: '2026-06-06T00:00:00.000Z' }
    })
  })
})

describe('extractEmailBuilderScheduleError', () => {
  it('extracts blocked preflight and recipient snapshot details from schedule failures', () => {
    const result = extractEmailBuilderScheduleError({
      data: {
        statusMessage: 'campaign_preflight_blocked',
        data: {
          preflight: {
            ok: false,
            blocked: true,
            checks: [
              { code: 'sender', label: 'Sender', status: 'blocked', message: 'Missing sender email' }
            ]
          },
          recipientSnapshot: {
            toSend: 24,
            excludedSuppressed: 3
          }
        }
      }
    })

    expect(result.message).toBe('campaign_preflight_blocked')
    expect(result.preflight?.blocked).toBe(true)
    expect(result.preflight?.checks[0]?.message).toBe('Missing sender email')
    expect(result.recipientSnapshot?.toSend).toBe(24)
    expect(result.recipientSnapshot?.excludedSuppressed).toBe(3)
  })
})

describe('isEmailBuilderScheduleBlocked', () => {
  it('treats blocked preflight state as a disabled schedule action', () => {
    expect(isEmailBuilderScheduleBlocked({
      ok: false,
      blocked: true,
      checks: [
        { code: 'sender', status: 'blocked', message: 'Missing sender' }
      ]
    })).toBe(true)
    expect(isEmailBuilderScheduleBlocked({
      ok: true,
      blocked: false,
      checks: [
        { code: 'html_size', status: 'warning', message: 'Large HTML' }
      ]
    })).toBe(false)
    expect(isEmailBuilderScheduleBlocked(null)).toBe(false)
  })
})

describe('validateEmailBuilderScheduleAt', () => {
  const now = new Date('2026-06-06T10:00:00.000Z')

  it('requires a valid future schedule time before the builder calls the API', () => {
    expect(validateEmailBuilderScheduleAt('', now)).toBe('Choose a send time.')
    expect(validateEmailBuilderScheduleAt('not-a-date', now)).toBe('Choose a valid send time.')
    expect(validateEmailBuilderScheduleAt('2026-06-06T09:59:59.999Z', now)).toBe('Choose a future send time.')
    expect(validateEmailBuilderScheduleAt('2026-06-06T10:00:00.000Z', now)).toBe('Choose a future send time.')
    expect(validateEmailBuilderScheduleAt('2026-06-06T10:00:01.000Z', now)).toBeNull()
  })
})

describe('shouldDisableEmailBuilderScheduleAction', () => {
  it('disables scheduling from the builder whenever preflight has a blocked check', () => {
    expect(shouldDisableEmailBuilderScheduleAction({
      ok: false,
      blocked: false,
      checks: [
        { code: 'sender', status: 'blocked', message: 'Missing sender' }
      ]
    })).toBe(true)

    expect(shouldDisableEmailBuilderScheduleAction({
      ok: true,
      blocked: false,
      checks: [
        { code: 'html_size', status: 'warning', message: 'Large HTML' }
      ]
    })).toBe(false)
  })

  it('disables scheduling from the builder until the send time is valid and in the future', () => {
    const now = new Date('2026-06-06T10:00:00.000Z')
    const readyPreflight = {
      ok: true,
      blocked: false,
      checks: []
    }

    expect(shouldDisableEmailBuilderScheduleAction(readyPreflight, '', now)).toBe(true)
    expect(shouldDisableEmailBuilderScheduleAction(readyPreflight, 'not-a-date', now)).toBe(true)
    expect(shouldDisableEmailBuilderScheduleAction(readyPreflight, '2026-06-06T10:00:00.000Z', now)).toBe(true)
    expect(shouldDisableEmailBuilderScheduleAction(readyPreflight, '2026-06-06T10:00:01.000Z', now)).toBe(false)
  })
})
