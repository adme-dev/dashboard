import { describe, expect, it, vi } from 'vitest'
import { recordSocialPublishingAudit, socialPublishingAuditParams } from '~~/server/utils/socialPublishing/audit'

describe('social publishing audit', () => {
  it('maps audit input to stable insert params', () => {
    expect(socialPublishingAuditParams({
      clientId: 'C1',
      postId: 'P1',
      socialAccountId: 'A1',
      actorId: 'U1',
      action: 'post_published',
      metadata: { status: 'published' }
    })).toEqual([
      'C1',
      'P1',
      'A1',
      'U1',
      'post_published',
      JSON.stringify({ status: 'published' })
    ])
  })

  it('does not throw when the audit write fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const write = vi.fn(async () => {
      throw new Error('db unavailable')
    })
    await expect(recordSocialPublishingAudit({
      clientId: 'C1',
      action: 'post_updated'
    }, write)).resolves.toBeUndefined()
    expect(write).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
})
