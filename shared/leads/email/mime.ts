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

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    const named: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    if (!entity.startsWith('#')) return named[entity.toLowerCase()]!
    const point = entity[1]!.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
    return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' '
  })
}

function htmlTagAt(value: string, start: number): { end: number, name: string, closing: boolean } | null {
  if (value.startsWith('<!--', start)) {
    const end = value.indexOf('-->', start + 4)
    return { end: end < 0 ? value.length : end + 3, name: '#comment', closing: false }
  }
  let cursor = start + 1
  while (/\s/.test(value[cursor] ?? '')) cursor++
  const closing = value[cursor] === '/'
  if (closing) cursor++
  while (/\s/.test(value[cursor] ?? '')) cursor++
  const nameStart = cursor
  while (/[A-Za-z0-9:-]/.test(value[cursor] ?? '')) cursor++
  if (cursor === nameStart) return null
  const name = value.slice(nameStart, cursor).toLowerCase()
  let quote = ''
  while (cursor < value.length) {
    const char = value[cursor]!
    if (quote) { if (char === quote) quote = ''; cursor++; continue }
    if (char === '"' || char === "'") { quote = char; cursor++; continue }
    if (char === '>') return { end: cursor + 1, name, closing }
    cursor++
  }
  return { end: value.length, name, closing }
}

const activeElements = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'template', 'noscript'])
const resourceElements = new Set(['img', 'source', 'link', 'video', 'audio', 'track', 'frame'])
const voidResourceElements = new Set(['img', 'source', 'link', 'track', 'frame'])
const breaks = new Set(['br', 'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

function inertDecodedTextChunk(chunk: string, encodedSuppressedElements: string[]): string {
  const value = decodeHtmlEntities(chunk)
  let output = ''
  for (let index = 0; index < value.length;) {
    if (value[index] !== '<') { if (!encodedSuppressedElements.length) output += value[index]; index++; continue }
    const tag = htmlTagAt(value, index)
    if (!tag) { if (!encodedSuppressedElements.length) output += value[index]; index++; continue }
    index = tag.end
    if (tag.name === '#comment') continue
    const suppressesContent = activeElements.has(tag.name) || resourceElements.has(tag.name)
    if (encodedSuppressedElements.length) {
      if (!tag.closing && suppressesContent && !voidResourceElements.has(tag.name)) encodedSuppressedElements.push(tag.name)
      else if (tag.closing && tag.name === encodedSuppressedElements.at(-1)) encodedSuppressedElements.pop()
      continue
    }
    if (!tag.closing && suppressesContent && !voidResourceElements.has(tag.name)) { encodedSuppressedElements.push(tag.name); continue }
    if (resourceElements.has(tag.name)) continue
    if (breaks.has(tag.name)) output += '\n'
  }
  return output
}

/** Inert streaming tokenizer: literal tags control nesting; decoded text is isolated before parsing. */
export function htmlToText(html: string): string {
  const value = html
  let output = ''
  const literalSuppressedElements: string[] = []
  const encodedSuppressedElements: string[] = []
  let textStart = 0
  for (let index = 0; index < value.length;) {
    if (value[index] !== '<') { index++; continue }
    const tag = htmlTagAt(value, index)
    if (!tag) { index++; continue }
    if (!literalSuppressedElements.length) output += inertDecodedTextChunk(value.slice(textStart, index), encodedSuppressedElements)
    index = tag.end
    textStart = index
    if (tag.name === '#comment') continue
    const suppressesContent = activeElements.has(tag.name) || resourceElements.has(tag.name)
    if (literalSuppressedElements.length) {
      if (!tag.closing && suppressesContent && !voidResourceElements.has(tag.name)) literalSuppressedElements.push(tag.name)
      else if (tag.closing && tag.name === literalSuppressedElements.at(-1)) literalSuppressedElements.pop()
      continue
    }
    if (!tag.closing && suppressesContent && !voidResourceElements.has(tag.name)) { literalSuppressedElements.push(tag.name); continue }
    if (resourceElements.has(tag.name)) continue
    if (!encodedSuppressedElements.length && breaks.has(tag.name)) output += '\n'
  }
  if (!literalSuppressedElements.length) output += inertDecodedTextChunk(value.slice(textStart), encodedSuppressedElements)
  return cleanText(output.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' '))
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
