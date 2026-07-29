import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

import { htmlToText, MAX_EMAIL_HEADER_BYTES, MAX_EMAIL_MIME_DEPTH, MAX_RAW_EMAIL_BYTES, parseMimeContent } from '../../shared/leads/email/mime'

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

  it('drops encoded and unclosed active markup before it can reach extracted text', () => {
    const encoded = '<p>Name: Alex Example</p>&lt;script&gt;fetch("https://evil.test/x")&lt;/script&gt;'
    const unclosed = '<p>Name: Alex Example</p><script>fetch("https://evil.test/x")'
    for (const hostile of [encoded, unclosed, readFileSync('test/fixtures/email-leads/hostile-html.html', 'utf8')]) {
      expect(htmlToText(hostile)).toContain('Name: Alex Example')
      expect(htmlToText(hostile)).not.toMatch(/script|fetch|evil\.test|invalid\.example/i)
    }
  })

  it('keeps nested active and resource markup suppressed until every active tag closes', () => {
    for (const hostile of [
      '<template><template>hidden</template>still-hidden</template>safe',
      '<svg><template>hidden</template>still-hidden</svg>safe',
      '&lt;svg&gt;&lt;template&gt;hidden&lt;/template&gt;still-hidden&lt;/svg&gt;safe',
      '<video><template>hidden</template>still-hidden</video>safe'
    ]) {
      const text = htmlToText(hostile)
      expect(text).toContain('safe')
      expect(text).not.toMatch(/hidden|still-hidden/i)
    }

    const malformed = htmlToText('<svg><template>hidden</svg>still-hidden</template>safe')
    expect(malformed).not.toMatch(/hidden|still-hidden/i)
  })

  it('does not let encoded tags mutate a literal active-element stack', () => {
    const closedLiteralCases = [
      '<template>&lt;/template&gt;fetch("https://evil.test/template")</template>safe',
      '<script>&lt;/script&gt;fetch("https://evil.test/script")</script>safe',
      '<template><template>&lt;/template&gt;fetch("https://evil.test/same")</template></template>safe',
      '<script><template>&lt;/template&gt;fetch("https://evil.test/different")</template></script>safe',
      '&lt;template&gt;fetch("https://evil.test/encoded")&lt;/template&gt;safe'
    ]
    for (const hostile of closedLiteralCases) {
      const text = htmlToText(hostile)
      expect(text).toContain('safe')
      expect(text).not.toMatch(/fetch|evil\.test/i)
    }

    const malformed = htmlToText('<template>&lt;/template&gt;fetch("https://evil.test/unclosed")')
    expect(malformed).not.toMatch(/fetch|evil\.test/i)
  })

  it('keeps decoded active markup suppressed across benign literal tag boundaries', () => {
    const encodedAcrossLiteralTags = '&lt;script&gt;hidden<p>fetch("https://evil.test/split")</p><div>still-hidden</div>&lt;/script&gt;safe after close'
    const nestedEncodedAcrossLiteralTags = '&lt;template&gt;outer<p>&lt;script&gt;inner</p><div>still-inner</div>&lt;/script&gt;outer-after</div>&lt;/template&gt;safe after nested close'
    const malformedUnclosed = '&lt;script&gt;hidden<p>fetch("https://evil.test/unclosed")</p><div>still-hidden</div>'

    for (const hostile of [encodedAcrossLiteralTags, nestedEncodedAcrossLiteralTags, malformedUnclosed]) {
      const text = htmlToText(hostile)
      expect(text).not.toMatch(/hidden|fetch|evil\.test|outer|inner/i)
    }
    expect(htmlToText(encodedAcrossLiteralTags)).toContain('safe after close')
    expect(htmlToText(nestedEncodedAcrossLiteralTags)).toContain('safe after nested close')
  })

  it('does not let literal-suppressed content mutate decoded active-markup state', () => {
    const encodedStackBeforeLiteral = '&lt;script&gt;hidden<template>&lt;/script&gt;</template>fetch("https://evil.test/literal-pop")&lt;/script&gt;safe after encoded close'
    const encodedOpenInsideLiteral = '<script>&lt;template&gt;</script>safe after literal close'
    const encodedOpenInsideNestedLiteral = '<template><script>&lt;template&gt;</script></template>safe after literal close'
    const nestedLiteralWithEncodedClose = '&lt;script&gt;hidden<template><script>&lt;/script&gt;</script></template>fetch("https://evil.test/nested")&lt;/script&gt;safe after nested close'

    for (const hostile of [encodedStackBeforeLiteral, nestedLiteralWithEncodedClose]) {
      const text = htmlToText(hostile)
      expect(text).not.toMatch(/hidden|fetch|evil\.test/i)
    }
    expect(htmlToText(encodedStackBeforeLiteral)).toContain('safe after encoded close')
    expect(htmlToText(nestedLiteralWithEncodedClose)).toContain('safe after nested close')
    expect(htmlToText(encodedOpenInsideLiteral)).toContain('safe after literal close')
    expect(htmlToText(encodedOpenInsideNestedLiteral)).toContain('safe after literal close')
  })

  it('rejects XML/ADF attachments after decode; the 2 MiB raw bound remains the raw-input ceiling', async () => {
    const oversized = 'x'.repeat((256 * 1024) + 1)
    const parsed = await parseMimeContent(raw([
      'Content-Type: multipart/mixed; boundary=x', '', '--x', 'Content-Type: text/plain', '', 'hello', '--x',
      'Content-Type: application/xml; name=large.xml', 'Content-Disposition: attachment; filename=large.xml',
      'Content-Transfer-Encoding: base64', '', Buffer.from(oversized).toString('base64'), '--x--'
    ].join('\n')))
    expect(parsed.attachments).toHaveLength(0)
  })

  it('handles the sanitised malformed MIME fixture without extracting active content', async () => {
    const malformed = readFileSync('test/fixtures/email-leads/malformed-mime.eml')
    const parsed = await parseMimeContent(new Uint8Array(malformed))
    expect(parsed.attachments).toEqual([])
    expect(parsed.htmlText).toBeNull()
  })
})
