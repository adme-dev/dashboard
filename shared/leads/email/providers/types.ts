import type { EmailLeadExtraction } from '../contracts'
import type { NormalizedInboundEmail } from '../types'

export interface ProviderMatch {
  matched: boolean
  /** Stable source labels: body, subject, sender, and expected are ranked by the registry. */
  evidence: string[]
}

export interface EmailProviderAdapter {
  id: string
  priority: number
  matches(input: NormalizedInboundEmail, expectedProvider: string | null): ProviderMatch
  extract(input: NormalizedInboundEmail): EmailLeadExtraction | null
}
