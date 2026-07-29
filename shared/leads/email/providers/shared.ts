import type { EmailLeadExtraction, ExtractedEmailField } from '../contracts'
import { htmlToText } from '../mime'
import type { NormalizedInboundEmail } from '../types'
import type { EmailProviderAdapter, ProviderMatch } from './types'

const PLACEHOLDER_HASH = '0'.repeat(64)
const control = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function parsedMailbox(value: string | null): string | null {
  if (!value) return null
  const candidate = value.match(/<\s*([^<>\s]+)\s*>/)?.[1] ?? value.trim()
  const match = candidate.match(/^([^\s@<>]+)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/)
  return match ? `${match[1]}@${match[2]!.toLowerCase()}` : null
}

function mailboxDomain(value: string | null): string | null { return parsedMailbox(value)?.split('@')[1] ?? null }

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

function field(value: string, confidence: number, provenance: 'subject' | 'body' | 'header' = 'body'): ExtractedEmailField {
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

const roleOrAutomationMailbox = /(?:^|[._+-])(?:admin|accounts?|billing|bounce|contact|customers?|enquir(?:y|ies)|help|hello|info|lead|leads|mail(?:er)?(?:-daemon)?|marketing|no-?reply|notifications?|postmaster|relay|robot|bot|sales|service|support|team)(?:$|[._+-])/i
const automationDomain = /(?:^|\.)(?:automated|mailchimp|mailgun|mailer|mandrill|notification|notifications|noreply|postmark|relay|sendgrid)(?:\.|$)/i
const automationBodySignal = /\b(?:automated (?:message|notification)|delivery status|do not reply|lead notification|new lead notification|no[ -]?reply)\b/i
const structuredLabelSignal = /(?:^|\n)\s*(?:name|full\s*name|first\s*name|last\s*name|e-?mail(?:\s+address)?|phone|mobile|telephone|message|comments?|enquiry|inquiry|lead\s*(?:id|reference|number)|campaign|(?:vehicle\s*)?(?:year|make|model)|stock(?:\s*(?:number|no\.?))?)\s*[:#\-]/gim

function hasLabelledTemplate(body: string): boolean {
  return (body.match(structuredLabelSignal) ?? []).length >= 2
}

function hasFirstPersonEnquiryOrContactIntent(body: string): boolean {
  return /\b(?:i\s+(?:would\s+like|want|need|am\s+(?:interested|looking)|can|could)|i['’]m\s+(?:interested|looking)|(?:can|could)\s+you|please\s+(?:contact|call|email)\s+me)\b/i.test(body)
}

function isPersonalMailbox(mailbox: string): boolean {
  const [local, domain] = mailbox.split('@')
  return Boolean(local && domain && !roleOrAutomationMailbox.test(local) && !automationDomain.test(domain))
}

function directCustomerName(body: string): string | null {
  const match = body.match(/\b(?:my\s+name\s+is|[Ii]\s+am|[Ii]['’]m)\s+([A-Z][\p{L}'’-]*)(?:\s+([A-Z][\p{L}'’-]*))?(?=\s*(?:[.,;!?]|\b(?:and|but|for|to|about|because|i)\b|$))/u)
  return match ? [match[1], match[2]].filter(Boolean).join(' ') : null
}

export function strippedMessage(value: string): string {
  return value.split(/\n(?:On .+ wrote:|From:.+|--\s*$|(?:Kind regards|Regards|Thanks|Thank you|Cheers|Sincerely)[,!]?\s*$)/im)[0]!.trim()
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
  const body = strippedMessage(emailBody(input))
  const headerMailbox = parsedMailbox(input.headerFrom)
  const envelopeMailbox = parsedMailbox(input.envelopeSender)
  const directName = directCustomerName(body)
  const directCustomer = definition.id === 'generic'
    && Boolean(headerMailbox && envelopeMailbox && headerMailbox === envelopeMailbox
      && isPersonalMailbox(headerMailbox)
      && directName
      && hasFirstPersonEnquiryOrContactIntent(body)
      && !hasLabelledTemplate(body)
      && !automationBodySignal.test(body))
  if (directCustomer) {
    if (!fields.email) fields.email = field(headerMailbox!, 0.9, 'header')
    if (!fields.full_name) {
      if (directName) fields.full_name = field(directName, 0.76)
    }
  }
  if (!Object.keys(fields).length) return null
  const message = fields.message ?? (directCustomer && body ? field(body, 0.7) : undefined)
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
      const senderDomain = mailboxDomain(input.envelopeSender) ?? mailboxDomain(input.headerFrom)
      if (senderDomain && definition.senderDomains.some(domain => senderDomain === domain)) evidence.push('sender:provider-domain')
      if (expectedProvider === definition.id) evidence.push('expected:provider-hint')
      // A hint describes configuration, never constitutes evidence on its own.
      return { matched: evidence.some(item => !item.startsWith('expected:')), evidence }
    },
    extract(input: NormalizedInboundEmail) { return extractionFor(definition, input) }
  })
}
