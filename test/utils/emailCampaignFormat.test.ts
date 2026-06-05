import { describe, it, expect } from 'vitest'
import {
  substituteMergeTags,
  recipientVars,
  unsubscribeUrl,
  buildBatchEmail,
  buildTrackedBatchEmail
} from '~~/server/utils/email-marketing/campaignSend'

describe('substituteMergeTags', () => {
  it('replaces known tags (any spacing, case-insensitive)', () => {
    const out = substituteMergeTags('Hi {{ first_name }} <{{EMAIL}}>', {
      first_name: 'Sam', email: 'sam@x.com'
    })
    expect(out).toBe('Hi Sam <sam@x.com>')
  })

  it('resolves unknown tags to empty string (no leaked braces)', () => {
    expect(substituteMergeTags('a {{nope}} b', {})).toBe('a  b')
  })
})

describe('recipientVars', () => {
  it('derives first_name from the full name', () => {
    expect(recipientVars({ email: 'a@b.com', name: 'Ada Lovelace' }, 'U')).toEqual({
      email: 'a@b.com', name: 'Ada Lovelace', first_name: 'Ada', unsubscribe_url: 'U'
    })
  })
  it('handles a missing name', () => {
    const v = recipientVars({ email: 'a@b.com', name: null }, 'U')
    expect(v.first_name).toBe('')
    expect(v.name).toBe('')
  })
})

describe('unsubscribeUrl', () => {
  it('builds a per-recipient URL and trims trailing slashes from the base', () => {
    expect(unsubscribeUrl('https://app.test/', 'c1', 's1'))
      .toBe('https://app.test/email/unsubscribe?c=c1&s=s1')
  })

  it('appends a signature token when one is supplied', () => {
    expect(unsubscribeUrl('https://app.test', 'c1', 's1', 'deadbeef'))
      .toBe('https://app.test/email/unsubscribe?c=c1&s=s1&t=deadbeef')
  })
})

describe('buildBatchEmail', () => {
  const campaign = {
    subject: 'Hello {{ first_name }}',
    from_name: 'XeroFlow',
    from_email: 'hi@xf.com',
    reply_to: null,
    body_html: '<p>Hi {{ first_name }}</p><a href="{{ unsubscribe_url }}">stop</a>'
  }
  const recipient = { email: 'ada@x.com', name: 'Ada Lovelace', subscriber_id: 's9' }

  it('personalizes subject + body and sets RFC 8058 headers', () => {
    const email = buildBatchEmail(campaign, recipient, 'c9', 'https://app.test')
    expect(email.from).toBe('XeroFlow <hi@xf.com>')
    expect(email.to).toEqual(['ada@x.com'])
    expect(email.subject).toBe('Hello Ada')
    expect(email.html).toContain('Hi Ada')
    expect(email.html).toContain('https://app.test/email/unsubscribe?c=c9&s=s9')
    expect(email.headers['List-Unsubscribe']).toBe('<https://app.test/email/unsubscribe?c=c9&s=s9>')
    expect(email.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(email.replyTo).toBeUndefined()
  })

  it('threads the signature token into the URL, in-body link, and List-Unsubscribe header', () => {
    const email = buildBatchEmail(campaign, recipient, 'c9', 'https://app.test', 'sig123')
    const expected = 'https://app.test/email/unsubscribe?c=c9&s=s9&t=sig123'
    expect(email.html).toContain(expected)
    expect(email.headers['List-Unsubscribe']).toBe(`<${expected}>`)
  })

  it('uses a bare from when no from_name, and includes replyTo when set', () => {
    const email = buildBatchEmail(
      { ...campaign, from_name: null, reply_to: 'reply@xf.com' }, recipient, 'c9', 'https://app.test'
    )
    expect(email.from).toBe('hi@xf.com')
    expect(email.replyTo).toBe('reply@xf.com')
  })

  it('rewrites destination links through first-party click tracking when tracking context is supplied', async () => {
    const email = await buildTrackedBatchEmail(
      {
        ...campaign,
        body_html: '<p>Hi {{ first_name }}</p><a href="https://dealer.example.com/offers">Offer</a><a href="{{ unsubscribe_url }}">stop</a>'
      },
      recipient,
      'c9',
      'https://app.test',
      'sig123',
      {
        appUrl: 'https://app.test',
        campaignId: 'c9',
        subscriberId: 's9',
        secret: 'secret'
      }
    )

    expect(email.html).toContain('https://app.test/email/click?')
    expect(email.html).toContain('u=https%3A%2F%2Fdealer.example.com%2Foffers')
    expect(email.html).toContain('https://app.test/email/unsubscribe?c=c9&s=s9&t=sig123')
    expect(email.headers['List-Unsubscribe']).toBe('<https://app.test/email/unsubscribe?c=c9&s=s9&t=sig123>')
  })
})
