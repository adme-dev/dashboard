import { describe, it, expect, afterEach } from 'vitest'
import {
  signEmailToken,
  verifyEmailToken,
  emailLinkSecret
} from '~~/server/utils/email-marketing/links'
import { setCfBindings } from '~~/server/utils/email'

const SECRET = 'test-secret-do-not-use-in-prod'

describe('signEmailToken', () => {
  it('produces a deterministic 32-char lowercase hex token', async () => {
    const a = await signEmailToken(SECRET, 'unsub', 'c1', 's1')
    const b = await signEmailToken(SECRET, 'unsub', 'c1', 's1')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
  })

  it('changes when any signed part changes', async () => {
    const base = await signEmailToken(SECRET, 'unsub', 'c1', 's1')
    expect(await signEmailToken(SECRET, 'unsub', 'c1', 's2')).not.toBe(base)
    expect(await signEmailToken(SECRET, 'unsub', 'c2', 's1')).not.toBe(base)
    expect(await signEmailToken('other-secret', 'unsub', 'c1', 's1')).not.toBe(base)
  })

  it('is purpose-scoped — same parts, different purpose, different token', async () => {
    const unsub = await signEmailToken(SECRET, 'unsub', 's1', 'l1')
    const confirm = await signEmailToken(SECRET, 'confirm', 's1', 'l1')
    expect(unsub).not.toBe(confirm)
  })
})

describe('verifyEmailToken', () => {
  it('accepts a freshly-signed token (round trip)', async () => {
    const t = await signEmailToken(SECRET, 'unsub', 'c1', 's1')
    expect(await verifyEmailToken(SECRET, t, 'unsub', 'c1', 's1')).toBe(true)
  })

  it('rejects a tampered token', async () => {
    const t = await signEmailToken(SECRET, 'unsub', 'c1', 's1')
    const tampered = t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a')
    expect(await verifyEmailToken(SECRET, tampered, 'unsub', 'c1', 's1')).toBe(false)
  })

  it('rejects a token signed for different parts (IDOR guard)', async () => {
    const t = await signEmailToken(SECRET, 'unsub', 'c1', 's1')
    expect(await verifyEmailToken(SECRET, t, 'unsub', 'c1', 's2')).toBe(false)
  })

  it('rejects a token used for the wrong purpose', async () => {
    const t = await signEmailToken(SECRET, 'unsub', 's1', 'l1')
    expect(await verifyEmailToken(SECRET, t, 'confirm', 's1', 'l1')).toBe(false)
  })

  it('rejects an empty / missing token', async () => {
    expect(await verifyEmailToken(SECRET, '', 'unsub', 'c1', 's1')).toBe(false)
    // @ts-expect-error — guarding the runtime null path
    expect(await verifyEmailToken(SECRET, null, 'unsub', 'c1', 's1')).toBe(false)
  })

  it('rejects a wrong-length token without throwing', async () => {
    expect(await verifyEmailToken(SECRET, 'abc', 'unsub', 'c1', 's1')).toBe(false)
  })
})

describe('emailLinkSecret', () => {
  const saved = { link: process.env.EMAIL_LINK_SECRET, cron: process.env.CRON_SECRET }
  afterEach(() => {
    if (saved.link === undefined) delete process.env.EMAIL_LINK_SECRET
    else process.env.EMAIL_LINK_SECRET = saved.link
    if (saved.cron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved.cron
    setCfBindings({}) // reset the module binding cache between tests
  })

  it('prefers process.env.EMAIL_LINK_SECRET', () => {
    process.env.EMAIL_LINK_SECRET = 'env-link'
    setCfBindings({ EMAIL_LINK_SECRET: 'binding-link' })
    expect(emailLinkSecret()).toBe('env-link')
  })

  it('falls back to the CF Pages binding when process.env is unset (the prod path)', () => {
    delete process.env.EMAIL_LINK_SECRET
    delete process.env.CRON_SECRET
    setCfBindings({ EMAIL_LINK_SECRET: 'binding-link' })
    expect(emailLinkSecret()).toBe('binding-link')
  })

  it('fails CLOSED in production when no secret resolves (never the dev default)', () => {
    const savedNodeEnv = process.env.NODE_ENV
    delete process.env.EMAIL_LINK_SECRET
    delete process.env.CRON_SECRET
    setCfBindings({})
    try {
      process.env.NODE_ENV = 'production'
      expect(() => emailLinkSecret()).toThrow()
    } finally {
      process.env.NODE_ENV = savedNodeEnv
    }
  })

  it('uses the dev default outside production', () => {
    delete process.env.EMAIL_LINK_SECRET
    delete process.env.CRON_SECRET
    setCfBindings({})
    expect(emailLinkSecret()).toBe('dev-insecure-email-link-secret')
  })
})
