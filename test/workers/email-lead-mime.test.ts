import { describe, expect, it, vi } from 'vitest'

import { MAX_EMAIL_HEADER_BYTES, MAX_EMAIL_MIME_DEPTH, MAX_RAW_EMAIL_BYTES, parseMimeContent } from '../../shared/leads/email/mime'

const encoder = new TextEncoder()

function raw(parts: string) {
  return encoder.encode(parts.replace(/\n/g, '\r\n'))
}

describe('bounded MIME parsing', () => {
  it('rejects raw messages larger than the global worker limit before parsing', async () => {
    await expect(parseMimeContent(new Uint8Array(MAX_RAW_EMAIL_BYTES + 1)))
      .rejects.toThrow('Raw email exceeds')
  })

  it('bounds headers and MIME nesting through postal-mime', async () => {
    await expect(parseMimeContent(raw(`Subject: ${'a'.repeat(MAX_EMAIL_HEADER_BYTES)}\n\nhello`)))
      .rejects.toThrow(/header/i)

    const nested = Array.from({ length: MAX_EMAIL_MIME_DEPTH + 2 }, (_, index) =>
      `Content-Type: multipart/mixed; boundary=b${index}\n\n--b${index}`
    ).join('\n')
    await expect(parseMimeContent(raw(`${nested}\nContent-Type: text/plain\n\nhello`)))
      .rejects.toThrow(/nesting/i)
  })

  it('converts HTML to inert text and never fetches remote resources', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const parsed = await parseMimeContent(raw([
      'From: relay@example.test',
      'Subject: HTML lead',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Name: <b>Alex Example</b></p><script>fetch("https://attacker.test")</script><style>body{display:none}</style><img src="https://attacker.test/pixel">'
    ].join('\n')))

    expect(parsed.htmlText).toContain('Name: Alex Example')
    expect(parsed.htmlText).not.toContain('attacker')
    expect(parsed.htmlText).not.toContain('fetch')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('retains only bounded XML/ADF attachments for extraction', async () => {
    const oversized = 'x'.repeat((256 * 1024) + 1)
    const parsed = await parseMimeContent(raw([
      'Content-Type: multipart/mixed; boundary=x', '', '--x', 'Content-Type: text/plain', '', 'hello', '--x',
      'Content-Type: application/xml; name=large.xml', 'Content-Disposition: attachment; filename=large.xml',
      'Content-Transfer-Encoding: base64', '', Buffer.from(oversized).toString('base64'), '--x--'
    ].join('\n')))
    expect(parsed.attachments).toHaveLength(0)
  })
})
