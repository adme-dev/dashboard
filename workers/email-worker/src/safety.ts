const MiB = 1024 * 1024
const DEFAULT_MAX_MESSAGE_BYTES = 10 * MiB
const ABSOLUTE_MAX_MESSAGE_BYTES = 25 * MiB

export interface InboundEmailLimits {
  maxMessageBytes: number
  maxAttachments: number
  maxAttachmentBytes: number
  maxCombinedAttachmentBytes: number
}

export interface AttachmentDescriptor {
  filename: string | null
  mimeType: string
  size: number
}

export type InboundEmailSafetyResult
  = | { safe: true }
    | {
      safe: false
      reason:
        | 'invalid_message_size'
        | 'message_too_large'
        | 'too_many_attachments'
        | 'invalid_attachment_size'
        | 'attachment_too_large'
        | 'attachments_too_large'
    }

export function resolveInboundEmailLimits(
  configuredMaxMessageBytes?: string
): InboundEmailLimits {
  const parsed = configuredMaxMessageBytes
    && /^\d+$/.test(configuredMaxMessageBytes)
    ? Number(configuredMaxMessageBytes)
    : Number.NaN
  const maxMessageBytes = Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, ABSOLUTE_MAX_MESSAGE_BYTES)
    : DEFAULT_MAX_MESSAGE_BYTES

  return {
    maxMessageBytes,
    maxAttachments: 10,
    maxAttachmentBytes: 5 * MiB,
    maxCombinedAttachmentBytes: 8 * MiB
  }
}

export function validateInboundEmailSize(
  rawSize: number,
  limits: InboundEmailLimits
): InboundEmailSafetyResult {
  if (!Number.isSafeInteger(rawSize) || rawSize < 0) {
    return { safe: false, reason: 'invalid_message_size' }
  }
  if (rawSize > limits.maxMessageBytes) {
    return { safe: false, reason: 'message_too_large' }
  }
  return { safe: true }
}

export function validateInboundAttachments(
  attachments: AttachmentDescriptor[],
  limits: InboundEmailLimits
): InboundEmailSafetyResult {
  if (attachments.length > limits.maxAttachments) {
    return { safe: false, reason: 'too_many_attachments' }
  }

  let combinedBytes = 0
  for (const attachment of attachments) {
    if (!Number.isSafeInteger(attachment.size) || attachment.size < 0) {
      return { safe: false, reason: 'invalid_attachment_size' }
    }
    if (attachment.size > limits.maxAttachmentBytes) {
      return { safe: false, reason: 'attachment_too_large' }
    }
    combinedBytes += attachment.size
    if (combinedBytes > limits.maxCombinedAttachmentBytes) {
      return { safe: false, reason: 'attachments_too_large' }
    }
  }

  return { safe: true }
}
