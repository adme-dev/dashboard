import { randomBytes, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { EmailLeadEndpoint } from '~~/app/types'
import { queryOne, transaction } from '~~/server/utils/db'
import { applyEmailRoutingPreset, type EmailRoutingPreset } from '~~/server/utils/leads/emailRoutingPreset'

const ADDRESS_DOMAIN = 'leads.xeroflow.io'
const TOKEN_BYTES = 24
const MAX_LOCAL_PART_LENGTH = 64

type DbClient = Parameters<typeof transaction>[0] extends (client: infer Client) => Promise<unknown> ? Client : never

export interface CreateEmailEndpointInput {
  clientId: string
  label: string
  addressPrefix?: string
  expectedProvider?: string | null
  parserMode?: 'auto' | 'adf' | 'generic'
  aiExtractionMode?: 'disabled' | 'fallback'
  allowedSenderDomains?: string[]
  expectedMaxSilenceHours?: number | null
  firstResponseSlaMinutes?: number | null
  formName: string
  routingPreset?: EmailRoutingPreset | null
  notificationEmail?: string
  assignedUserId?: string
}

export interface UpdateEmailEndpointInput {
  label?: string
  addressPrefix?: string
  expectedProvider?: string | null
  parserMode?: 'auto' | 'adf' | 'generic'
  aiExtractionMode?: 'disabled' | 'fallback'
  allowedSenderDomains?: string[]
  expectedMaxSilenceHours?: number | null
  firstResponseSlaMinutes?: number | null
  formName?: string
  enabled?: boolean
  retire?: boolean
}

export function generateEmailEndpointToken(): string {
  // This is deliberately the RecipientTokenSchema format used across the signed
  // Worker/Nitro boundary: 192 bits of CSPRNG output, URL-safe and opaque.
  return `lead_${randomBytes(TOKEN_BYTES).toString('base64url')}`
}

export function normalizeEmailEndpointPrefix(value: string): string {
  const normalized = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized || normalized.length > 32) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_address_prefix' })
  }
  return normalized
}

function addressFor(prefix: string, token: string) {
  const localPart = `${prefix}-${token}`
  if (localPart.length > MAX_LOCAL_PART_LENGTH) throw createError({ statusCode: 400, statusMessage: 'email_address_too_long' })
  return `${localPart}@${ADDRESS_DOMAIN}`
}

function normalizeDomains(domains: string[] | undefined) {
  const result = [...new Set((domains ?? []).map(domain => domain.trim().toLowerCase()))]
  if (result.length > 100 || result.some(domain => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain))) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_sender_domains' })
  }
  return result
}

function validateBounds(input: Pick<CreateEmailEndpointInput, 'expectedMaxSilenceHours' | 'firstResponseSlaMinutes'>) {
  if (input.expectedMaxSilenceHours != null && (!Number.isInteger(input.expectedMaxSilenceHours) || input.expectedMaxSilenceHours < 1 || input.expectedMaxSilenceHours > 8760)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_expected_max_silence_hours' })
  }
  if (input.firstResponseSlaMinutes != null && (!Number.isInteger(input.firstResponseSlaMinutes) || input.firstResponseSlaMinutes < 1 || input.firstResponseSlaMinutes > 43200)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_first_response_sla_minutes' })
  }
}

