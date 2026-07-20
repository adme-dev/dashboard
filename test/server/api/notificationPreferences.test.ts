import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockReadBody = vi.fn()

;(globalThis as typeof globalThis & { readBody: typeof mockReadBody }).readBody = mockReadBody

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: getPreferences } = await import(
  '../../../server/api/notifications/preferences.get'
)
const { default: updatePreferences } = await import(
  '../../../server/api/notifications/preferences.put'
)

describe('notification preferences API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({
      notification_preferences: {},
      auto_subscribe_on_participation: false,
      quiet_hours: null,
      auto_ack_assignments: false
    })
  })

  it('defaults every user-controllable notification and auto-watch to off', async () => {
    mockQueryOne.mockResolvedValue({
      notification_preferences: {},
      auto_subscribe_on_participation: null,
      quiet_hours: null,
      auto_ack_assignments: false
    })

    const result = await getPreferences({} as never)

    expect(Object.values(result.preferences)).not.toContain(true)
    expect(result.autoSubscribeOnParticipation).toBe(false)
  })

  it('preserves a user\'s explicit opt-ins', async () => {
    mockQueryOne.mockResolvedValue({
      notification_preferences: {
        email_task_assigned: true,
        inapp_task_assigned: true
      },
      auto_subscribe_on_participation: true,
      quiet_hours: null,
      auto_ack_assignments: false
    })

    const result = await getPreferences({} as never)

    expect(result.preferences.email_task_assigned).toBe(true)
    expect(result.preferences.inapp_task_assigned).toBe(true)
    expect(result.preferences.email_task_mentioned).toBe(false)
    expect(result.autoSubscribeOnParticipation).toBe(true)
  })

  it('patches notification JSON atomically without a read-modify-write query', async () => {
    mockReadBody.mockResolvedValue({
      preferences: { email_task_assigned: true }
    })

    await updatePreferences({} as never)

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(notification_preferences, '{}'::jsonb) || $2::jsonb"),
      ['user-1', JSON.stringify({ email_task_assigned: true })]
    )
  })

  it('does not rewrite notification JSON for an auto-watch-only update', async () => {
    mockReadBody.mockResolvedValue({ autoSubscribeOnParticipation: true })

    await updatePreferences({} as never)

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockQueryOne.mock.calls[0]?.[0]).not.toContain('notification_preferences =')
  })
})
