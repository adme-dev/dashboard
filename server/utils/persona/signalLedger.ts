import type { TrackingEventRow } from '~~/server/utils/tracking/event-insert'
import type { LeadTransactionClient } from '~~/server/utils/leads/db'
import { normalizeProductIdentifier, type ProductIdentifierType } from '~~/server/utils/leads/leadProductInterest'
import { isPersonaIdentityEnabled } from '~~/server/utils/persona/feature'

interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

type ConsentValue = 'granted' | 'denied' | 'unknown'

export type CustomerSignalClass = 'behaviour' | 'intent' | 'conversion' | 'lifecycle'

const INTENT_SIGNALS = new Set([
  'phone_click',
  'outbound_click',
  'form_start',
  'form_submit',
  'form_abandonment',
  'vehicle_view',
  'vehicle_list_view',
  'search',
  'filter_change',
  'finance_calculator_interact',
  'trade_in_start',
  'trade_in_complete',
  'test_drive_booking',
  'add_to_wishlist',
  'return_to_vehicle'
])

const CONVERSION_SIGNALS = new Set(['generate_lead', 'lead_created'])

const SAFE_EVENT_FIELDS = [
  'vehicle_id',
  'source_product_id',
  'vehicle_vin',
  'vin',
  'vehicle_stock_number',
  'stock_number',
  'stock_id',
  'product_sku',
  'sku',
  'vehicle_year',
  'vehicle_make',
  'vehicle_model',
  'vehicle_variant',
  'vehicle_condition',
  'body_type',
  'form_id',
  'lead_provider'
] as const

function text(value: unknown, max = 512): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim()
  return normalized ? normalized.slice(0, max) : null
}

function consentValue(value: unknown): ConsentValue {
  return value === 'granted' || value === 'denied' ? value : 'unknown'
}