async function assertActorCanManageClient(db: DbClient, clientId: string, actorId: string) {
  const access = await db.query<{ allowed: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = $1 AND tm.is_active = TRUE
        AND (tm.user_role IN ('owner', 'admin', 'lead', 'project_manager') OR EXISTS (
          SELECT 1 FROM client_team_assignments cta
          WHERE cta.client_id = $2 AND cta.team_member_id = tm.id
        ))
    ) AS allowed
  `, [actorId, clientId])
  if (!access.rows[0]?.allowed) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
}

export async function createEmailEndpoint(input: CreateEmailEndpointInput, actorId: string): Promise<EmailLeadEndpoint> {
  validateBounds(input)
  const label = normalizeEmailEndpointPrefix(input.label)
  const addressPrefix = normalizeEmailEndpointPrefix(input.addressPrefix ?? label)
  const token = generateEmailEndpointToken()
  const emailAddress = addressFor(addressPrefix, token)
  const endpointId = randomUUID()
  const formId = `email_endpoint:${endpointId}`
  const formName = input.formName.trim()
  if (!formName || formName.length > 255) throw createError({ statusCode: 400, statusMessage: 'invalid_form_name' })

  try {
    return await transaction(async (db) => {
      await assertActorCanManageClient(db, input.clientId, actorId)
      const client = await db.query<{ lead_capture_mode: string | null }>(`
        SELECT lead_capture_mode FROM agency_clients WHERE id = $1 FOR UPDATE
      `, [input.clientId])
      if (!client.rows[0]) throw createError({ statusCode: 404, statusMessage: 'client_not_found' })
      if (client.rows[0].lead_capture_mode === 'analytics_only') {
        throw createError({ statusCode: 409, statusMessage: 'lead_capture_disabled' })
      }
      const endpoint = await db.query<EmailLeadEndpoint>(`
      INSERT INTO lead_email_endpoints (
        id, client_id, label, address_prefix, address_token, email_address,
        expected_provider, parser_mode, ai_extraction_mode, allowed_sender_domains,
        expected_max_silence_hours, first_response_sla_minutes, form_id, form_name, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
      RETURNING *
      `, [endpointId, input.clientId, label, addressPrefix, token, emailAddress,
        input.expectedProvider?.trim() || null, input.parserMode ?? 'auto', input.aiExtractionMode ?? 'disabled',
        JSON.stringify(normalizeDomains(input.allowedSenderDomains)), input.expectedMaxSilenceHours ?? null,
        input.firstResponseSlaMinutes ?? null, formId, formName, actorId])
      const created = endpoint.rows[0]
      if (!created) throw createError({ statusCode: 409, statusMessage: 'duplicate_email_address' })
      await db.query(`
      INSERT INTO lead_form_metadata (source, form_id, form_name, fields)
      VALUES ('email', $1, $2, '[]'::jsonb)
      ON CONFLICT (source, form_id) DO UPDATE SET form_name = EXCLUDED.form_name
      `, [formId, formName])
      if (input.routingPreset) {
        await applyEmailRoutingPreset({
          clientId: input.clientId, formId, formName, preset: input.routingPreset,
          notificationEmail: input.notificationEmail, assignedUserId: input.assignedUserId
        }, actorId, db)
      }
      return created
    })
  } catch (error: any) {
    if (error?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'duplicate_email_address' })
    throw error
  }
}

export async function updateEmailEndpoint(id: string, input: UpdateEmailEndpointInput, actorId: string): Promise<EmailLeadEndpoint> {
  validateBounds(input)
  return transaction(async (db) => {
    const current = await db.query<EmailLeadEndpoint>(`SELECT * FROM lead_email_endpoints WHERE id = $1 FOR UPDATE`, [id])
    const endpoint = current.rows[0]
    if (!endpoint) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
    await assertActorCanManageClient(db, endpoint.client_id, actorId)
    if (endpoint.retired_at) throw createError({ statusCode: 409, statusMessage: 'email_endpoint_retired' })
    const hasReceivedMail = Boolean((await db.query<{ received: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM lead_email_ingestions WHERE endpoint_id = $1) AS received
    `, [id])).rows[0]?.received)
    const label = input.label === undefined ? endpoint.label : normalizeEmailEndpointPrefix(input.label)
    const addressPrefix = input.addressPrefix === undefined ? endpoint.address_prefix : normalizeEmailEndpointPrefix(input.addressPrefix)
    if (hasReceivedMail && addressPrefix !== endpoint.address_prefix) {
      throw createError({ statusCode: 409, statusMessage: 'used_email_address_immutable' })
    }
    const retiredAt = input.retire ? new Date().toISOString() : null
    const updated = await db.query<EmailLeadEndpoint>(`
      UPDATE lead_email_endpoints SET
        label = $2, address_prefix = $3, expected_provider = $4, parser_mode = $5,
        ai_extraction_mode = $6, allowed_sender_domains = $7::jsonb,
        expected_max_silence_hours = $8, first_response_sla_minutes = $9,
        form_name = $10, enabled = $11, retired_at = COALESCE($12::timestamptz, retired_at), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, label, addressPrefix, input.expectedProvider === undefined ? endpoint.expected_provider : input.expectedProvider?.trim() || null,
      input.parserMode ?? endpoint.parser_mode, input.aiExtractionMode ?? endpoint.ai_extraction_mode,
      JSON.stringify(input.allowedSenderDomains === undefined ? endpoint.allowed_sender_domains : normalizeDomains(input.allowedSenderDomains)),
      input.expectedMaxSilenceHours === undefined ? endpoint.expected_max_silence_hours : input.expectedMaxSilenceHours,
      input.firstResponseSlaMinutes === undefined ? endpoint.first_response_sla_minutes : input.firstResponseSlaMinutes,
      input.formName === undefined ? endpoint.form_name : input.formName.trim(), input.retire ? false : (input.enabled ?? endpoint.enabled), retiredAt])
    return updated.rows[0]!
  })
}

export async function rotateEmailEndpoint(id: string, actorId: string): Promise<EmailLeadEndpoint> {
  return transaction(async (db) => {
    const existing = await db.query<EmailLeadEndpoint>(`SELECT * FROM lead_email_endpoints WHERE id = $1 FOR UPDATE`, [id])
    const endpoint = existing.rows[0]
    if (!endpoint) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
    await assertActorCanManageClient(db, endpoint.client_id, actorId)
    if (endpoint.retired_at) throw createError({ statusCode: 409, statusMessage: 'email_endpoint_retired' })
    if (endpoint.previous_token_grace_until && new Date(endpoint.previous_token_grace_until).getTime() > Date.now()) {
      throw createError({ statusCode: 409, statusMessage: 'rotation_grace_active' })
    }
    const token = generateEmailEndpointToken()
    const rotated = await db.query<EmailLeadEndpoint>(`
      UPDATE lead_email_endpoints
      SET previous_address_token = address_token,
          previous_token_grace_until = NOW() + INTERVAL '24 hours',
          address_token = $2, email_address = $3, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, token, addressFor(endpoint.address_prefix, token)])
    return rotated.rows[0]!
  })
}

