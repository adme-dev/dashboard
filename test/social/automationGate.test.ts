import { describe, it, expect, afterEach } from 'vitest'
import { isSocialAutomationEnabled } from '~~/server/utils/socialInbox/automationGate'

const original = process.env.SOCIAL_AUTOMATION_ENABLED
afterEach(() => { process.env.SOCIAL_AUTOMATION_ENABLED = original })

describe('isSocialAutomationEnabled', () => {
  it('false when unset', () => {
    delete process.env.SOCIAL_AUTOMATION_ENABLED
    expect(isSocialAutomationEnabled()).toBe(false)
  })
  it('false for any value other than the exact string "true"', () => {
    for (const v of ['', '1', 'yes', 'TRUE', 'on']) {
      process.env.SOCIAL_AUTOMATION_ENABLED = v
      expect(isSocialAutomationEnabled(), v).toBe(false)
    }
  })
  it('true only for exactly "true"', () => {
    process.env.SOCIAL_AUTOMATION_ENABLED = 'true'
    expect(isSocialAutomationEnabled()).toBe(true)
  })
})
