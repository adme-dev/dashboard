import type { EmailIngressTransport } from './contracts'

/** Raw message data is intentionally in-process only; never serialize this type. */
export interface NormalizedInboundEmail {
  transport: EmailIngressTransport
  envelopeRecipient: string
  envelopeSender: string | null
  headerFrom: string | null
  subject: string
  text: string | null
  html: string | null
  messageId: string | null
  attachments: EmailAttachment[]
  receivedAt: string
  rawSize: number
}

export interface EmailAttachment {
  filename: string
  contentType: string
  content: Uint8Array
}

export interface ParsedMimeContent {
  subject: string
  headerFrom: string | null
  messageId: string | null
  text: string | null
  html: string | null
  htmlText: string | null
  attachments: EmailAttachment[]
  rawSize: number
}
