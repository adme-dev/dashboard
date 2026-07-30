import type {
  ParsedInboundEmail
} from './contracts'

export type CrmInboundEmailSuppressionReason
  = | 'xeroflow_loop'
    | 'delivery_status'
    | 'auto_submitted'
    | 'mailing_list'

export type CrmInboundEmailClassification
  = | { kind: 'human', reason: 'human' }
    | {
      kind: 'suppressed'
      reason: CrmInboundEmailSuppressionReason
    }

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function isDeliveryStatusContentType(value: string): boolean {
  if (value.startsWith('message/delivery-status')) return true
  return value.startsWith('multipart/report')
    && /(?:^|;)\s*report-type\s*=\s*"?delivery-status"?(?:;|$)/i.test(value)
}

function isNullReturnPath(value: string): boolean {
  return value.replace(/\s/g, '') === '<>'
}

function isDeliveryStatusSender(email: ParsedInboundEmail): boolean {
  const localPart = normalized(email.from?.address).split('@')[0] ?? ''
  return localPart === 'postmaster' || localPart.startsWith('mailer-daemon')
}

export function classifyCrmInboundEmail(
  email: ParsedInboundEmail
): CrmInboundEmailClassification {
  const signals = email.automationSignals
  if (normalized(signals.xXeroFlowOrigin) === 'crm-email-gateway') {
    return { kind: 'suppressed', reason: 'xeroflow_loop' }
  }

  const contentType = normalized(signals.contentType)
  if (
    isDeliveryStatusContentType(contentType)
    || (
      isNullReturnPath(normalized(signals.returnPath))
      && isDeliveryStatusSender(email)
    )
  ) {
    return { kind: 'suppressed', reason: 'delivery_status' }
  }

  const autoSubmitted = normalized(signals.autoSubmitted).split(';')[0]!.trim()
  if (autoSubmitted && autoSubmitted !== 'no') {
    return { kind: 'suppressed', reason: 'auto_submitted' }
  }

  const precedence = normalized(signals.precedence)
  if (
    normalized(signals.listId)
    || precedence === 'list'
    || precedence === 'bulk'
    || precedence === 'junk'
  ) {
    return { kind: 'suppressed', reason: 'mailing_list' }
  }

  return { kind: 'human', reason: 'human' }
}
