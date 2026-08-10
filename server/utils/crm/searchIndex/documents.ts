import {
  CRM_SEARCH_CANONICAL_MAX_CODE_POINTS,
  CRM_SEARCH_DOCUMENT_BUILDER_REVISION,
  CRM_SEARCH_ENTITY_TYPES,
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_NORMALIZATION_REVISION,
  type CrmSearchDocumentSource,
  type CrmSearchEntityType,
  type CrmSearchExactTokenizer,
  type CrmSearchProviderMetadata
} from './contracts'

export const CRM_SEARCH_PROVIDER_METADATA_FIELDS = Object.freeze([
  'entityType',
  'schemaVersion',
  'sourceRevision',
  'confirmationTag',
  'confirmationKeyVersion'
] as const)

export const CRM_SEARCH_INDEXED_METADATA_FIELDS = Object.freeze([
  'entityType',
  'schemaVersion'
] as const)

const encoder = new TextEncoder()
const schemaVersionPattern = /^crm-search-v[1-9][0-9]*$/
const confirmationTagPattern = /^hmac-sha256:[a-f0-9]{64}$/
const keyVersionPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/

type FieldSpec = Readonly<{ key: string, label: string, maxCodePoints: number, lowercase?: boolean }>
type FieldKeys<Specs extends readonly FieldSpec[]> = {
  readonly [Index in keyof Specs]: Specs[Index] extends FieldSpec ? Specs[Index]['key'] : never
}

const FIELD_SPECS = Object.freeze({
  person: Object.freeze([
    { key: 'first_name', label: 'First name', maxCodePoints: 200 },
    { key: 'last_name', label: 'Last name', maxCodePoints: 200 },
    { key: 'job_title', label: 'Job title', maxCodePoints: 160 },
    { key: 'department', label: 'Department', maxCodePoints: 160 },
    { key: 'lifecycle_stage', label: 'Lifecycle stage', maxCodePoints: 160 }
  ] as const),
  company: Object.freeze([
    { key: 'name', label: 'Name', maxCodePoints: 240 },
    { key: 'domain', label: 'Domain', maxCodePoints: 253, lowercase: true },
    { key: 'lifecycle_stage', label: 'Lifecycle stage', maxCodePoints: 160 }
  ] as const),
  opportunity: Object.freeze([
    { key: 'name', label: 'Name', maxCodePoints: 300 },
    { key: 'status', label: 'Status', maxCodePoints: 160 },
    { key: 'source', label: 'Source', maxCodePoints: 160 }
  ] as const)
}) satisfies Readonly<Record<CrmSearchEntityType, readonly FieldSpec[]>>

function fieldKeys<const Specs extends readonly FieldSpec[]>(specs: Specs): FieldKeys<Specs> {
  return Object.freeze(specs.map(spec => spec.key)) as unknown as FieldKeys<Specs>
}

// The public allowlist is derived from the exact builder specs so advertised
// fields/order cannot drift from what is sent to the embedding provider.
export const CRM_SEARCH_V1_FIELDS = Object.freeze({
  person: fieldKeys(FIELD_SPECS.person),
  company: fieldKeys(FIELD_SPECS.company),
  opportunity: fieldKeys(FIELD_SPECS.opportunity)
})

export interface BuildCrmSearchDocumentOptions {
  /** No approximate/default tokenizer is admissible for provider input. */
  tokenizer: CrmSearchExactTokenizer
  /** Exact revision loaded from the active schema contract. */
  expectedTokenizerRevision: string
}

export interface BuiltCrmSearchDocument {
  canonicalText: string
  contentHash: string
  providerInput: string
  providerTokenCount: number
  tokenizerRevision: string
  documentBuilderRevision: typeof CRM_SEARCH_DOCUMENT_BUILDER_REVISION
  normalizationRevision: typeof CRM_SEARCH_NORMALIZATION_REVISION
}

function sliceCodePoints(value: string, maximum: number): string {
  return [...value].slice(0, maximum).join('')
}

function stripDocumentControls(value: string): string {
  return [...value].filter((character) => {
    const codePoint = character.codePointAt(0)!
    return !(
      codePoint <= 0x1f
      || (codePoint >= 0x7f && codePoint <= 0x9f)
      || (codePoint >= 0x202a && codePoint <= 0x202e)
      || (codePoint >= 0x2066 && codePoint <= 0x2069)
    )
  }).join('')
}

export function normalizeCrmSearchDocumentField(value: unknown, maximum: number): string {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > CRM_SEARCH_CANONICAL_MAX_CODE_POINTS) {
    throw new RangeError('CRM search document field bound must be between 1 and 1,000 code points')
  }
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') throw new TypeError('CRM search approved field must be text or null')

  const whitespaceNormalized = value
    .normalize('NFKC')
    // Convert whitespace controls to a boundary before stripping the remaining
    // C0/C1 and bidi override/isolate controls, matching the SQL projection.
    .replace(/\p{White_Space}+/gu, ' ')

  const normalized = stripDocumentControls(whitespaceNormalized)
    .replace(/\p{White_Space}+/gu, ' ')
    .trim()

  return sliceCodePoints(normalized, maximum)
}

function requireDocumentSource(input: CrmSearchDocumentSource): {
  entityType: CrmSearchEntityType
  source: Readonly<Record<string, unknown>>
} {
  if (!input || typeof input !== 'object') throw new TypeError('CRM search document source is required')
  if (!CRM_SEARCH_ENTITY_TYPES.includes(input.entityType as CrmSearchEntityType)) {
    throw new TypeError('CRM search document entity type is invalid')
  }
  if (!input.source || typeof input.source !== 'object' || Array.isArray(input.source)) {
    throw new TypeError('CRM search document source fields are invalid')
  }
  return { entityType: input.entityType, source: input.source }
}

