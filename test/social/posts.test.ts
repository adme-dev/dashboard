import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string>, params?: Record<string, string>, body?: unknown }
interface TestGlobal {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
type TestHandler<T = unknown> = (event: TestEvent) => Promise<T>

const g = globalThis as typeof globalThis & TestGlobal
g.defineEventHandler = <T>(fn: T) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: { statusCode: number, statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockRequireSocialClientAccess = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireRole: (...a: unknown[]) => mockRequireRole(...a)
}))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  execute: (...a: unknown[]) => mockExecute(...a)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a)
}))

const { default: createHandler } = await import('../../server/api/agency/social/publishing/posts/index.post')
const { default: listHandler } = await import('../../server/api/agency/social/publishing/posts/index.get')
const { default: getHandler } = await import('../../server/api/agency/social/publishing/posts/[id]/index.get')
const { default: patchHandler } = await import('../../server/api/agency/social/publishing/posts/[id]/index.patch')
const { default: deleteHandler } = await import('../../server/api/agency/social/publishing/posts/[id]/index.delete')
const createH = createHandler as TestHandler
const listH = listHandler as TestHandler
const getH = getHandler as TestHandler
const patchH = patchHandler as TestHandler
const delH = deleteHandler as TestHandler

describe('publishing posts CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'U1' })
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({ id: 'P1' })
    mockExecute.mockResolvedValue(1)
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('creates a draft, serializing platform_overrides as jsonb and ignoring caller status', async () => {
    const event = {
      body: {
        clientId: 'C1',
        content: 'hi',
        status: 'approved',
        platforms: ['facebook'],
        platformOverrides: { instagram: { content: 'IG' } }
      }
    }
    await createH(event)
    const [, params] = mockQueryOne.mock.calls[0]
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(params[0]).toBe('C1') // client_id
    expect(params[1]).toBe('U1') // created_by
    expect(params[9]).toBe(JSON.stringify({ instagram: { content: 'IG' } })) // platform_overrides
    expect(params[13]).toBe('draft') // status is server-owned
  })

  it('rejects create without clientId', async () => {
    await expect(createH({ body: {} })).rejects.toThrow('clientId required')
  })

  it('rejects unsupported publish platforms at create', async () => {
    await expect(createH({ body: { clientId: 'C1', platforms: ['mastodon'] } }))
      .rejects.toThrow('Unsupported platform')
  })

  it('rejects planned publishing platforms at create until onboarding is production-ready', async () => {
    await expect(createH({ body: { clientId: 'C1', platforms: ['youtube'] } }))
      .rejects.toThrow('YouTube publishing is not production-ready')
    await expect(createH({
      body: {
        clientId: 'C1',
        targets: [{ platform: 'linkedin', accountId: 'A1' }]
      }
    })).rejects.toThrow('LinkedIn publishing is not production-ready')
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('rejects selected accounts that are inactive, cross-client, or not selected-platform accounts', async () => {
    mockQueryRows.mockResolvedValueOnce([])
    await expect(createH({ body: { clientId: 'C1', platforms: ['facebook'], accountIds: ['A1'] } }))
      .rejects.toThrow('Invalid publishing account')
  })

  it('rejects selected accounts that require reconnect before publishing', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      id: 'A1',
      platform: 'facebook',
      is_active: true,
      last_error: null,
      token_expires_at: '2026-01-01T00:00:00.000Z',
      has_refresh_token: false,
      metadata: {}
    }])
    await expect(createH({ body: { clientId: 'C1', platforms: ['facebook'], accountIds: ['A1'] } }))
      .rejects.toThrow('Publishing account requires reconnect')
  })

  it('accepts selected accounts with non-publishing operational attention', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      id: 'A1',
      platform: 'facebook',
      is_active: true,
      last_error: 'webhook subscribe failed: timeout',
      token_expires_at: '2026-12-01T00:00:00.000Z',
      has_refresh_token: false,
      metadata: { webhook_subscribed: false }
    }])
    await createH({ body: { clientId: 'C1', content: 'ok', platforms: ['facebook'], accountIds: ['A1'] } })
    const [, params] = mockQueryOne.mock.calls[0]
    expect(params[8]).toEqual(['A1'])
  })

  it('rejects invalid scheduledAt values at create', async () => {
    await expect(createH({ body: { clientId: 'C1', platforms: ['facebook'], scheduledAt: 'tomorrow' } }))
      .rejects.toThrow('scheduledAt must be a valid ISO datetime')
  })

  it('rejects invalid or oversized media URLs at create', async () => {
    await expect(createH({ body: { clientId: 'C1', platforms: ['facebook'], mediaUrls: ['not-a-url'] } }))
      .rejects.toThrow('Invalid media URL')

    await expect(createH({
      body: {
        clientId: 'C1',
        platforms: ['facebook'],
        mediaUrls: Array.from({ length: 11 }, (_, index) => `https://cdn.example.com/${index}.jpg`)
      }
    })).rejects.toThrow('mediaUrls can contain at most')
  })

  it('rejects malformed platform overrides at create', async () => {
    await expect(createH({
      body: {
        clientId: 'C1',
        platforms: ['facebook'],
        platformOverrides: { mastodon: { content: 'unsupported' } }
      }
    })).rejects.toThrow('Unsupported platform override')

    await expect(createH({
      body: {
        clientId: 'C1',
        platforms: ['facebook'],
        platformOverrides: { facebook: { unsupported: true } }
      }
    })).rejects.toThrow('Unsupported platform override field')
  })

  it('accepts bounded provider options inside platform overrides at create', async () => {
    const event = {
      body: {
        clientId: 'C1',
        platforms: ['instagram', 'google-business'],
        platformOverrides: {
          'instagram': { options: { type: 'reel', collaborators: ['creator_1'] } },
          'google-business': {
            options: {
              topicType: 'EVENT',
              callToAction: { actionType: 'LEARN_MORE', url: 'https://dealer.example.com/event' },
              event: { title: 'Open day', startDate: '2026-08-01', endDate: '2026-08-02' }
            }
          },
          'youtube': {
            options: {
              title: 'Walkaround',
              tags: ['new-arrivals', 'demo'],
              privacyStatus: 'unlisted',
              isShort: true
            }
          }
        }
      }
    }

    await createH(event)
    const [, params] = mockQueryOne.mock.calls[0]
    expect(JSON.parse(params[9])).toEqual({
      'instagram': { options: { type: 'reel', collaborators: ['creator_1'] } },
      'google-business': {
        options: {
          topicType: 'EVENT',
          callToAction: { actionType: 'LEARN_MORE', url: 'https://dealer.example.com/event' },
          event: { title: 'Open day', startDate: '2026-08-01', endDate: '2026-08-02' }
        }
      },
      'youtube': {
        options: {
          title: 'Walkaround',
          tags: ['new-arrivals', 'demo'],
          privacyStatus: 'unlisted',
          isShort: true
        }
      }
    })
  })

  it('accepts explicit publish targets at create and derives legacy platform/account arrays', async () => {
    mockQueryRows.mockResolvedValueOnce([
      { id: 'A1', platform: 'facebook' },
      { id: 'A2', platform: 'instagram' }
    ])
    const event = {
      body: {
        clientId: 'C1',
        content: 'targeted post',
        targets: [
          { platform: 'facebook', accountId: 'A1' },
          { platform: 'instagram', accountId: 'A2', options: { type: 'story' } }
        ]
      }
    }

    await createH(event)
    const [, params] = mockQueryOne.mock.calls[0]
    expect(params[7]).toEqual(['facebook', 'instagram'])
    expect(params[8]).toEqual(['A1', 'A2'])
    expect(JSON.parse(params[16])).toEqual([
      { platform: 'facebook', accountId: 'A1' },
      { platform: 'instagram', accountId: 'A2', options: { type: 'story' } }
    ])
  })

  it('lists with optional status filter + bounded limit', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'P1' }])
    const event = { query: { clientId: 'C1', status: 'scheduled', limit: '9999' } }
    await listH(event)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(sql).toContain('AND status = $2')
    expect(params).toEqual(['C1', 'scheduled', 500]) // limit clamped to 500
  })

  it('gets a post, 404 when missing', async () => {
    mockQueryOne.mockResolvedValueOnce(null)
    await expect(getH({ params: { id: 'P1' } })).rejects.toThrow('Post not found')
  })

  it('requires client access before returning a post', async () => {
    const event = { params: { id: 'P1' } }
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
    await getH(event)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
  })

  it('rejects patch attempts for server-owned approval/status fields', async () => {
    await expect(patchH({ params: { id: 'P1' }, body: { status: 'approved' } }))
      .rejects.toThrow('Cannot update controlled social post fields')
    await expect(patchH({ params: { id: 'P1' }, body: { approvedAt: new Date().toISOString() } }))
      .rejects.toThrow('Cannot update controlled social post fields')
  })

  it('patches only provided fields and serializes jsonb overrides', async () => {
    const event = { params: { id: 'P1' }, body: { content: 'new', platformOverrides: { linkedin: { content: 'LI' } } } }
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
    await patchH(event)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    const [sql, params] = mockQueryOne.mock.calls[1]
    expect(sql).toMatch(/content = \$1/)
    expect(sql).toMatch(/platform_overrides = \$2::jsonb/)
    expect(sql).toMatch(/WHERE id = \$3 AND client_id = \$4/)
    expect(sql).toMatch(/updated_at = NOW\(\)/)
    expect(params[1]).toBe(JSON.stringify({ linkedin: { content: 'LI' } }))
    expect(params[2]).toBe('P1')
    expect(params[3]).toBe('C1')
  })

  it('patches explicit publish targets and keeps derived arrays in sync', async () => {
    mockQueryRows.mockResolvedValueOnce([
      { id: 'A2', platform: 'instagram' }
    ])
    const event = {
      params: { id: 'P1' },
      body: { targets: [{ platform: 'instagram', accountId: 'A2', options: { type: 'reel' } }] }
    }
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })

    await patchH(event)
    const [sql, params] = mockQueryOne.mock.calls[1]
    expect(sql).toMatch(/platforms = \$1/)
    expect(sql).toMatch(/account_ids = \$2/)
    expect(sql).toMatch(/publish_targets = \$3::jsonb/)
    expect(params[0]).toEqual(['instagram'])
    expect(params[1]).toEqual(['A2'])
    expect(JSON.parse(params[2])).toEqual([{ platform: 'instagram', accountId: 'A2', options: { type: 'reel' } }])
  })

  it('rejects planned publishing platforms when patching targets or platforms', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'draft', platforms: ['facebook'], account_ids: [] })
    await expect(patchH({
      params: { id: 'P1' },
      body: { platforms: ['tiktok'] }
    })).rejects.toThrow('TikTok publishing is not production-ready')

    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'draft', platforms: ['facebook'], account_ids: [] })
    await expect(patchH({
      params: { id: 'P1' },
      body: { targets: [{ platform: 'youtube', accountId: 'A1' }] }
    })).rejects.toThrow('YouTube publishing is not production-ready')
  })

  it('validates scheduledAt, mediaUrls, and platformOverrides at patch', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
    await expect(patchH({ params: { id: 'P1' }, body: { scheduledAt: 'next week' } }))
      .rejects.toThrow('scheduledAt must be a valid ISO datetime')

    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
    await expect(patchH({ params: { id: 'P1' }, body: { mediaUrls: ['file.jpg'] } }))
      .rejects.toThrow('Invalid media URL')

    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
    await expect(patchH({
      params: { id: 'P1' },
      body: { platformOverrides: { facebook: { mediaUrls: ['file.jpg'] } } }
    })).rejects.toThrow('Invalid media URL')

    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
    await expect(patchH({
      params: { id: 'P1' },
      body: { platformOverrides: { youtube: { options: { privacyStatus: 'friends' } } } }
    })).rejects.toThrow('Invalid YouTube privacyStatus')
  })

  it('resets approval when approved post content changes', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'approved', approval_requested_at: null })
      .mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'draft' })
    await patchH({ params: { id: 'P1' }, body: { content: 'revised approved copy' } })
    const [sql] = mockQueryOne.mock.calls[1]
    expect(sql).toMatch(/status = 'draft'/)
    expect(sql).toMatch(/approved_by = NULL/)
    expect(sql).toMatch(/approved_at = NULL/)
    expect(sql).toMatch(/approval_requested_at = NULL/)
    expect(sql).toMatch(/approval_requested_by = NULL/)
  })

  it('rejects content edits for already-published posts', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1', status: 'published', approval_requested_at: null })
    await expect(patchH({ params: { id: 'P1' }, body: { content: 'too late' } }))
      .rejects.toThrow('Cannot edit content for a published post')
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
  })

  it('rejects an empty patch', async () => {
    await expect(patchH({ params: { id: 'P1' }, body: {} })).rejects.toThrow('No updatable fields')
  })

  it('deletes a post', async () => {
    const event = { params: { id: 'P1' } }
    mockQueryOne.mockResolvedValueOnce({ id: 'P1', client_id: 'C1' })
    const res = await delH(event)
    expect(res).toEqual({ ok: true })
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM social_posts WHERE id = $1 AND client_id = $2'),
      ['P1', 'C1']
    )
  })
})
