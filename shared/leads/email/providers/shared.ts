import type { EmailLeadExtraction, ExtractedEmailField } from '../contracts'
import { htmlToText } from '../mime'
import type { NormalizedInboundEmail } from '../types'
import type { EmailProviderAdapter, ProviderMatch } from './types'

const PLACEHOLDER_HASH = '0'.repeat(64)
const control = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export interface ProviderDefinition {
  id: string
  priority: number
  sourceName: string
  medium: 'classifieds' | 'paid-social' | 'cpc' | 'lead_ingest'
  markers: RegExp
  senderDomains: string[]
}

export function emailBody(input: NormalizedInboundEmail): string {
  const source = input.text ?? (input.html ? htmlToText(input.html) : '')
  return source.replace(/\r\n?/g, '\n').replace(control, '').replace(/[ \t]+/g, ' ').trim()
}

function field(value: string, confidence: number, provenance: 'subject' | 'body' = 'body'): ExtractedEmailField {
  return { value: value.trim().replace(control, '').slice(0, 4_000), confidence, provenance }
}

const labelPatterns: Array<[string, RegExp]> = [
  ['full_name', /(?:^|\n)\s*(?:name|full\s*name)\s*[:\-]\s*([^\n]+)/i],
  ['first_name', /(?:^|\n)\s*first\s*name\s*[:\-]\s*([^\n]+)/i],
  ['last_name', /(?:^|\n)\s*last\s*name\s*[:\-]\s*([^\n]+)/i],
  ['email', /(?:^|\n)\s*(?:e-?mail|email address)\s*[:\-]\s*([^\s\n]+@[^\s\n]+)/i],
  ['phone', /(?:^|\n)\s*(?:phone|mobile|telephone)\s*[:\-]\s*([^\n]+)/i],
  ['message', /(?:^|\n)\s*(?:message|comments?|enquiry|inquiry)\s*[:\-]\s*([^\n]+)/i],
  ['lead_id', /(?:^|\n)\s*(?:lead|enquiry|inquiry|provider)\s*(?:id|reference|number)\s*[:#\-]?\s*([^\n]+)/i],
  ['campaign', /(?:^|\n)\s*campaign\s*[:\-]\s*([^\n]+)/i],
  ['year', /(?:^|\n)\s*(?:vehicle\s*)?year\s*[:\-]\s*(\d{4})/i],
  ['make', /(?:^|\n)\s*(?:vehicle\s*)?make\s*[:\-]\s*([^\n]+)/i],
  ['model', /(?:^|\n)\s*(?:vehicle\s*)?model\s*[:\-]\s*([^\n]+)/i],
  ['stock_number', /(?:^|\n)\s*(?:stock(?:\s*(?:number|no\.?))?|stock_number)\s*[:#\-]?\s*([^\n]+)/i]
]

function strippedMessage(value: string): string {
  return value.split(/\n(?:On .+ wrote:|From:.+|--\s*$)/im)[0]!.trim()
}

export function labelledFields(input: NormalizedInboundEmail): Record<string, ExtractedEmailField> {
  const body = strippedMessage(emailBody(input))
  const fields: Record<string, ExtractedEmailField> = {}
  for (const [key, pattern] of labelPatterns) {
    const match = body.match(pattern)
    if (match?.[1]?.trim()) fields[key] = field(match[1], 0.82)
  }
  if (!fields.phone) {
    const match = body.match(/(?:\+?\d[\d ()-]{6,}\d)/)
    if (match) fields.phone = field(match[0], 0.72)
  }
  if (!fields.email) {
    const match = body.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)
    if (match) fields.email = field(match[0], 0.72)
  }
  return fields
}

export function extractionFor(definition: ProviderDefinition, input: NormalizedInboundEmail): EmailLeadExtraction | null {
  const fields = labelledFields(input)
  if (!Object.keys(fields).length) return null
  const message = fields.message
  delete fields.message
  const vehicle = {
    year: fields.year,
    make: fields.make,
    model: fields.model,
    stock_number: fields.stock_number
  }
  delete fields.year; delete fields.make; delete fields.model; delete fields.stock_number
  return {
    provider: definition.id,
    externalIdHash: PLACEHOLDER_HASH,
    sourceName: definition.sourceName,
    medium: definition.medium,
    parser: 'provider',
    fields,
    vehicle: Object.values(vehicle).some(Boolean) ? vehicle : undefined,
    message: message ? { ...message, value: strippedMessage(message.value) } : undefined,
    overallConfidence: fields.email || fields.phone ? 0.84 : 0.62,
    needsReview: !(fields.email || fields.phone),
    reviewReasons: fields.email || fields.phone ? [] : ['No customer contact found']
  }
}

export function createProviderAdapter(definition: ProviderDefinition): EmailProviderAdapter {
  return Object.freeze({
    id: definition.id,
    priority: definition.priority,
    matches(input: NormalizedInboundEmail, expectedProvider: string | null): ProviderMatch {
      const body = emailBody(input)
      const evidence: string[] = []
      if (definition.markers.test(body)) evidence.push('body:provider-marker')
      if (definition.markers.test(input.subject)) evidence.push('subject:provider-marker')
      const sender = `${input.envelopeSender ?? ''} ${input.headerFrom ?? ''}`.toLowerCase()
      if (definition.senderDomains.some(domain => sender.includes(`@${domain}`) || sender.includes(domain))) evidence.push('sender:provider-domain')
      if (expectedProvider === definition.id) evidence.push('expected:provider-hint')
      // A hint describes configuration, never constitutes evidence on its own.
      return { matched: evidence.some(item => !item.startsWith('expected:')), evidence }
    },
    extract(input: NormalizedInboundEmail) { return extractionFor(definition, input) }
  })
}
