import { createHash } from 'node:crypto'
import type { LeadTransactionClient } from '~~/server/utils/leads/db'

export type ProductIdentifierType = 'vin' | 'stock_id' | 'sku' | 'source_product_id' | 'product_url'
export interface ProductIdentifier { type: ProductIdentifierType, value: string }
export interface ExtractedProductInterest {
  identifiers: ProductIdentifier[]
  snapshot: Record<string, string>
}

const ALIASES: Array<[ProductIdentifierType, string[]]> = [
  ['vin', ['vehicle_vin', 'vin']],
  ['stock_id', ['vehicle_stock_number', 'stock_number', 'stock_id', 'stock_no']],
  ['sku', ['product_sku', 'sku']],
  ['source_product_id', ['source_product_id', 'vehicle_id', 'product_id']],
  ['product_url', ['product_url', 'vehicle_url', 'page_url']]
]
const SNAPSHOT_FIELDS = [
  'vehicle_year', 'vehicle_make', 'vehicle_model', 'vehicle_variant', 'vehicle_price',
  'vehicle_vin', 'vin', 'vehicle_stock_number', 'stock_number', 'stock_id',
  'product_sku', 'sku', 'source_product_id', 'vehicle_id', 'product_id',
  'product_url', 'vehicle_url', 'page_url', 'lead_provider'
]

function normalize(type: ProductIdentifierType, value: string): string {
  const trimmed = value.trim()
  if (type === 'product_url') {
    try {
      const url = new URL(trimmed)
      url.hash = ''
      return url.toString().replace(/\/$/, '').toLowerCase()
    } catch {
      return trimmed.toLowerCase()
    }
  }
  return trimmed.replace(/\s+/g, '').toUpperCase()
}

export function extractProductInterest(fieldData: Record<string, string>): ExtractedProductInterest | null {
  const identifiers: ProductIdentifier[] = []
  for (const [type, aliases] of ALIASES) {
    const value = aliases.map(alias => fieldData[alias]?.trim()).find(Boolean)
    if (value) identifiers.push({ type, value: normalize(type, value) })
  }
  if (!identifiers.length) return null
  const snapshot: Record<string, string> = {}
  for (const key of SNAPSHOT_FIELDS) {
    const value = fieldData[key]?.trim()
    if (value) snapshot[key] = value.slice(0, 2048)
  }
  return { identifiers, snapshot }
}

const PRECEDENCE: ProductIdentifierType[] = ['vin', 'stock_id', 'sku', 'source_product_id', 'product_url']

export async function captureLeadProductInterest(
  db: LeadTransactionClient,
  input: { clientId: string, leadId: string, fieldData: Record<string, string> }
): Promise<{ productId: string | null, matchMethod: string, confidence: number } | null> {
  const interest = extractProductInterest(input.fieldData)
  if (!interest) return null
  const types = interest.identifiers.map(identifier => identifier.type)
  const values = interest.identifiers.map(identifier => identifier.value)
  const result = await db.query(
    `SELECT identifier.product_id, identifier.identifier_type, identifier.normalized_value
       FROM crm_product_identifiers identifier
       JOIN crm_products product
         ON product.client_id = identifier.client_id
        AND product.id = identifier.product_id
        AND product.deleted_at IS NULL
      WHERE identifier.client_id = $1
        AND identifier.identifier_type = ANY($2::text[])
        AND identifier.normalized_value = ANY($3::text[])`,
    [input.clientId, types, values]
  )
  const candidates = (result.rows ?? []) as Array<{
    product_id: string
    identifier_type: ProductIdentifierType
    normalized_value: string
  }>
  const exact = candidates.filter(candidate => interest.identifiers.some(identifier => (
    identifier.type === candidate.identifier_type && identifier.value === candidate.normalized_value
  )))
  const ranked = exact.sort((a, b) => PRECEDENCE.indexOf(a.identifier_type) - PRECEDENCE.indexOf(b.identifier_type))
  const best = ranked[0]
  const ambiguous = best && ranked.some(candidate => (
    candidate.identifier_type === best.identifier_type && candidate.product_id !== best.product_id
  ))
  const productId = best && !ambiguous ? best.product_id : null
  const matchMethod = productId ? `exact_${best.identifier_type}` : ambiguous ? 'ambiguous_exact' : 'unmatched'
  const confidence = productId ? 100 : 0
  const interestKey = createHash('sha256')
    .update(interest.identifiers.map(identifier => `${identifier.type}:${identifier.value}`).join('|'))
    .digest('hex')

  await db.query(
    `INSERT INTO crm_lead_product_interests (
       client_id, lead_id, product_id, interest_key, match_method, match_confidence, inquiry_snapshot
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (lead_id, interest_key) DO NOTHING`,
    [input.clientId, input.leadId, productId, interestKey, matchMethod, confidence, JSON.stringify(interest.snapshot)]
  )
  return { productId, matchMethod, confidence }
}
