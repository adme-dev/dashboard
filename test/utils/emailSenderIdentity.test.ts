import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSenderDomains, resolveCampaignSenderDomains } from '~~/server/utils/email-marketing/senderIdentity'

const originalEmailSenderDomains = process.env.EMAIL_SENDER_DOMAINS
const originalEmailFrom = process.env.EMAIL_FROM

afterEach(() => {
  if (originalEmailSenderDomains === undefined) delete process.env.EMAIL_SENDER_DOMAINS
  else process.env.EMAIL_SENDER_DOMAINS = originalEmailSenderDomains
  if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = originalEmailFrom
  vi.unstubAllGlobals()
})

describe('parseSenderDomains', () => {
  it('extracts only the email domain from a display-name sender', () => {
    expect(parseSenderDomains('Agency Marketing <newsletter@adme.net.au>')).toEqual(['adme.net.au'])
  })

  it('normalizes explicit domain and email lists', () => {
    expect(parseSenderDomains('adme.net.au, @updates.example.com support@brand.example')).toEqual([
      'adme.net.au',
      'updates.example.com',
      'brand.example'
    ])
  })
})

describe('resolveCampaignSenderDomains', () => {
  it('falls back to EMAIL_FROM when runtime config is unavailable', () => {
    delete process.env.EMAIL_SENDER_DOMAINS
    process.env.EMAIL_FROM = 'Agency Marketing <newsletter@adme.net.au>'
    vi.stubGlobal('useRuntimeConfig', undefined)

    expect(resolveCampaignSenderDomains()).toEqual(['adme.net.au'])
  })
})
