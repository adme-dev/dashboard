import PostalMime from 'postal-mime'

import type { EmailAttachment, ParsedMimeContent } from './types'

export const MAX_RAW_EMAIL_BYTES = 2 * 1024 * 1024
export const MAX_EMAIL_HEADER_BYTES = 64 * 1024
export const MAX_EMAIL_MIME_DEPTH = 20
export const MAX_ADF_ATTACHMENT_BYTES = 256 * 1024

const decoder = new TextDecoder('utf-8', { fatal: false })

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim()
}

/** Converts markup without a DOM, executing nothing and following no URL. */
export function htmlToText(html: string): string {
  const inert = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|iframe|object|embed|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style|iframe|object|embed|svg|template)\b[^>]*\/?\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_match, name: string) => ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name.toLowerCase()]!)
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const point = code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)
      return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' '
    })
  return cleanText(inert.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' '))
}

function isXmlAttachment(filename: string, contentType: string, content: Uint8Array): boolean {
  if (contentType.toLowerCase().includes('xml') || /\.(adf|xml)$/i.test(filename)) return true
  return decoder.decode(content.subarray(0, 128)).trimStart().startsWith('<?xml')
}

/** Parses RFC822 content with hard byte, header, nesting, and attachment limits. */
export async function parseMimeContent(raw: Uint8Array): Promise<ParsedMimeContent> {
  if (raw.byteLength > MAX_RAW_EMAIL_BYTES) throw new Error(`Raw email exceeds ${MAX_RAW_EMAIL_BYTES} byte limit`)
  const parsed = await PostalMime.parse(raw, {
    attachmentEncoding: 'arraybuffer',
    maxHeadersSize: MAX_EMAIL_HEADER_BYTES,
    maxNestingDepth: MAX_EMAIL_MIME_DEPTH
  })
  const attachments: EmailAttachment[] = []
  for (const attachment of parsed.attachments) {
    const content = attachment.content instanceof Uint8Array
      ? attachment.content
      : new Uint8Array(attachment.content as ArrayBuffer)
    const filename = attachment.filename ?? 'attachment'
    const contentType = attachment.mimeType || 'application/octet-stream'
    if (content.byteLength <= MAX_ADF_ATTACHMENT_BYTES && isXmlAttachment(filename, contentType, content)) {
      attachments.push({ filename, contentType, content: new Uint8Array(content) })
    }
  }
  const text = parsed.text ? cleanText(parsed.text) : null
  const html = parsed.html ? cleanText(parsed.html) : null
  return {
    subject: cleanText(parsed.subject ?? ''),
    headerFrom: parsed.from && 'address' in parsed.from ? parsed.from.address : null,
    messageId: parsed.messageId ? cleanText(parsed.messageId) : null,
    text,
    html,
    htmlText: parsed.html ? htmlToText(parsed.html) : null,
    attachments,
    rawSize: raw.byteLength
  }
}
