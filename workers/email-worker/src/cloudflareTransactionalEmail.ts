/// <reference types="@cloudflare/workers-types/latest" />

import type {
  CrmTransactionalEmailAddress,
  CrmTransactionalEmailAttachment,
  CrmTransactionalEmailProvider,
  CrmTransactionalEmailSendResult,
  PreparedCrmTransactionalEmail
} from '../../../server/utils/crm/transactionalEmail'

export const CLOUDFLARE_TRANSACTIONAL_EMAIL_PROVIDER
  = 'cloudflare_email' as const

const RETRYABLE_ERROR_CODES = new Set([
  'E_RATE_LIMIT_EXCEEDED',
  'E_DAILY_LIMIT_EXCEEDED',
  'E_DELIVERY_FAILED',
  'E_INTERNAL_SERVER_ERROR'
])

const PERMANENT_ERROR_CODES = new Set([
  'E_VALIDATION_ERROR',
  'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS',
  'E_SENDER_NOT_VERIFIED',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_RECIPIENT_SUPPRESSED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE',
  'E_CONTENT_TOO_LARGE',
  'E_HEADER_NOT_ALLOWED',
  'E_HEADER_USE_API_FIELD',
  'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG',
  'E_HEADER_NAME_INVALID',
  'E_HEADERS_TOO_LARGE',
  'E_HEADERS_TOO_MANY'
])

function cloudflareAddress(
  participant: CrmTransactionalEmailAddress
): string | EmailAddress {
  const name = participant.name?.trim()
  return name
    ? { email: participant.address, name }
    : participant.address
}

function cloudflareAttachment(
  attachment: CrmTransactionalEmailAttachment
): EmailAttachment {
  if (attachment.disposition === 'inline') {
    return {
      disposition: 'inline',
      contentId: attachment.contentId,
      filename: attachment.filename,
      type: attachment.contentType,
      content: attachment.content
    }
  }
  return {
    disposition: 'attachment',
    filename: attachment.filename,
    type: attachment.contentType,
    content: attachment.content
  }
}

function controlledErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string') return null
  if (RETRYABLE_ERROR_CODES.has(code) || PERMANENT_ERROR_CODES.has(code)) {
    return code
  }
  return null
}

function failedResult(
  outcome: 'retryable' | 'permanent_failure',
  errorClass: string
): CrmTransactionalEmailSendResult {
  return {
    outcome,
    provider: CLOUDFLARE_TRANSACTIONAL_EMAIL_PROVIDER,
    providerMessageId: null,
    errorClass
  }
}

type CloudflareEmailBuilder = Parameters<SendEmail['send']>[0]

function builder(email: PreparedCrmTransactionalEmail): CloudflareEmailBuilder {
  return {
    from: cloudflareAddress(email.from),
    to: email.to.map(cloudflareAddress),
    cc: email.cc.map(cloudflareAddress),
    bcc: email.bcc.map(cloudflareAddress),
    ...(email.replyTo
      ? { replyTo: cloudflareAddress(email.replyTo) }
      : {}),
    subject: email.subject,
    text: email.text,
    ...(email.html === null ? {} : { html: email.html }),
    headers: { ...email.headers },
    attachments: email.attachments.map(cloudflareAttachment)
  }
}

export function createCloudflareTransactionalEmailProvider(
  binding: SendEmail
): CrmTransactionalEmailProvider {
  return {
    async send(
      email: PreparedCrmTransactionalEmail
    ): Promise<CrmTransactionalEmailSendResult> {
      try {
        const response = await binding.send(builder(email))
        const providerMessageId
          = typeof response?.messageId === 'string'
            ? response.messageId.trim()
            : ''
        if (!providerMessageId || providerMessageId.length > 500) {
          return failedResult(
            'retryable',
            'cloudflare_email_invalid_response'
          )
        }
        return {
          outcome: 'accepted',
          provider: CLOUDFLARE_TRANSACTIONAL_EMAIL_PROVIDER,
          providerMessageId,
          errorClass: null
        }
      } catch (error) {
        const code = controlledErrorCode(error)
        if (!code) {
          return failedResult('retryable', 'cloudflare_email_unknown')
        }
        return failedResult(
          RETRYABLE_ERROR_CODES.has(code)
            ? 'retryable'
            : 'permanent_failure',
          `cloudflare_email_${code.toLowerCase()}`
        )
      }
    }
  }
}
