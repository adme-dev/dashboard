import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendCampaignChunk } from '../../server/utils/email-marketing/campaignSender'
import type { Campaign } from '../../server/utils/email-marketing/campaigns'

const mocks = vi.hoisted(() => ({ queryRows: vi.fn(), queryOne: vi.fn(), execute: vi.fn(), send: vi.fn(), secretReady: true, appUrlReady: true }))
vi.mock('../../server/utils/db', () => ({ queryRows: mocks.queryRows, queryOne: mocks.queryOne, execute: mocks.execute }))
vi.mock('../../server/utils/email', () => ({ isEmailConfigured: () => true, getResendClient: () => ({ batch: { send: mocks.send } }), getCachedBinding: () => undefined }))
vi.mock('../../server/utils/appUrl', () => ({ getAppUrl: () => {
  if (!mocks.appUrlReady) throw new Error('App URL unavailable')
  return 'https://app.example'
} }))
vi.mock('../../server/utils/email-marketing/links', async (original) => {
  const actual = await original<typeof import('../../server/utils/email-marketing/links')>()
  return { ...actual, emailLinkSecret: () => {
    if (!mocks.secretReady) throw new Error('EMAIL_LINK_SECRET is not configured')
    return actual.emailLinkSecret()
  } }
})
vi.mock('../../server/utils/crm/commsDb', () => ({ bridgeCommunication: vi.fn() }))
vi.mock('../../server/utils/email-marketing/campaigns', () => ({ getCampaign: vi.fn(), prepareCampaignHtmlForSend: vi.fn() }))
const campaign = {
  id: '11111111-1111-4111-8111-111111111111', status: 'sending', subject: 'Offer', preview_text: 'Latest offer', from_name: 'Agency', from_email: 'news@example.com', reply_to: null,
  body_html: '<a href="{{web_version_url}}">View online</a><a href="{{unsubscribe_url}}">Unsubscribe</a><footer>Agency, 1 Market Street, Melbourne VIC 3000</footer>', review_required: true, web_version_enabled: true
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.secretReady = true
  mocks.appUrlReady = true
  vi.stubEnv('EMAIL_SENDING_ENABLED', 'true')
  mocks.queryRows.mockResolvedValue([{ id: 'recipient-1', subscriber_id: '22222222-2222-4222-8222-222222222222', email: 'alex@example.com', name: 'Alex' }])
  mocks.queryOne.mockResolvedValue({ digest: 'a'.repeat(64) })
  mocks.execute.mockResolvedValue(0)
  mocks.send.mockResolvedValue({ data: { data: [{ id: 'provider-fixture-only' }] } })
})
afterEach(() => {
  vi.unstubAllEnvs()
})
describe('final web-version no-dispatch boundary (mocked provider and DB)', () => {
  it.each(['secretReady', 'appUrlReady'] as const)('releases claimed recipients on pre-provider runtime configuration loss: %s', async (setting) => {
    mocks[setting] = false
    await expect(sendCampaignChunk(campaign as Campaign)).rejects.toMatchObject({ statusCode: 422, statusMessage: 'campaign_final_content_blocked' })
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('claimed_at = NULL'), [['recipient-1']])
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('retains the disabled sender gate before claims or provider dispatch', async () => {
    vi.stubEnv('EMAIL_SENDING_ENABLED', 'false')
    await expect(sendCampaignChunk(campaign as Campaign)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'sending_disabled' })
    expect(mocks.queryRows).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it.each([{ review_required: false }, { web_version_enabled: false }, { status: 'draft' }])('releases claims and never dispatches an unavailable visible link: %j', async (patch) => {
    await expect(sendCampaignChunk({ ...campaign, ...patch } as Campaign)).rejects.toMatchObject({ statusCode: 422, statusMessage: 'campaign_final_content_blocked' })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('claimed_at = NULL'), [['recipient-1']])
  })
  it('refuses an enabled gated campaign if its frozen digest cannot be read', async () => {
    mocks.queryOne.mockResolvedValue(null)
    await expect(sendCampaignChunk(campaign as Campaign)).rejects.toMatchObject({ statusCode: 422 })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('claimed_at = NULL'), [['recipient-1']])
  })
  it('delivers the server-issued frozen link on an enabled gated campaign and preserves unsubscribe', async () => {
    const result = await sendCampaignChunk(campaign as Campaign)
    expect(result.sent).toBe(1)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    const html = mocks.send.mock.calls[0]![0][0].html as string
    expect(html).toContain('https://app.example/email/view?c=11111111-1111-4111-8111-111111111111&amp;v=' + 'a'.repeat(64) + '&amp;t=')
    expect(html).toContain('/email/unsubscribe?')
    expect(html).not.toContain('{{')
    expect(html).not.toContain('/email/click?')
  })
})
