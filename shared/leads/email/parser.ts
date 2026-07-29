import { XMLParser, XMLValidator } from 'fast-xml-parser'

import type { EmailEndpointPolicy, EmailLeadExtraction, ExtractedEmailField } from './contracts'
import { MAX_ADF_ATTACHMENT_BYTES, htmlToText } from './mime'
import { allEmailProviderAdapters, genericAdapter } from './providers'
import { registerProviderAdapters } from './providers/registry'
import { emailBody } from './providers/shared'
import type { NormalizedInboundEmail } from './types'

const PLACEHOLDER_HASH = '0'.repeat(64)
const textEncoder = new TextEncoder()
const sha256Constants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function rightRotate(value: number, amount: number): number { return (value >>> amount) | (value << (32 - amount)) }

/** Synchronous, runtime-neutral SHA-256 so identity is hashed before any safe envelope is built. */
export function sha256Hex(value: string): string {
  const source = textEncoder.encode(value)
  const bitLength = source.length * 8
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const data = new Uint8Array(paddedLength)
  data.set(source); data[source.length] = 0x80
  const view = new DataView(data.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index++) {
      const a = words[index - 15]!; const b = words[index - 2]!
      words[index] = (rightRotate(a, 7) ^ rightRotate(a, 18) ^ (a >>> 3)) + words[index - 16]! + (rightRotate(b, 17) ^ rightRotate(b, 19) ^ (b >>> 10)) + words[index - 7]!
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let index = 0; index < 64; index++) {
      const choice = (e & f) ^ (~e & g)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const temp1 = (h + sum1 + choice + sha256Constants[index]! + words[index]!) >>> 0
      const temp2 = (sum0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    state[0] = (state[0]! + a) >>> 0; state[1] = (state[1]! + b) >>> 0; state[2] = (state[2]! + c) >>> 0; state[3] = (state[3]! + d) >>> 0
    state[4] = (state[4]! + e) >>> 0; state[5] = (state[5]! + f) >>> 0; state[6] = (state[6]! + g) >>> 0; state[7] = (state[7]! + h) >>> 0
  }
  return Array.from(state, word => word.toString(16).padStart(8, '0')).join('')
}

function safeXmlLex(xml: string): void {
  for (let index = 0; index < xml.length; index++) {
    if (xml.startsWith('<!--', index)) { const end = xml.indexOf('-->', index + 4); if (end < 0) throw new Error('Malformed XML comment'); index = end + 2; continue }
    if (xml.startsWith('<![CDATA[', index)) { const end = xml.indexOf(']]>', index + 9); if (end < 0) throw new Error('Malformed XML CDATA'); index = end + 2; continue }
    if (xml.startsWith('<?', index)) { const end = xml.indexOf('?>', index + 2); if (end < 0) throw new Error('Malformed XML declaration'); index = end + 1; continue }
    if (xml.startsWith('<!', index)) throw new Error('XML DTD and declarations are not permitted')
    if (xml[index] === '&') {
      const end = xml.indexOf(';', index + 1)
      const entity = end < 0 ? '' : xml.slice(index + 1, end)
      if (!['amp', 'lt', 'gt', 'apos', 'quot'].includes(entity) && !/^#(?:x[0-9a-f]+|\d+)$/i.test(entity)) throw new Error('XML entity references are not permitted')
      index = end
    }
  }
}

type AdfLead = EmailLeadExtraction & { providerId: string | null }
function decodeSafeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|apos|quot);/gi, (_match, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', apos: "'", quot: '"' }
    if (!entity.startsWith('#')) return named[entity.toLowerCase()]!
    const point = entity[1]!.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
    return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
  })
}
const adfField = (value: string, provenance: 'adf' | 'attachment'): ExtractedEmailField => ({ value: decodeSafeXmlEntities(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 4_000), confidence: 0.96, provenance })

function flattenXml(value: unknown, name = '', into = new Map<string, string[]>(), part?: string): Map<string, string[]> {
  if (Array.isArray(value)) { value.forEach(item => flattenXml(item, name, into, part)); return into }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    if (text) { const key = `${name}${part ? `:${part}` : ''}`.toLowerCase(); into.set(key, [...(into.get(key) ?? []), text]) }
    return into
  }
  if (!value || typeof value !== 'object') return into
  const object = value as Record<string, unknown>
  const localPart = typeof object['@_part'] === 'string' ? object['@_part'] : part
  if (typeof object['#text'] === 'string') flattenXml(object['#text'], name, into, localPart)
  for (const [key, child] of Object.entries(object)) if (key !== '@_part' && key !== '#text' && !key.startsWith('@_')) flattenXml(child, name ? `${name}.${key}` : key, into)
  return into
}

function firstValue(values: Map<string, string[]>, names: string[]): string | null {
  for (const name of names) {
    const match = [...values.entries()].find(([key]) => key === name || key.endsWith(`.${name}`))?.[1]?.[0]
    if (match) return match.trim()
  }
  return null
}

