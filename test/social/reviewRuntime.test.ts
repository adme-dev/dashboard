import { afterEach, describe, expect, it, vi } from 'vitest'
import { setCfBindings } from '~~/server/utils/email'
import { isSocialAutomationEnabled } from '~~/server/utils/socialInbox/automationGate'
import { isSocialUserContentEnabled } from '~~/server/utils/socialOAuth/meta'
import { sendReviewAlertEmail } from '~~/server/utils/socialInbox/reviewAlertEmail'

afterEach(() => { setCfBindings({}); vi.unstubAllEnvs() })

describe('review runtime configuration', () => {
  it('reads Cloudflare bindings for automation and approved Meta permissions', () => {
    vi.stubEnv('SOCIAL_AUTOMATION_ENABLED', 'false')
    vi.stubEnv('SOCIAL_USER_CONTENT_ENABLED', 'false')
    setCfBindings({SOCIAL_AUTOMATION_ENABLED:'true',SOCIAL_USER_CONTENT_ENABLED:'true'})
    expect(isSocialAutomationEnabled()).toBe(true)
    expect(isSocialUserContentEnabled()).toBe(true)
    setCfBindings({SOCIAL_AUTOMATION_ENABLED:'false',SOCIAL_USER_CONTENT_ENABLED:'false'})
    expect(isSocialAutomationEnabled()).toBe(false)
    expect(isSocialUserContentEnabled()).toBe(false)
  })
  it('does not deliver review emails until recipients are explicitly configured', async () => {
    vi.stubEnv('SOCIAL_REVIEW_ALERT_EMAILS','')
    setCfBindings({})
    expect(await sendReviewAlertEmail({id:'c',client_id:'cl',account_name:'Dealer',rating:3})).toBe(false)
  })
})
