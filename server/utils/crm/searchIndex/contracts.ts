/**
 * Provider-independent CRM search domain contracts.
 *
 * Cloudflare model/Vectorize limits were rechecked on 2026-08-10:
 * https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/
 * https://developers.cloudflare.com/vectorize/platform/limits/
 */

export const CRM_SEARCH_SCHEMA_VERSION = 'crm-search-v1' as const
export const CRM_SEARCH_MODEL_ID = '@cf/baai/bge-base-en-v1.5' as const
export const CRM_SEARCH_POOLING = 'cls' as const
export const CRM_SEARCH_VECTOR_DIMENSIONS = 768 as const
export const CRM_SEARCH_MAX_INPUT_TOKENS = 512 as const
export const CRM_SEARCH_CANONICAL_MAX_CODE_POINTS = 1000 as const
export const CRM_SEARCH_DOCUMENT_BUILDER_REVISION = 'crm-search-document-v1' as const
export const CRM_SEARCH_NORMALIZATION_REVISION = 'nfkc-controls-whitespace-v1' as const

export const CRM_SEARCH_ENTITY_TYPES = ['person', 'company', 'opportunity'] as const
export const CRM_SEARCH_MODES = ['off', 'shadow', 'assist'] as const
export const CRM_SEARCH_POLICY_STATES = [
  'off',
  'indexing',
  'shadow',
  'assist',
  'teardown_pending'
] as const
export const CRM_SEARCH_GLOBAL_STATES = ['halted', 'delete_only', 'enabled'] as const
export const CRM_SEARCH_SCHEMA_ROLES = ['active', 'candidate', 'retiring'] as const
export const CRM_SEARCH_SURFACES = ['agency_global', 'portal_global', 'agency_ai'] as const
export const CRM_SEARCH_PROVIDER_ACTIONS = ['upsert', 'delete'] as const

export type CrmSearchEntityType = typeof CRM_SEARCH_ENTITY_TYPES[number]
export type CrmSearchMode = typeof CRM_SEARCH_MODES[number]
export type CrmSearchPolicyState = typeof CRM_SEARCH_POLICY_STATES[number]
export type CrmSearchGlobalState = typeof CRM_SEARCH_GLOBAL_STATES[number]
export type CrmSearchSchemaRole = typeof CRM_SEARCH_SCHEMA_ROLES[number]
export type CrmSearchSurface = typeof CRM_SEARCH_SURFACES[number]
export type CrmSearchProviderAction = typeof CRM_SEARCH_PROVIDER_ACTIONS[number]

export interface CrmSearchExactTokenizer {
  /** Exact immutable asset/revision identifier stored with the schema row. */
  readonly revision: string
  /**
   * Encodes with the schema-compatible tokenizer. When addSpecialTokens is
   * true, the returned count must include every provider-added special token.
   */
  encode: (
    text: string,
    options: Readonly<{ addSpecialTokens: true }>
  ) => readonly number[]
}

export type CrmSearchDocumentSource = {
  entityType: CrmSearchEntityType
  /** Untrusted source row. Builders select only their versioned allowlist. */
  source: Readonly<Record<string, unknown>>
}

export interface CrmSearchProviderMetadata {
  entityType: CrmSearchEntityType
  schemaVersion: string
  sourceRevision: number
  confirmationTag: string
  confirmationKeyVersion: string
}

export interface CrmSearchRateCardArithmetic {
  revision: string
  modelId: string
  validFrom: string
  validUntil: string
  revokedAt: string | null
  modelInputUsdMicrosPerMillionTokens: number
  queriedDimensionUsdMicrosPerMillion: number
  insertedDimensionUsdMicrosPerMillion: number
  storedDimensionUsdMicrosPerMillionMonth: number
}

export type CrmSearchActorType = 'staff' | 'portal' | 'system'
export type CrmSearchFallbackClass
  = | 'none'
    | 'mode_off'
    | 'privacy_guard'
    | 'budget_exhausted'
    | 'deadline'
    | 'provider_unavailable'
    | 'policy_changed'
    | 'authorization_changed'
    | 'ledger_failure'
    | 'join_back_failure'
    | 'validation_failure'

export type CrmSearchStatusClass
  = | 'keyword_only'
    | 'shadow_completed'
    | 'assist_completed'
    | 'fallback'
    | 'security_rejection'