function canonicalLines(input: CrmSearchDocumentSource): string[] {
  const { entityType, source } = requireDocumentSource(input)
  const lines: string[] = []
  for (const spec of FIELD_SPECS[entityType]) {
    let value = normalizeCrmSearchDocumentField(source[spec.key], spec.maxCodePoints)
    if ('lowercase' in spec && spec.lowercase) {
      value = sliceCodePoints(value.toLowerCase(), spec.maxCodePoints)
    }
    if (value !== '') lines.push(`${spec.label}: ${value}`)
  }
  return lines
}

function requireTokenizer(options: BuildCrmSearchDocumentOptions | undefined): CrmSearchExactTokenizer {
  if (!options?.tokenizer || typeof options.tokenizer.encode !== 'function') {
    throw new Error('An exact schema-pinned tokenizer is required')
  }
  if (typeof options.expectedTokenizerRevision !== 'string'
    || options.expectedTokenizerRevision.trim() === ''
    || options.expectedTokenizerRevision.length > 200) {
    throw new Error('Expected tokenizer revision is invalid')
  }
  if (options.tokenizer.revision !== options.expectedTokenizerRevision) {
    throw new Error('Exact tokenizer revision does not match the schema contract')
  }
  return options.tokenizer
}

function exactTokenCount(tokenizer: CrmSearchExactTokenizer, text: string): number {
  const tokens = tokenizer.encode(text, { addSpecialTokens: true })
  if (!Array.isArray(tokens)
    || tokens.length < 2
    || tokens.some(token => !Number.isSafeInteger(token) || token < 0)) {
    throw new Error('Exact tokenizer output is invalid')
  }
  return tokens.length
}

function providerInputWithinTokenLimit(
  canonicalText: string,
  tokenizer: CrmSearchExactTokenizer
): { providerInput: string, providerTokenCount: number } {
  const fullCount = exactTokenCount(tokenizer, canonicalText)
  if (fullCount <= CRM_SEARCH_MAX_INPUT_TOKENS) {
    return { providerInput: canonicalText, providerTokenCount: fullCount }
  }

  // The canonical order is also the field-priority order. Search the bounded
  // 1,000-code-point prefix space from longest to shortest instead of assuming
  // tokenizer counts are monotonic as characters are appended.
  const codePoints = [...canonicalText]
  for (let length = codePoints.length - 1; length > 0; length -= 1) {
    const candidate = codePoints.slice(0, length).join('').trimEnd()
    if (candidate === '') continue
    const count = exactTokenCount(tokenizer, candidate)
    if (count <= CRM_SEARCH_MAX_INPUT_TOKENS) {
      return { providerInput: candidate, providerTokenCount: count }
    }
  }
  throw new Error('Exact tokenizer cannot fit a non-empty document within 512 tokens')
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is unavailable')
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(value)
  )))
}

export async function buildCrmSearchDocument(
  input: CrmSearchDocumentSource,
  options: BuildCrmSearchDocumentOptions
): Promise<BuiltCrmSearchDocument> {
  const tokenizer = requireTokenizer(options)
  const canonicalText = sliceCodePoints(
    canonicalLines(input).join('\n'),
    CRM_SEARCH_CANONICAL_MAX_CODE_POINTS
  )
  if (canonicalText === '') throw new Error('CRM search document projection is empty')

  const provider = providerInputWithinTokenLimit(canonicalText, tokenizer)
  return {
    canonicalText,
    contentHash: await sha256Hex(canonicalText),
    ...provider,
    tokenizerRevision: tokenizer.revision,
    documentBuilderRevision: CRM_SEARCH_DOCUMENT_BUILDER_REVISION,
    normalizationRevision: CRM_SEARCH_NORMALIZATION_REVISION
  }
}

export function buildCrmSearchProviderMetadata(input: CrmSearchProviderMetadata): CrmSearchProviderMetadata {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('CRM search provider metadata is invalid')
  }
  const allowed = new Set<string>(CRM_SEARCH_PROVIDER_METADATA_FIELDS)
  const unexpected = Object.keys(input).find(key => !allowed.has(key))
  if (unexpected) throw new TypeError(`Unsupported CRM search metadata field: ${unexpected}`)
  if (!CRM_SEARCH_ENTITY_TYPES.includes(input.entityType as CrmSearchEntityType)) {
    throw new TypeError('CRM search metadata entity type is invalid')
  }
  if (typeof input.schemaVersion !== 'string' || !schemaVersionPattern.test(input.schemaVersion)) {
    throw new TypeError('CRM search metadata schema version is invalid')
  }
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new TypeError('CRM search metadata source revision is invalid')
  }
  if (typeof input.confirmationTag !== 'string'
    || !confirmationTagPattern.test(input.confirmationTag)) {
    throw new TypeError('CRM search metadata confirmation tag is invalid')
  }
  if (typeof input.confirmationKeyVersion !== 'string'
    || !keyVersionPattern.test(input.confirmationKeyVersion)) {
    throw new TypeError('CRM search metadata confirmation key version is invalid')
  }

  return {
    entityType: input.entityType,
    schemaVersion: input.schemaVersion,
    sourceRevision: input.sourceRevision,
    confirmationTag: input.confirmationTag,
    confirmationKeyVersion: input.confirmationKeyVersion
  }
}
