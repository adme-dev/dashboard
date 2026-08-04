import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'

const createEvent = (binding?: unknown) => ({
  context: binding === undefined
    ? {}
    : { cloudflare: { env: { GOD_MODE_DISABLED: binding } } }
}) as any

describe('resolveGodModeAuthority', () => {
  const queryOneFresh = vi.fn()
  const diagnostic = vi.fn()

  const resolve = (event: any, actorUserId: string, options: { processValue?: unknown } = {}) =>
    resolveGodModeAuthority(event, actorUserId, {
      queryOneFresh,
      processEnv: options.processValue === undefined ? {} : { GOD_MODE_DISABLED: options.processValue },
      diagnostic
    } as any)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grants authority only when a fresh lookup finds the authenticated active owner', async () => {
    queryOneFresh.mockResolvedValue({ id: OWNER_ID })

    await expect(resolve(createEvent(), OWNER_ID)).resolves.toEqual({
      active: true,
      actorUserId: OWNER_ID,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    expect(queryOneFresh).toHaveBeenCalledWith(
      expect.stringContaining("user_role = 'owner'"),
      [OWNER_ID]
    )
  })

  it.each([
    ['inactive owner'],
    ['downgraded owner'],
    ['admin'],
    ['member'],
    ['missing member']
  ])('denies %s when the fresh active-owner lookup finds no row', async () => {
    queryOneFresh.mockResolvedValue(null)

    await expect(resolve(createEvent(), OWNER_ID)).resolves.toEqual({
      active: false,
      actorUserId: OWNER_ID,
      reason: 'inactive_or_missing',
      emergencyDisabled: false
    })
  })

  it('denies malformed actor IDs before querying, including the cron actor', async () => {
    await expect(resolve(createEvent(), 'cron')).resolves.toMatchObject({
      active: false,
      reason: 'inactive_or_missing'
    })
    await expect(resolve(createEvent(), 'not-a-uuid')).resolves.toMatchObject({
      active: false,
      reason: 'inactive_or_missing'
    })
    expect(queryOneFresh).not.toHaveBeenCalled()
  })

  it('fails closed when fresh authority verification cannot reach the database', async () => {
    queryOneFresh.mockRejectedValue(new Error('database unavailable'))

    await expect(resolve(createEvent(), OWNER_ID)).resolves.toEqual({
      active: false,
      actorUserId: OWNER_ID,
      reason: 'verification_failed',
      emergencyDisabled: false
    })
  })

  it('does not grant authority from client-provided role, email, reason, or config fields', async () => {
    queryOneFresh.mockResolvedValue(null)
    const event = createEvent()
    event.context.authenticatedUser = {
      id: MEMBER_ID,
      role: 'owner',
      email: 'owner@example.com',
      godMode: { active: true, reason: 'active_owner' },
      config: { GOD_MODE_DISABLED: 'false' }
    }

    await expect(resolve(event, MEMBER_ID)).resolves.toMatchObject({
      active: false,
      actorUserId: MEMBER_ID,
      reason: 'inactive_or_missing'
    })
  })

  it('denies immediately when the Cloudflare request binding is true', async () => {
    await expect(resolve(createEvent('true'), OWNER_ID)).resolves.toEqual({
      active: false,
      actorUserId: OWNER_ID,
      reason: 'emergency_disabled',
      emergencyDisabled: true
    })
    expect(queryOneFresh).not.toHaveBeenCalled()
  })

  it('allows a Cloudflare false binding to continue to fresh owner verification', async () => {
    queryOneFresh.mockResolvedValue({ id: OWNER_ID })

    await expect(resolve(createEvent('false'), OWNER_ID)).resolves.toMatchObject({
      active: true,
      emergencyDisabled: false
    })
  })

  it('fails closed for a malformed non-empty Cloudflare emergency binding without logging its value', async () => {
    await expect(resolve(createEvent('unexpected-value'), OWNER_ID)).resolves.toMatchObject({
      active: false,
      reason: 'emergency_disabled',
      emergencyDisabled: true
    })
    expect(queryOneFresh).not.toHaveBeenCalled()
    expect(diagnostic).toHaveBeenCalledTimes(1)
    expect(diagnostic.mock.calls.flat().join(' ')).not.toContain('unexpected-value')
  })

  it('uses the process fallback only when the Cloudflare request binding is absent', async () => {
    await expect(resolve(createEvent(), OWNER_ID, { processValue: 'true' })).resolves.toMatchObject({
      active: false,
      reason: 'emergency_disabled',
      emergencyDisabled: true
    })
    expect(queryOneFresh).not.toHaveBeenCalled()
  })

  it('lets the Cloudflare request binding override a conflicting process fallback', async () => {
    queryOneFresh.mockResolvedValue({ id: OWNER_ID })

    await expect(resolve(createEvent('false'), OWNER_ID, { processValue: 'true' })).resolves.toMatchObject({
      active: true,
      emergencyDisabled: false
    })
  })

  it('coalesces duplicate active-owner lookups for one actor within one event', async () => {
    queryOneFresh.mockResolvedValue({ id: OWNER_ID })
    const event = createEvent()

    const [first, second] = await Promise.all([
      resolve(event, OWNER_ID),
      resolve(event, OWNER_ID)
    ])

    expect(first.active).toBe(true)
    expect(second.active).toBe(true)
    expect(queryOneFresh).toHaveBeenCalledTimes(1)
  })

  it('keys event-local authority by actor ID so owner and member lookups cannot bleed', async () => {
    queryOneFresh.mockImplementation(async (_sql: string, [actorUserId]: [string]) =>
      actorUserId === OWNER_ID ? { id: OWNER_ID } : null
    )
    const event = createEvent()

    const owner = await resolve(event, OWNER_ID)
    const member = await resolve(event, MEMBER_ID)
    const ownerAgain = await resolve(event, OWNER_ID)

    expect(owner.active).toBe(true)
    expect(member.active).toBe(false)
    expect(ownerAgain.active).toBe(true)
    expect(queryOneFresh).toHaveBeenCalledTimes(2)
    expect(queryOneFresh.mock.calls.map(([, params]) => params)).toEqual([[OWNER_ID], [MEMBER_ID]])
  })

  it('does not reuse a member denial when an active owner is resolved next in the same event', async () => {
    queryOneFresh.mockImplementation(async (_sql: string, [actorUserId]: [string]) =>
      actorUserId === OWNER_ID ? { id: OWNER_ID } : null
    )
    const event = createEvent()

    const member = await resolve(event, MEMBER_ID)
    const owner = await resolve(event, OWNER_ID)

    expect(member).toMatchObject({
      active: false,
      actorUserId: MEMBER_ID,
      reason: 'inactive_or_missing'
    })
    expect(owner).toMatchObject({
      active: true,
      actorUserId: OWNER_ID,
      reason: 'active_owner'
    })
    expect(queryOneFresh).toHaveBeenCalledTimes(2)
    expect(queryOneFresh.mock.calls.map(([, params]) => params)).toEqual([[MEMBER_ID], [OWNER_ID]])
  })

  it('performs a new fresh lookup for the same actor in a separate event', async () => {
    queryOneFresh.mockResolvedValue({ id: OWNER_ID })

    await resolve(createEvent(), OWNER_ID)
    await resolve(createEvent(), OWNER_ID)

    expect(queryOneFresh).toHaveBeenCalledTimes(2)
  })
})
