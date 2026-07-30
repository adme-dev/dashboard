export const CRM_TRANSACTIONAL_EMAIL_OUTCOMES = [
  'accepted',
  'retryable',
  'permanent_failure'
] as const

export type CrmTransactionalEmailOutcome
  = typeof CRM_TRANSACTIONAL_EMAIL_OUTCOMES[number]

export interface CrmTransactionalEmailAddress {
  address: string
  name: string | null
}

interface CrmTransactionalEmailAttachmentBase {
  filename: string
  contentType: string
  content: string | ArrayBuffer | ArrayBufferView
}

export type CrmTransactionalEmailAttachment
  = | CrmTransactionalEmailAttachmentBase & {
    disposition: 'attachment'
    contentId?: never
  }
  | CrmTransactionalEmailAttachmentBase & {
    disposition: 'inline'
    contentId: string
  }

export interface PreparedCrmTransactionalEmail {
  from: CrmTransactionalEmailAddress
  to: CrmTransactionalEmailAddress[]
  cc: CrmTransactionalEmailAddress[]
  bcc: CrmTransactionalEmailAddress[]
  replyTo: CrmTransactionalEmailAddress | null
  subject: string
  text: string
  html: string | null
  headers: Record<string, string>
  attachments: CrmTransactionalEmailAttachment[]
}

export interface CrmTransactionalEmailSendResult {
  outcome: CrmTransactionalEmailOutcome
  provider: string
  providerMessageId: string | null
  errorClass: string | null
}

export interface CrmTransactionalEmailProvider {
  send(
    email: PreparedCrmTransactionalEmail
  ): Promise<CrmTransactionalEmailSendResult>
}
