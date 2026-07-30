export interface ParsedInboundAttachment {
  filename: string | null
  mimeType: string
  size: number
  content?: ArrayBuffer
  contentId?: string | null
}

export interface ParsedInboundAddress {
  name: string | null
  address: string
}

export interface ParsedInboundAutomationSignals {
  autoSubmitted: string | null
  contentType: string | null
  listId: string | null
  precedence: string | null
  xXeroFlowOrigin: string | null
  returnPath: string | null
}

export interface ParsedInboundEmail {
  from?: ParsedInboundAddress | null
  to?: ParsedInboundAddress[]
  cc?: ParsedInboundAddress[]
  replyTo?: ParsedInboundAddress[]
  subject: string | null
  text: string | null
  html: string | null
  messageId?: string | null
  inReplyTo?: string | null
  references?: string | null
  automationSignals: ParsedInboundAutomationSignals
  attachments: ParsedInboundAttachment[]
}

export interface CrmEmailR2ObjectBody {
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface CrmEmailBucketBinding {
  put(
    key: string,
    value: ArrayBuffer,
    options: {
      httpMetadata: {
        contentType: string
        cacheControl: string
      }
      customMetadata: Record<string, string>
      sha256: ArrayBuffer
    }
  ): Promise<unknown>
  get(key: string): Promise<CrmEmailR2ObjectBody | null>
  delete(keys: string[]): Promise<void>
}

export interface CrmEmailQueueBinding<T = unknown> {
  send(message: T): Promise<unknown>
}

export interface InboundEmailWorkerEnv {
  API_URL: string
  INTERNAL_API_KEY?: string
  HYPERDRIVE?: { connectionString: string }
  DATABASE_URL?: string
  MAX_INBOUND_EMAIL_BYTES?: string
  CRM_EMAIL_INBOUND_ENABLED?: string
  CRM_EMAIL_WORKER_SECRET?: string
  CRM_EMAIL_REPLY_SECRETS?: string
  CRM_EMAIL_RETENTION_DAYS?: string
  CRM_EMAIL_BUCKET?: CrmEmailBucketBinding
  CRM_EMAIL_RETAINED_QUEUE?: CrmEmailQueueBinding
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
