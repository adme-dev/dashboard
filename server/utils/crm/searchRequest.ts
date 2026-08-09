import { z } from 'zod'

export const CRM_SEARCH_PRIVACY_CLASSIFIER_VERSION = 'crm-search-privacy-v2' as const
export const CRM_SEARCH_TOKEN_ADMISSION_VERSION = 'bge-base-en-v1.5-conservative-utf8-v1' as const
export const CRM_SEARCH_CLIENT_SELECTOR_NORMALIZER_VERSION = 'crm-search-client-selector-v1' as const
export const CRM_SEARCH_MAX_CODE_POINTS = 256
export const CRM_SEARCH_MAX_CLIENT_SELECTOR_CODE_POINTS = 160
export const CRM_SEARCH_MAX_SEMANTIC_TOKENS = 512
export const CRM_SEARCH_DEFAULT_LIMIT = 20
export const CRM_SEARCH_MAX_LIMIT = 50

const SearchRequestSchema = z.object({
  clientId: z.string().uuid().optional(),
  query: z.string(),
  limit: z.number().int().optional()
}).strict()

const NormalizedSearchQuerySchema = z.string()
  .refine(value => value.length > 0, 'Search query is required')
  .refine(value => [...value].length <= CRM_SEARCH_MAX_CODE_POINTS, `Search query must be at most ${CRM_SEARCH_MAX_CODE_POINTS} code points`)

const NormalizedClientSelectorSchema = z.string()
  .refine(value => value.length > 0, 'Client selector is required')
  .refine(
    value => [...value].length <= CRM_SEARCH_MAX_CLIENT_SELECTOR_CODE_POINTS,
    `Client selector must be at most ${CRM_SEARCH_MAX_CLIENT_SELECTOR_CODE_POINTS} code points`
  )

export interface CrmSearchTokenAdmission {
  /** Identifies the exact counting contract used for this admission decision. */
  version: string
  countTokens: (normalizedQuery: string) => number
}

export interface NormalizeCrmSearchRequestOptions {
  tokenAdmission?: CrmSearchTokenAdmission
}

export type CrmSearchPrivacyReason
  = | 'eligible'
    | 'email'
    | 'phone'
    | 'uuid'
    | 'high_entropy_identifier'

export interface CrmSearchPrivacyClassification {
  version: typeof CRM_SEARCH_PRIVACY_CLASSIFIER_VERSION
  semanticEligible: boolean
  reason: CrmSearchPrivacyReason
}

export interface NormalizedCrmSearchRequest {
  clientId?: string
  query: string
  limit: number
  semanticEligible: boolean
}

export interface NormalizedCrmSearchClientSelector {
  version: typeof CRM_SEARCH_CLIENT_SELECTOR_NORMALIZER_VERSION
  value: string
}

/**
 * No exact BGE tokenizer assets are shipped in this slice. This admission is a
 * deliberately conservative upper bound: one token per UTF-8 byte plus the two
 * BERT special tokens. It can reject otherwise-safe non-ASCII queries, but it
 * cannot approve a query whose WordPiece input exceeds the provider budget.
 * The versioned interface lets the schema's exact tokenizer replace it later.
 */
export const conservativeBgeTokenAdmission: CrmSearchTokenAdmission = {
  version: CRM_SEARCH_TOKEN_ADMISSION_VERSION,
  countTokens(normalizedQuery) {
    return new TextEncoder().encode(normalizedQuery).byteLength + 2
  }
}

export function normalizeCrmSearchText(value: string): string {
  return value
    .normalize('NFKC')
    // Preserve separation for whitespace controls before removing all other
    // control/format characters, including bidi overrides and isolates.
    .replace(/[\t\n\v\f\r\u0085]/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\p{White_Space}+/gu, ' ')
    .trim()
}

export function normalizeCrmSearchClientSelector(
  input: unknown
): NormalizedCrmSearchClientSelector {
  const normalized = normalizeCrmSearchText(z.string().parse(input))
  return {
    version: CRM_SEARCH_CLIENT_SELECTOR_NORMALIZER_VERSION,
    value: NormalizedClientSelectorSchema.parse(normalized)
  }
}