/** Parses ADF only after a stateful XML safety scan and an entity-disabled XML parse. */
export function parseAdfXml(xml: string, provenance: 'adf' | 'attachment'): AdfLead | null {
  safeXmlLex(xml)
  const validation = XMLValidator.validate(xml)
  if (validation !== true) throw new Error(`Malformed XML: ${validation.err.msg}`)
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    processEntities: false,
    ignoreDeclaration: true,
    ignorePiTags: true,
    removeNSPrefix: true,
    transformTagName: tagName => tagName.toLowerCase()
  }).parse(xml)
  if (!parsed || typeof parsed !== 'object' || !Object.prototype.hasOwnProperty.call(parsed, 'adf')) return null
  const values = flattenXml(parsed)
  const first = firstValue(values, ['name:first', 'firstname', 'first_name'])
  const last = firstValue(values, ['name:last', 'lastname', 'last_name'])
  const full = [first, last].filter(Boolean).join(' ') || firstValue(values, ['fullname', 'full_name', 'name'])
  const contact = firstValue(values, ['email', 'emailaddress', 'phone', 'mobile', 'telephone'])
  if (!contact) return null
  const fields: Record<string, ExtractedEmailField> = {}
  if (full) fields.full_name = adfField(full, provenance)
  const email = firstValue(values, ['email', 'emailaddress']); if (email) fields.email = adfField(email, provenance)
  const phone = firstValue(values, ['phone', 'mobile', 'telephone']); if (phone) fields.phone = adfField(phone, provenance)
  const requestDate = firstValue(values, ['requestdate', 'request_date']); if (requestDate) fields.request_date = adfField(requestDate, provenance)
  const providerId = firstValue(values, ['leadid', 'providerid', 'id', 'reference'])
  if (providerId) fields.lead_id = adfField(providerId, provenance)
  const stock = firstValue(values, ['stocknumber', 'stock_number', 'stockno'])
  const year = firstValue(values, ['year']); const make = firstValue(values, ['make']); const model = firstValue(values, ['model'])
  const comments = firstValue(values, ['comments', 'comment', 'message', 'notes'])
  const provider = /carsales/i.test(firstValue(values, ['provider.name', 'providername']) ?? '') ? 'carsales' : 'generic'
  return {
    provider, providerId,
    externalIdHash: PLACEHOLDER_HASH, sourceName: provider === 'carsales' ? 'Carsales' : 'Generic lead email', medium: provider === 'carsales' ? 'classifieds' : 'lead_ingest', parser: 'adf',
    fields,
    vehicle: [year, make, model, stock].some(Boolean) ? { year: year ? adfField(year, provenance) : undefined, make: make ? adfField(make, provenance) : undefined, model: model ? adfField(model, provenance) : undefined, stock_number: stock ? adfField(stock, provenance) : undefined } : undefined,
    message: comments ? adfField(comments, provenance) : undefined,
    overallConfidence: 0.96, needsReview: !(email || phone), reviewReasons: email || phone ? [] : ['No customer contact found']
  }
}

export function emailLeadBody(email: NormalizedInboundEmail): string {
  return email.text?.trim() || (email.html ? htmlToText(email.html) : '')
}

function adfFromEmail(input: NormalizedInboundEmail, maxBytes: number): AdfLead | null {
  const body = emailLeadBody(input).trim()
  if (body.startsWith('<?xml') || /^<adf\b/i.test(body)) return parseAdfXml(body, 'adf')
  for (const attachment of input.attachments) {
    if (attachment.content.byteLength > Math.min(maxBytes, MAX_ADF_ATTACHMENT_BYTES)) continue
    const type = attachment.contentType.toLowerCase()
    if (!type.includes('xml') && !/\.(adf|xml)$/i.test(attachment.filename)) continue
    const extracted = parseAdfXml(new TextDecoder().decode(attachment.content), 'attachment')
    if (extracted) return extracted
  }
  return null
}

function fingerprint(input: NormalizedInboundEmail, extraction: EmailLeadExtraction): string {
  const entries = Object.entries(extraction.fields).filter(([key]) => key !== 'lead_id').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value.value.trim().toLowerCase()}`)
  const vehicle = Object.entries(extraction.vehicle ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value?.value.trim().toLowerCase() ?? ''}`)
  return `${extraction.provider}\n${input.subject.trim().toLowerCase()}\n${entries.join('\n')}\n${vehicle.join('\n')}\n${extraction.message?.value.trim().toLowerCase() ?? ''}`
}

function canonicalMessageId(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const candidate = trimmed.startsWith('<') || trimmed.endsWith('>')
    ? trimmed.match(/^<\s*([^<>\s]+)\s*>$/)?.[1]
    : trimmed
  if (!candidate) return null
  const match = candidate.match(/^([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)$/)
  return match ? `${match[1]}@${match[2]!.toLowerCase()}` : null
}

function withIdentity(input: NormalizedInboundEmail, extraction: EmailLeadExtraction, providerId: string | null): EmailLeadExtraction {
  const rawIdentity = providerId?.trim() || canonicalMessageId(input.messageId) || fingerprint(input, extraction)
  const fields = { ...extraction.fields }
  delete fields.lead_id
  return { ...extraction, fields, externalIdHash: sha256Hex(rawIdentity) }
}

const registry = registerProviderAdapters([...allEmailProviderAdapters])

/** Deterministic ADF → provider → generic extraction; this module performs no I/O or persistence. */
export function parseEmailLead(input: NormalizedInboundEmail, policy: EmailEndpointPolicy): EmailLeadExtraction | null {
  if (input.rawSize > policy.maxRawBytes || input.rawSize < 0) return null
  if (policy.parserMode !== 'generic') {
    const adf = adfFromEmail(input, policy.maxAdfAttachmentBytes)
    if (adf) return withIdentity(input, adf, adf.providerId)
    if (policy.parserMode === 'adf') return null
  }
  if (policy.parserMode !== 'generic') {
    const matched = registry.match(input, policy.expectedProvider)
    if (matched) {
      const extraction = matched.adapter.extract(input)
      if (extraction) return withIdentity(input, extraction, extraction.fields.lead_id?.value ?? null)
    }
  }
  const extraction = genericAdapter.extract(input)
  return extraction ? withIdentity(input, { ...extraction, parser: 'generic', provider: 'generic', sourceName: 'Generic lead email', medium: 'lead_ingest' }, extraction.fields.lead_id?.value ?? null) : null
}
