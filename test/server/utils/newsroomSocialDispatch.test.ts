import { beforeEach, expect, it, vi } from 'vitest'
import { claimAndPublishSocialPost } from '../../../server/utils/socialPublishing/dispatch'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn(), execute: vi.fn(), publish: vi.fn(), source: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne, queryRows: mocks.queryRows, execute: mocks.execute, transaction: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing', () => ({ publishPost: mocks.publish }))
vi.mock('~~/server/utils/newsroomSocialSource', () => ({ verifyNewsroomSource: mocks.source }))
vi.mock('~~/server/utils/socialNewsAutopostSource', () => ({ verifyAutomaticNewsSource: async () => 'ready' }))
vi.mock('~~/server/utils/socialPublishing/audit', () => ({ recordSocialPublishingAudit: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryOne.mockResolvedValue({ id: 'p1', client_id: 'c1', created_by: 'driveagent-newsroom' })
  mocks.source.mockResolvedValue('blocked')
})
it('holds a claimed newsroom post before provider calls when current source or approval is invalid', async () => {
  const result = await claimAndPublishSocialPost({ postId: 'p1', claimStatuses: ['scheduled'], source: 'cron' })
  expect(result).toMatchObject({ skipped: true, reason: 'newsroom_approval_invalid' })
  expect(mocks.publish).not.toHaveBeenCalled()
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('status=\'failed\''), ['p1', 'c1'])
})