function digitCount(value: string): number {
  return [...value].filter(character => /\p{Decimal_Number}/u.test(character)).length
}

function looksLikePhone(value: string): boolean {
  const candidates = value.match(/[+\p{Decimal_Number}][\p{Decimal_Number}\p{White_Space}().+\-/]{5,}[\p{Decimal_Number}]/gu) ?? []
  return candidates.some(candidate => digitCount(candidate) >= 7)
}

function shannonEntropy(value: string): number {
  const characters = [...value]
  const counts = new Map<string, number>()
  for (const character of characters) counts.set(character, (counts.get(character) ?? 0) + 1)
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / characters.length
    return entropy - probability * Math.log2(probability)
  }, 0)
}

function looksHighEntropy(value: string): boolean {
  const tokens = value.match(/[\p{Letter}\p{Number}+/_=-]{20,}/gu) ?? []
  return tokens.some((token) => {
    if (/^[0-9a-f]{24,}$/iu.test(token)) return true
    const characters = [...token]
    const categories = [
      /\p{Lowercase_Letter}/u.test(token),
      /\p{Uppercase_Letter}/u.test(token),
      /\p{Number}/u.test(token),
      /[+/_=-]/u.test(token)
    ].filter(Boolean).length
    const uniqueness = new Set(characters).size / characters.length
    const entropy = shannonEntropy(token)
    return entropy >= 3.5 && (categories >= 2 || uniqueness >= 0.7)
  })
}

/** Classifies the same normalized form that is eligible for provider use. */
export function classifyCrmSearchPrivacy(value: string): CrmSearchPrivacyClassification {
  const normalized = normalizeCrmSearchText(value)
  const decision = (reason: Exclude<CrmSearchPrivacyReason, 'eligible'>): CrmSearchPrivacyClassification => ({
    version: CRM_SEARCH_PRIVACY_CLASSIFIER_VERSION,
    semanticEligible: false,
    reason
  })

  if (/[^\s@]+@[^\s@]+(?:\.[^\s@.]+)+/u.test(normalized)) return decision('email')
  if (looksLikePhone(normalized)) return decision('phone')
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu.test(normalized)
    || /[\p{Letter}\p{Number}]{8}-[\p{Letter}\p{Number}]{4}-[\p{Letter}\p{Number}]{4}-[\p{Letter}\p{Number}]{4}-[\p{Letter}\p{Number}]{12}/u.test(normalized)) {
    return decision('uuid')
  }
  if (looksHighEntropy(normalized)) return decision('high_entropy_identifier')
  return {
    version: CRM_SEARCH_PRIVACY_CLASSIFIER_VERSION,
    semanticEligible: true,
    reason: 'eligible'
  }
}

export function normalizeCrmSearchRequest(
  input: unknown,
  options: NormalizeCrmSearchRequestOptions = {}
): NormalizedCrmSearchRequest {
  const parsed = SearchRequestSchema.parse(input)
  const query = NormalizedSearchQuerySchema.parse(normalizeCrmSearchText(parsed.query))
  const limit = parsed.limit === undefined
    ? CRM_SEARCH_DEFAULT_LIMIT
    : Math.max(1, Math.min(CRM_SEARCH_MAX_LIMIT, parsed.limit))
  const privacy = classifyCrmSearchPrivacy(query)
  const tokenAdmission = options.tokenAdmission ?? conservativeBgeTokenAdmission
  const tokenCount = tokenAdmission.countTokens(query)
  const withinSemanticBudget = Number.isInteger(tokenCount)
    && tokenCount >= 0
    && tokenCount <= CRM_SEARCH_MAX_SEMANTIC_TOKENS

  return {
    ...(parsed.clientId ? { clientId: parsed.clientId } : {}),
    query,
    limit,
    semanticEligible: privacy.semanticEligible && withinSemanticBudget
  }
}