export async function hashPersonaSubject(
  clientId: string,
  kind: 'anon' | 'session' | 'lead',
  value: string
): Promise<string> {
  const source = `persona-subject:v1:${clientId}:${kind}:${value.trim()}`
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source)
  )
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function safePagePath(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`.slice(0, 2048)
  } catch {
    return value.split(/[?#]/, 1)[0]?.slice(0, 2048) || null
  }
}

function referrerHost(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase().slice(0, 255)
  } catch {
    return null
  }
}

export function classifyCustomerSignal(eventName: string): CustomerSignalClass {
  if (CONVERSION_SIGNALS.has(eventName)) return 'conversion'
  if (INTENT_SIGNALS.has(eventName)) return 'intent'
  if (['contacted', 'qualified', 'won', 'lost', 'sold'].includes(eventName)) return 'lifecycle'
  return 'behaviour'
}

function platformFor(row: TrackingEventRow): string {
  const source = row.utm_source?.trim().toLowerCase() ?? ''
  if (row.gclid || row.gbraid || row.wbraid || /google|adwords/.test(source)) return 'google'
  if (row.fbclid || row.fbc || row.fbp || /facebook|instagram|meta|^fb$|^ig$/.test(source)) return 'meta'
  if (row.ttclid || /tiktok/.test(source)) return 'tiktok'
  if (row.li_fat_id || /linkedin/.test(source)) return 'linkedin'
  if (/email|newsletter/.test(source)) return 'email'
  return source || (row.referrer ? 'referral' : 'direct')
}

export function sanitizeTrackingSignalContext(row: TrackingEventRow): Record<string, unknown> {
  const context: Record<string, unknown> = {
    platform: platformFor(row),
    pagePath: safePagePath(row.page_url),
    referrerHost: referrerHost(row.referrer),
    campaign: text(row.utm_campaign),
    medium: text(row.utm_medium)
  }
  for (const key of SAFE_EVENT_FIELDS) {
    const value = text(row.event_data[key], key.includes('url') ? 2048 : 512)
    if (value) context[key] = value
  }
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== null))
}

function productIdentifiers(row: TrackingEventRow): Array<{ type: ProductIdentifierType, value: string }> {
  const productPageSignals = new Set([
    'product_view',
    'vehicle_view',
    'view_item',
    'product_enquiry',
    'vehicle_enquiry'
  ])
  const productUrl = row.event_data.product_url
    ?? row.event_data.vehicle_url
    ?? (productPageSignals.has(row.event_name) ? row.page_url : null)
  const candidates: Array<[ProductIdentifierType, unknown]> = [
    ['vin', row.event_data.vehicle_vin ?? row.event_data.vin],
    ['stock_id', row.event_data.vehicle_stock_number ?? row.event_data.stock_number ?? row.event_data.stock_id],
    ['sku', row.event_data.product_sku ?? row.event_data.sku],
    ['source_product_id', row.event_data.source_product_id ?? row.event_data.vehicle_id],
    ['product_url', productUrl]
  ]
  return candidates.flatMap(([type, value]) => {
    const candidate = text(value, 2048)
    return candidate ? [{ type, value: normalizeProductIdentifier(type, candidate) }] : []
  })
}

async function resolveProductId(
  db: SqlClient,
  clientId: string,
  row: TrackingEventRow
): Promise<string | null> {
  const identifiers = productIdentifiers(row)
  if (!identifiers.length) return null
  const result = await db.query(
    `SELECT identifier.product_id
       FROM crm_product_identifiers identifier
       JOIN crm_products product
         ON product.client_id = identifier.client_id
        AND product.id = identifier.product_id
        AND product.deleted_at IS NULL
      WHERE identifier.client_id = $1
        AND (identifier.identifier_type, identifier.normalized_value)
            IN (SELECT * FROM UNNEST($2::text[], $3::text[]))
      ORDER BY CASE identifier.identifier_type
        WHEN 'vin' THEN 1
        WHEN 'stock_id' THEN 2
        WHEN 'sku' THEN 3
        WHEN 'source_product_id' THEN 4
        ELSE 5
      END
      LIMIT 1`,
    [
      clientId,
      identifiers.map(identifier => identifier.type),
      identifiers.map(identifier => identifier.value)
    ]
  )
  return (result.rows?.[0] as { product_id?: string } | undefined)?.product_id ?? null
}

function consentSnapshot(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return {
    tracking: consentValue(source.tracking),
    analytics: consentValue(source.analytics),
    marketing: consentValue(source.marketing),
    source: text(source.source, 80) ?? 'unknown',
    region: text(source.region, 16)
  }
}

async function consentHash(snapshot: ReturnType<typeof consentSnapshot>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot))
  )
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function profileForHashes(
  db: SqlClient,
  clientId: string,
  hashes: string[]
): Promise<string | null> {
  if (!hashes.length) return null
  const result = await db.query(
    `SELECT profile_id
       FROM crm_identity_keys
      WHERE client_id = $1
        AND identity_type = 'browser'
        AND identity_hash = ANY($2::text[])
      GROUP BY profile_id
      HAVING COUNT(*) > 0
      LIMIT 2`,
    [clientId, hashes]
  )
  return result.rows?.length === 1
    ? (result.rows[0] as { profile_id: string }).profile_id
    : null
}

export async function appendTrackingSignals(
  db: SqlClient,
  rows: TrackingEventRow[],
  receivedAt: string
): Promise<number> {
  if (!rows.length) return 0
  const firstRow = rows[0]
  if (!firstRow) return 0
  const clientId = firstRow.client_id
  if (!await isPersonaIdentityEnabled(clientId)) return 0
  let inserted = 0
  const profileCache = new Map<string, string | null>()
  const consentSubjects = new Map<string, {
    profileId: string | null
    row: TrackingEventRow
    snapshot: ReturnType<typeof consentSnapshot>
  }>()

  for (const row of rows) {
    if (row.client_id !== clientId) continue
    const anonHash = await hashPersonaSubject(clientId, 'anon', row.anon_id)
    const sessionHash = row.session_id
      ? await hashPersonaSubject(clientId, 'session', row.session_id)
      : null
    const hashes = [anonHash, sessionHash].filter((value): value is string => Boolean(value))
    const profileCacheKey = hashes.join(':')
    const cachedProfile = profileCache.get(profileCacheKey)
    const profileId = cachedProfile !== undefined
      ? cachedProfile
      : await profileForHashes(db, clientId, hashes)
    if (cachedProfile === undefined) profileCache.set(profileCacheKey, profileId)
    const consent = consentSnapshot(row.consent)
    const productId = await resolveProductId(db, clientId, row)
    const result = await db.query(
      `INSERT INTO crm_customer_signals (
         client_id, profile_id, subject_hash, source_type, source_id,
         signal_class, signal_key, product_id, confidence,
         consent_marketing, context, occurred_at
       ) VALUES (
         $1, $2, $3, 'tracking', $4, $5, $6, $7, 1, $8, $9::jsonb, $10::timestamptz
       )
       ON CONFLICT (client_id, source_type, source_id, signal_key) DO NOTHING
       RETURNING id`,
      [
        clientId,
        profileId,
        anonHash,
        row.event_id,
        classifyCustomerSignal(row.event_name),
        row.event_name,
        productId,
        consent.marketing,
        JSON.stringify(sanitizeTrackingSignalContext(row)),
        row.occurred_at ?? receivedAt
      ]
    )
    if (result.rows?.length) inserted++
    consentSubjects.set(anonHash, { profileId, row, snapshot: consent })
  }

  for (const [subjectHash, item] of consentSubjects) {
    const snapshotHash = await consentHash(item.snapshot)
    await db.query(
      `INSERT INTO crm_consent_history (
         client_id, profile_id, subject_hash, snapshot_hash,
         tracking, analytics, marketing, consent_source, region,
         source_event_id, occurred_at
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz
       WHERE COALESCE((
         SELECT history.snapshot_hash
           FROM crm_consent_history history
          WHERE history.client_id = $1
            AND history.subject_hash = $3
          ORDER BY history.occurred_at DESC, history.created_at DESC
          LIMIT 1
       ), '') <> $4
       ON CONFLICT (client_id, subject_hash, snapshot_hash, source_event_id) DO NOTHING`,
      [
        clientId,
        item.profileId,
        subjectHash,
        snapshotHash,
        item.snapshot.tracking,
        item.snapshot.analytics,
        item.snapshot.marketing,
        item.snapshot.source,
        item.snapshot.region,
        item.row.event_id,
        item.row.occurred_at ?? receivedAt
      ]
    )
  }
  return inserted
}

function attributionValue(value: Record<string, string> | null, key: string): string | null {
  return text(value?.[key], 512)
}

function safeLeadContext(input: ConnectLeadSignalInput): Record<string, unknown> {
  const fields = input.fieldData
  const context: Record<string, unknown> = {
    provider: input.source,
    campaign: attributionValue(input.attribution, 'utm_campaign'),
    platform: attributionValue(input.attribution, 'utm_source'),
    vehicle_id: text(fields.vehicle_id ?? fields.source_product_id),
    vehicle_vin: text(fields.vehicle_vin ?? fields.vin),
    stock_id: text(fields.vehicle_stock_number ?? fields.stock_number ?? fields.stock_id),
    sku: text(fields.product_sku ?? fields.sku)
  }
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== null))
}

export interface ConnectLeadSignalInput {
  clientId: string
  leadId: string
  source: string
  browserEventId: string | null
  fieldData: Record<string, string>
  attribution: Record<string, string> | null
  consentDecision: 'granted' | 'denied' | 'unknown'
  occurredAt: string
}

export async function connectLeadSignalContext(
  db: LeadTransactionClient,
  input: ConnectLeadSignalInput
): Promise<{ status: 'linked' | 'anonymous' | 'disabled' | 'identity_conflict', profileId: string | null }> {
  if (!await isPersonaIdentityEnabled(input.clientId)) {
    return { status: 'disabled', profileId: null }
  }
  const linked = await db.query(
    `SELECT profile_id
       FROM crm_lead_identity_links
      WHERE client_id = $1 AND lead_id = $2
      LIMIT 1`,
    [input.clientId, input.leadId]
  )
  const profileId = (linked.rows?.[0] as { profile_id?: string } | undefined)?.profile_id ?? null
  let subjectHash = await hashPersonaSubject(input.clientId, 'lead', input.leadId)

  if (input.browserEventId) {
    const tracked = await db.query(
      `SELECT anon_id, session_id
         FROM tracking_events
        WHERE client_id = $1 AND event_id = $2
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1`,
      [input.clientId, input.browserEventId]
    )
    const source = tracked.rows?.[0] as { anon_id?: string, session_id?: string | null } | undefined
    if (source?.anon_id) {
      const anonHash = await hashPersonaSubject(input.clientId, 'anon', source.anon_id)
      const sessionHash = source.session_id
        ? await hashPersonaSubject(input.clientId, 'session', source.session_id)
        : null
      subjectHash = anonHash
      if (profileId) {
        for (const hash of [anonHash, sessionHash].filter((value): value is string => Boolean(value))) {
          await db.query(
            `INSERT INTO crm_identity_keys (
               client_id, profile_id, identity_type, identity_hash, first_seen_at, last_seen_at
             ) VALUES ($1, $2, 'browser', $3, $4::timestamptz, $4::timestamptz)
             ON CONFLICT (client_id, identity_type, identity_hash) DO NOTHING`,
            [input.clientId, profileId, hash, input.occurredAt]
          )
        }
        const conflicts = await db.query(
          `SELECT DISTINCT profile_id
             FROM crm_identity_keys
            WHERE client_id = $1
              AND identity_type = 'browser'
              AND identity_hash = ANY($2::text[])`,
          [input.clientId, [anonHash, sessionHash].filter(Boolean)]
        )
        const profileIds = (conflicts.rows ?? []).map(row => (row as { profile_id: string }).profile_id)
        if (profileIds.some(id => id !== profileId)) {
          return { status: 'identity_conflict', profileId }
        }
        await db.query(
          `UPDATE crm_customer_signals
              SET profile_id = $2
            WHERE client_id = $1
              AND subject_hash = ANY($3::text[])
              AND profile_id IS NULL`,
          [input.clientId, profileId, [anonHash, sessionHash].filter(Boolean)]
        )
        await db.query(
          `INSERT INTO crm_identity_evidence (
             client_id, profile_id, evidence_type, source, source_id,
             confidence, metadata, occurred_at
           ) VALUES (
             $1, $2, 'browser_submission', 'signal_ledger', $3,
             95, $4::jsonb, $5::timestamptz
           )
           ON CONFLICT (
             client_id, profile_id, evidence_type, source, source_id
           ) DO NOTHING`,
          [
            input.clientId,
            profileId,
            input.browserEventId,
            JSON.stringify({ subject_hash: anonHash, lead_id: input.leadId }),
            input.occurredAt
          ]
        )
      }
    }
  }

  const product = await db.query(
    `SELECT product_id
       FROM crm_lead_product_interests
      WHERE client_id = $1 AND lead_id = $2
      ORDER BY is_primary DESC, match_confidence DESC, created_at
      LIMIT 1`,
    [input.clientId, input.leadId]
  )
  const productId = (product.rows?.[0] as { product_id?: string | null } | undefined)?.product_id ?? null
  await db.query(
    `INSERT INTO crm_customer_signals (
       client_id, profile_id, subject_hash, source_type, source_id,
       signal_class, signal_key, product_id, confidence,
       consent_marketing, context, occurred_at
     ) VALUES (
       $1, $2, $3, 'lead', $4, 'conversion', 'lead_created',
       $5, 1, $6, $7::jsonb, $8::timestamptz
     )
     ON CONFLICT (client_id, source_type, source_id, signal_key) DO NOTHING`,
    [
      input.clientId,
      profileId,
      subjectHash,
      input.leadId,
      productId,
      input.consentDecision,
      JSON.stringify(safeLeadContext(input)),
      input.occurredAt
    ]
  )
  return {
    status: profileId ? 'linked' : 'anonymous',
    profileId
  }
}
