import PostalMime from 'postal-mime'
import type { Address } from 'postal-mime'
import type {
  ParsedInboundAddress,
  ParsedInboundEmail
} from './contracts'

function attachmentContentToArrayBuffer(content: unknown): ArrayBuffer {
  if (content instanceof ArrayBuffer) return content
  if (ArrayBuffer.isView(content)) {
    const copy = new Uint8Array(content.byteLength)
    copy.set(new Uint8Array(
      content.buffer,
      content.byteOffset,
      content.byteLength
    ))
    return copy.buffer
  }
  if (typeof content === 'string') {
    return new TextEncoder().encode(content).buffer
  }
  throw new Error('Unsupported inbound attachment content')
}

function flattenAddresses(addresses?: Address[]): ParsedInboundAddress[] {
  if (!addresses) return []
  return addresses.flatMap((entry) => {
    if ('group' in entry) {
      return entry.group.map(mailbox => ({
        name: mailbox.name,
        address: mailbox.address
      }))
    }
    return [{
      name: entry.name,
      address: entry.address
    }]
  })
}

function singleAddress(address?: Address): ParsedInboundAddress | null {
  if (!address) return null
  const addresses = flattenAddresses([address])
  return addresses.length === 1 ? addresses[0]! : null
}

export async function parseInboundEmail(
  raw: ArrayBuffer
): Promise<ParsedInboundEmail> {
  const parser = new PostalMime({ attachmentEncoding: 'arraybuffer' })
  const email = await parser.parse(raw)

  return {
    from: singleAddress(email.from),
    to: flattenAddresses(email.to),
    cc: flattenAddresses(email.cc),
    replyTo: flattenAddresses(email.replyTo),
    subject: email.subject ?? null,
    text: email.text ?? null,
    html: email.html ?? null,
    messageId: email.messageId ?? null,
    inReplyTo: email.inReplyTo ?? null,
    references: email.references ?? null,
    attachments: (email.attachments ?? []).map((attachment) => {
      const content = attachmentContentToArrayBuffer(attachment.content)
      return {
        filename: attachment.filename ?? null,
        mimeType: attachment.mimeType,
        content,
        size: content.byteLength,
        contentId: attachment.contentId ?? null
      }
    })
  }
}
