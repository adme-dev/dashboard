export interface EmailClickClassificationInput {
  userAgent?: string | null
  sentAt?: string | null
  clickedAt?: string | null
}

export interface EmailClickClassification {
  suspectedScanner: boolean
  reasons: string[]
}

const SCANNER_UA_RE = /proofpoint|mimecast|barracuda|symantec|messagelabs|trend micro|forcepoint|fireeye|url defense|safe links|safelinks|linkprotect|googleimageproxy|bot|spider|crawler/i
const MIN_HUMAN_CLICK_DELAY_MS = 5000

export function classifyEmailClick(input: EmailClickClassificationInput): EmailClickClassification {
  const reasons: string[] = []
  const userAgent = input.userAgent ?? ''
  if (SCANNER_UA_RE.test(userAgent)) {
    reasons.push('scanner_user_agent')
  }

  if (input.sentAt && input.clickedAt) {
    const sent = Date.parse(input.sentAt)
    const clicked = Date.parse(input.clickedAt)
    if (Number.isFinite(sent) && Number.isFinite(clicked) && clicked - sent >= 0 && clicked - sent < MIN_HUMAN_CLICK_DELAY_MS) {
      reasons.push('impossible_timing')
    }
  }

  return {
    suspectedScanner: reasons.length > 0,
    reasons
  }
}