export async function resolveEmailEndpointToken(token: string): Promise<EmailLeadEndpoint | null> {
  if (!/^lead_[A-Za-z0-9_-]{24,128}$/.test(token)) return null
  return queryOne<EmailLeadEndpoint>(`
    SELECT * FROM lead_email_endpoints
    WHERE enabled = TRUE AND retired_at IS NULL
      AND (address_token = $1 OR (previous_address_token = $1 AND previous_token_grace_until > NOW()))
    LIMIT 1
  `, [token])
}

export async function listEmailEndpoints(clientId: string, actorId: string) {
  // Do not select opaque current/previous address tokens outside the private policy resolver.
  return transaction(async (db) => {
    await assertActorCanManageClient(db, clientId, actorId)
    const result = await db.query(`
      SELECT id, client_id, label, address_prefix, email_address, expected_provider, parser_mode,
        ai_extraction_mode, allowed_sender_domains, expected_max_silence_hours, first_response_sla_minutes,
        form_id, form_name, enabled, last_received_at, last_accepted_at, last_failure_at,
        consecutive_failures, retired_at, created_at, updated_at
      FROM lead_email_endpoints WHERE client_id = $1 ORDER BY created_at DESC
    `, [clientId])
    return result.rows
  })
}

export async function listEmailEndpointIngestions(id: string, actorId: string) {
  return transaction(async (db) => {
    const endpoint = await db.query<{ client_id: string }>(`SELECT client_id FROM lead_email_endpoints WHERE id = $1`, [id])
    if (!endpoint.rows[0]) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
    await assertActorCanManageClient(db, endpoint.rows[0].client_id, actorId)
    const rows = await db.query(`
      SELECT id, endpoint_id, client_id, lead_id, correlation_id, transport, provider, parser, status,
        confidence, sender_domain, safe_evidence, error_class, processing_ms, attempt_count,
        next_attempt_at, terminal_at, created_at, updated_at
      FROM lead_email_ingestions WHERE endpoint_id = $1 AND client_id = $2 ORDER BY created_at DESC
    `, [id, endpoint.rows[0].client_id])
    return rows.rows
  })
}
