import { describe, expect, it, vi } from 'vitest'

import {
  extractRecipientToken,
  normalizeCloudflareEmail,
  readBoundedRawEmail
} from '../../workers/email-lead-intake/src/transport'

const encoder = new TextEncoder()

function streamFrom(chunks: Uint8Array[], onPull = () => {}) {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull()
      const chunk = chunks[index++]
      if (chunk) controller.enqueue(chunk)
      else controller.close()
    }
  })
}

describe('Cloudflare email transport conformance', () => {
  it('extracts only an exact lowercase Crockford token suffix and ignores the readable prefix', () => {
    expect(extractRecipientToken('carsales-0123456789@leads.xeroflow.io')).toBe('0123456789')
    expect(extractRecipientToken('renamed-display-0123456789@leads.xeroflow.io')).toBe('0123456789')
    expect(extractRecipientToken('carsales-0123456789-extra@leads.xeroflow.io')).toBeNull()
    expect(extractRecipientToken('carsales-012345678I@leads.xeroflow.io')).toBeNull()
    expect(extractRecipientToken('0123456789@leads.xeroflow.io')).toBeNull()
  })

  it('reads the supplied raw stream exactly once and accounts for declared and actual bytes', async () => {
    const first = encoder.encode('Subject: Lead\r\n\r\n')
    const second = encoder.encode('hello')
    const onPull = vi.fn()
    const stream = streamFrom([first, second], onPull)

    const raw = await readBoundedRawEmail(stream, first.byteLength + second.byteLength, 1024)

    expect(new TextDecoder().decode(raw)).toBe('Subject: Lead\r\n\r\nhello')
    expect(raw.byteLength).toBe(first.byteLength + second.byteLength)
    expect(stream.locked).toBe(false)
    expect(onPull).toHaveBeenCalled()
    await expect(readBoundedRawEmail(stream, raw.byteLength, 1024)).rejects.toThrow(/already.*read|locked|mismatch/i)
  })

  it('rejects an authoritative oversize declaration before touching the stream', async () => {
    const stream = streamFrom([encoder.encode('small')])

    await expect(readBoundedRawEmail(stream, 1025, 1024)).rejects.toThrow(/size|limit/i)

    expect(stream.locked).toBe(false)
  })

  it('enforces the actual streamed byte cap and rejects size mismatches', async () => {
    await expect(readBoundedRawEmail(
      streamFrom([new Uint8Array(700), new Uint8Array(400)]),
      1100,
      1024
    )).rejects.toThrow(/stream|limit/i)

    await expect(readBoundedRawEmail(
      streamFrom([encoder.encode('short')]),
      100,
      1024
    )).rejects.toThrow(/size.*mismatch/i)
  })

  it('normalizes envelope/header addresses, optional headers, timestamps, and attachment bytes deterministically', async () => {
    const attachment = encoder.encode('<adf><prospect><customer><contact><email>alex@example.test</email></contact></customer></prospect></adf>')
    const mime = encoder.encode([
      'From: Carsales Relay <Relay@Carsales.Example>',
      'Subject: New enquiry',
      'Message-ID: <Lead-42@EXAMPLE.TEST>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="x"',
      '',
      '--x',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Name: Alex Example',
      '--x',
      'Content-Type: application/xml',
      'Content-Disposition: attachment; filename="lead.adf"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(String.fromCharCode(...attachment)),
      '--x--',
      ''
    ].join('\r\n'))

    const first = await normalizeCloudflareEmail({
      to: 'Carsales-0123456789@Leads.XeroFlow.IO',
      from: 'Notifications@Carsales.Example',
      rawSize: mime.byteLength
    }, mime, '2026-07-29T00:00:00.000Z')
    const second = await normalizeCloudflareEmail({
      to: 'Carsales-0123456789@Leads.XeroFlow.IO',
      from: 'Notifications@Carsales.Example',
      rawSize: mime.byteLength
    }, mime, '2026-07-29T00:00:00.000Z')

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      transport: 'cloudflare_email_routing',
      envelopeRecipient: 'carsales-0123456789@leads.xeroflow.io',
      envelopeSender: 'notifications@carsales.example',
      headerFrom: 'relay@carsales.example',
      subject: 'New enquiry',
      messageId: '<Lead-42@EXAMPLE.TEST>',
      receivedAt: '2026-07-29T00:00:00.000Z',
      rawSize: mime.byteLength
    })
    expect(first.attachments).toHaveLength(1)
    expect(first.attachments[0]?.content).toEqual(attachment)

    const absent = await normalizeCloudflareEmail({
      to: 'generic-0123456789@leads.xeroflow.io',
      from: '',
      rawSize: 4
    }, encoder.encode('\r\n\r\n'), '2026-07-29T00:00:00.000Z')
    expect(absent.envelopeSender).toBeNull()
    expect(absent.headerFrom).toBeNull()
    expect(absent.messageId).toBeNull()
    expect(absent.text).toBeNull()
    expect(absent.html).toBeNull()
  })

  it('has no tenant-selection, persistence, or network side effects', async () => {
    const fetchSpy = vi.fn(async () => { throw new Error('network forbidden') })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const raw = encoder.encode('Subject: Lead\r\n\r\nPhone: +61 400 123 456')
      const normalized = await normalizeCloudflareEmail({
        to: 'anything-0123456789@leads.xeroflow.io',
        from: 'relay@example.test',
        rawSize: raw.byteLength
      }, raw, '2026-07-29T00:00:00.000Z')
      expect(normalized).not.toHaveProperty('clientId')
      expect(normalized).not.toHaveProperty('tenantId')
      expect(fetchSpy).not.toHaveBeenCalled()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
