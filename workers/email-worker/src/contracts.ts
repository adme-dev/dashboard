export interface ParsedInboundAttachment {
  filename: string | null
  mimeType: string
  size: number
  content?: ArrayBuffer
  contentId?: string | null
}

export interface ParsedInboundEmail {
  subject: string | null
  text: string | null
  html: string | null
  attachments: ParsedInboundAttachment[]
}

export interface InboundEmailWorkerEnv {
  API_URL: string
  INTERNAL_API_KEY: string
  MAX_INBOUND_EMAIL_BYTES?: string
}

export interface InboundEmailMessage {
  from: string
  to: string
  raw: ReadableStream<Uint8Array>
  rawSize: number
  setReject(reason: string): void
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>
