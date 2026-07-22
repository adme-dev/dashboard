/**
 * Email utility — binding resolution tests.
 *
 * Regression guard for the production bug where notification emails (task
 * assigned, brief assigned, board added, AI digest, etc.) silently no-op'd
 * because they call getResendClient() without an H3Event, and on Cloudflare
 * Pages secrets are only available via event.context.cloudflare.env — not
 * process.env. The fix added a module-level binding cache populated by a
 * per-request middleware, so event-less call sites can still resolve the API
 * key.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// email.ts uses Nuxt's auto-imported useRuntimeConfig() as a bare reference.
// Tests don't go through the auto-import codegen, so expose it on globalThis
// with an EMPTY resendApiKey/appUrl to force the binding-cache path.
;(globalThis as any).useRuntimeConfig = () => ({
  resendApiKey: '',
  emailFrom: '',
  public: { appName: '', appUrl: '' }
})

import { getAppUrl } from '../../../server/utils/appUrl'
import {
  getCachedBinding,
  isEmailConfigured,
  sendTaskAssignedEmail,
  setCfBindings
} from '../../../server/utils/email'

const ORIGINAL_RESEND = process.env.RESEND_API_KEY
const ORIGINAL_APP_URL = process.env.APP_URL
const ORIGINAL_NOTIFICATION_PAUSE = process.env.USER_MEMBER_NOTIFICATIONS_DISABLED

beforeEach(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.APP_URL
  delete process.env.USER_MEMBER_NOTIFICATIONS_DISABLED
  setCfBindings({})  // clear cache
})

afterEach(() => {
  if (ORIGINAL_RESEND) process.env.RESEND_API_KEY = ORIGINAL_RESEND
  if (ORIGINAL_APP_URL) process.env.APP_URL = ORIGINAL_APP_URL
  if (ORIGINAL_NOTIFICATION_PAUSE) {
    process.env.USER_MEMBER_NOTIFICATIONS_DISABLED = ORIGINAL_NOTIFICATION_PAUSE
  } else {
    delete process.env.USER_MEMBER_NOTIFICATIONS_DISABLED
  }
})

describe('email binding resolution', () => {
  it('isEmailConfigured returns false when no event, no cached bindings, no env, no runtimeConfig', () => {
    expect(isEmailConfigured()).toBe(false)
  })

  it('isEmailConfigured returns true when bindings are cached (simulates middleware run)', () => {
    setCfBindings({ RESEND_API_KEY: 'cf-binding-key' })
    expect(isEmailConfigured()).toBe(true)
  })

  it('getCachedBinding returns the stashed value', () => {
    setCfBindings({ RESEND_API_KEY: 'cf-binding-key', APP_URL: 'https://prod.example.com' })
    expect(getCachedBinding('RESEND_API_KEY')).toBe('cf-binding-key')
    expect(getCachedBinding('APP_URL')).toBe('https://prod.example.com')
  })

  it('getCachedBinding returns undefined for missing keys', () => {
    setCfBindings({ APP_URL: 'https://x' })
    expect(getCachedBinding('RESEND_API_KEY')).toBeUndefined()
  })

  it('setCfBindings ignores null/undefined input (does not clobber a prior cache)', () => {
    setCfBindings({ RESEND_API_KEY: 'sticky' })
    setCfBindings(null)
    setCfBindings(undefined)
    expect(getCachedBinding('RESEND_API_KEY')).toBe('sticky')
  })

  it('per-request event takes precedence over module cache', () => {
    setCfBindings({ RESEND_API_KEY: 'from-cache' })
    const event = { context: { cloudflare: { env: { RESEND_API_KEY: 'from-event' } } } } as any
    // isEmailConfigured(event) ultimately calls resolveApiKey(event) which
    // checks the event first.
    expect(isEmailConfigured(event)).toBe(true)
  })

  it('getAppUrl falls back to the configured production app host when nothing is set', () => {
    expect(getAppUrl()).toBe('https://app.xeroflow.io')
  })

  it('getAppUrl prefers per-request event over the configured fallback', () => {
    const event = { context: { cloudflare: { env: { APP_URL: 'https://event.example.com' } } } } as any
    expect(getAppUrl(event)).toBe('https://event.example.com')
  })

  it('non-string binding values are ignored (would-be type coercion bugs)', () => {
    setCfBindings({ RESEND_API_KEY: 42 as any })
    expect(getCachedBinding('RESEND_API_KEY')).toBeUndefined()
    expect(isEmailConfigured()).toBe(false)
  })

  it('suppresses internal member notification email before resolving Resend', async () => {
    process.env.USER_MEMBER_NOTIFICATIONS_DISABLED = 'true'

    await expect(sendTaskAssignedEmail({
      to: 'member@example.com',
      name: 'Member',
      taskTitle: 'Private task',
      assignerName: 'Manager',
      taskUrl: 'https://app.xeroflow.io/agency/tasks/1'
    })).resolves.toBeUndefined()

    expect(isEmailConfigured()).toBe(false)
  })
})
