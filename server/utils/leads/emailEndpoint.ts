import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { EmailLeadEndpoint } from '~~/app/types'
import { queryOne, transaction } from '~~/server/utils/db'
import { applyEmailRoutingPreset, type EmailRoutingPreset } from '~~/server/utils/leads/emailRoutingPreset'

const ADDRESS_DOMAIN = 'leads.xeroflow.io'
const MAX_LOCAL_PART_LENGTH = 64
const HISTORY_DEFAULT_LIMIT = 50
const HISTORY_MAX_LIMIT = 100
const CROCKFORD_BASE32 = '0123456789abcdefghjkmnpqrstvwxyz'

type DbClient = Parameters<typeof transaction>[0] extends (client: infer Client) => Promise<unknown> ? Client : never

export const EMAIL_AI_PRIVACY_APPROVAL_VERSION = 1

export interface EmailEndpointMutationCapabilities {
  aiExtractionAvailable: boolean
}

const NO_EMAIL_ENDPOINT_CAPABILITIES: EmailEndpointMutationCapabilities = {
  aiExtractionAvailable: false
}

export interface CreateEmailEndpointInput {
  clientId: string
  label: string
  addressPrefix?: string
  expectedProvider?: string | null
  parserMode?: 'auto' | 'adf' | 'generic'
  aiExtractionMode?: 'disabled' | 'fallback'
  aiPrivacyApprovalVersion?: number
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
  aiPrivacyApprovalVersion?: number
  allowedSenderDomains?: string[]
  expectedMaxSilenceHours?: number | null
  firstResponseSlaMinutes?: number | null
  formName?: string
  enabled?: boolean
  retire?: boolean
}

export function generateEmailEndpointToken(): string {
  // Rejection sampling keeps every Crockford character equally likely.
  const characters: string[] = []
  while (characters.length < 10) {
    for (const byte of randomBytes(16)) {
      if (byte < 224) characters.push(CROCKFORD_BASE32[byte & 31]!)
      if (characters.length === 10) break
    }
  }
  return characters.join('')
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

function normalizeFormName(value: string) {
  const formName = value.trim()
  if (!formName || formName.length > 255) throw createError({ statusCode: 400, statusMessage: 'invalid_form_name' })
  return formName
}

type SafeEmailEndpointFields = Pick<
  EmailLeadEndpoint,
  | 'id'
  | 'client_id'
  | 'label'
  | 'address_prefix'
  | 'email_address'
  | 'expected_provider'
  | 'parser_mode'
  | 'ai_extraction_mode'
  | 'ai_privacy_approval_version'
  | 'ai_privacy_approved_at'
  | 'allowed_sender_domains'
  | 'expected_max_silence_hours'
  | 'first_response_sla_minutes'
  | 'form_id'
  | 'form_name'
  | 'enabled'
  | 'last_received_at'
  | 'last_accepted_at'
  | 'last_failure_at'
  | 'consecutive_failures'
  | 'retired_at'
  | 'created_at'
  | 'updated_at'
>

export interface SafeEmailEndpoint extends SafeEmailEndpointFields {
  oldest_nonterminal_at: string | null
  non_terminal_count: number
  recovery_attempt_count: number
  exhausted_recovery_count: number
  recovery_state: 'idle' | 'pending' | 'retrying' | 'exhausted'
  address_prefix_locked: boolean
}

export function toSafeEmailEndpoint(endpoint: EmailLeadEndpoint): SafeEmailEndpoint {
  const operational = endpoint as EmailLeadEndpoint & Partial<Pick<
    SafeEmailEndpoint,
    | 'oldest_nonterminal_at'
    | 'non_terminal_count'
    | 'recovery_attempt_count'
    | 'exhausted_recovery_count'
    | 'recovery_state'
    | 'address_prefix_locked'
  >>
  return {
    id: endpoint.id,
    client_id: endpoint.client_id,
    label: endpoint.label,
    address_prefix: endpoint.address_prefix,
    email_address: endpoint.email_address,
    expected_provider: endpoint.expected_provider,
    parser_mode: endpoint.parser_mode,
    ai_extraction_mode: endpoint.ai_extraction_mode,
    ai_privacy_approval_version: endpoint.ai_privacy_approval_version,
    ai_privacy_approved_at: endpoint.ai_privacy_approved_at,
    allowed_sender_domains: endpoint.allowed_sender_domains,
    expected_max_silence_hours: endpoint.expected_max_silence_hours,
    first_response_sla_minutes: endpoint.first_response_sla_minutes,
    form_id: endpoint.form_id,
    form_name: endpoint.form_name,
    enabled: endpoint.enabled,
    last_received_at: endpoint.last_received_at,
    last_accepted_at: endpoint.last_accepted_at,
    last_failure_at: endpoint.last_failure_at,
    consecutive_failures: endpoint.consecutive_failures,
    retired_at: endpoint.retired_at,
    created_at: endpoint.created_at,
    updated_at: endpoint.updated_at,
    oldest_nonterminal_at: operational.oldest_nonterminal_at ?? null,
    non_terminal_count: operational.non_terminal_count ?? 0,
    recovery_attempt_count: operational.recovery_attempt_count ?? 0,
    exhausted_recovery_count: operational.exhausted_recovery_count ?? 0,
    recovery_state: operational.recovery_state ?? 'idle',
    address_prefix_locked: operational.address_prefix_locked ?? Boolean(endpoint.last_received_at)
  }
}

export function hasCurrentEmailAiPrivacyApproval(endpoint: Pick<
  EmailLeadEndpoint,
  'ai_extraction_mode' | 'ai_privacy_approval_version' | 'ai_privacy_approved_at' | 'ai_privacy_approved_by'
>): boolean {
  return endpoint.ai_extraction_mode === 'fallback'
    && endpoint.ai_privacy_approval_version === EMAIL_AI_PRIVACY_APPROVAL_VERSION
    && Boolean(endpoint.ai_privacy_approved_at)
    && Boolean(endpoint.ai_privacy_approved_by)
}

function auditState(endpoint: EmailLeadEndpoint) {
  const normalizedDomains = canonicalizeDomains(endpoint.allowed_sender_domains)
  return {
    label: endpoint.label,
    address_prefix: endpoint.address_prefix,
    expected_provider: endpoint.expected_provider,
    parser_mode: endpoint.parser_mode,
    ai_extraction_mode: endpoint.ai_extraction_mode,
    ai_privacy_approval_version: endpoint.ai_privacy_approval_version,
    ai_privacy_approved_at: endpoint.ai_privacy_approved_at,
    allowed_sender_domains_count: normalizedDomains.length,
    allowed_sender_domains_sha256: createHash('sha256')
      .update(JSON.stringify(normalizedDomains), 'utf8')
      .digest('hex'),
    expected_max_silence_hours: endpoint.expected_max_silence_hours,
    first_response_sla_minutes: endpoint.first_response_sla_minutes,
    form_id: endpoint.form_id,
    form_name: endpoint.form_name,
    enabled: endpoint.enabled,
    retired_at: endpoint.retired_at
  }
}

async function writeEndpointAudit(
  db: DbClient,
  endpoint: EmailLeadEndpoint,
  actorId: string,
  action: 'created' | 'updated' | 'enabled' | 'disabled' | 'retired' | 'rotated',
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>
) {
  await db.query(`
    INSERT INTO lead_email_endpoint_audits
      (endpoint_id, client_id, actor_id, actor_type, action, before_state, after_state)
    VALUES ($1, $2, $3, 'team_member', $4, $5::jsonb, $6::jsonb)
  `, [endpoint.id, endpoint.client_id, actorId, action, JSON.stringify(beforeState), JSON.stringify(afterState)])
}

function canonicalizeDomains(domains: unknown): string[] {
  let values: unknown[] = []
  if (Array.isArray(domains)) {
    values = domains
  } else if (typeof domains === 'string') {
    try {
      const parsed = JSON.parse(domains)
      if (Array.isArray(parsed)) values = parsed
    } catch {
      values = []
    }
  }
  return [...new Set(values
    .filter((domain): domain is string => typeof domain === 'string')
    .map(domain => domain.trim().toLowerCase())
    .filter(Boolean))]
    .sort()
}

function normalizeDomains(domains: string[] | undefined) {
  const result = canonicalizeDomains(domains)
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

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
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

async function assertActorCanApproveEmailAi(db: DbClient, actorId: string) {
  const access = await db.query<{ allowed: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM team_members tm
      LEFT JOIN role_permission_groups rpg
        ON rpg.role_id = tm.custom_role_id
       AND rpg.permission_group = 'ADMIN'
      WHERE tm.id = $1
        AND tm.is_active = TRUE
        AND (tm.user_role IN ('owner', 'admin') OR rpg.permission_group = 'ADMIN')
    ) AS allowed
  `, [actorId])
  if (!access.rows[0]?.allowed) {
    throw createError({ statusCode: 403, statusMessage: 'email_ai_privacy_approval_forbidden' })
  }
}

function validateEmailAiEnablement(
  mode: 'disabled' | 'fallback',
  approvalVersion: number | undefined,
  capabilities: EmailEndpointMutationCapabilities
) {
  if (mode !== 'fallback') {
    if (approvalVersion !== undefined) {
      throw createError({ statusCode: 400, statusMessage: 'email_ai_privacy_approval_not_applicable' })
    }
    return
  }
  if (!capabilities.aiExtractionAvailable) {
    throw createError({ statusCode: 409, statusMessage: 'email_ai_capability_unavailable' })
  }
  if (approvalVersion !== EMAIL_AI_PRIVACY_APPROVAL_VERSION) {
    throw createError({ statusCode: 409, statusMessage: 'email_ai_privacy_approval_required' })
  }
}

export async function createEmailEndpoint(
  input: CreateEmailEndpointInput,
  actorId: string,
  capabilities: EmailEndpointMutationCapabilities = NO_EMAIL_ENDPOINT_CAPABILITIES
): Promise<EmailLeadEndpoint> {
  validateBounds(input)
  const aiExtractionMode = input.aiExtractionMode ?? 'disabled'
  validateEmailAiEnablement(aiExtractionMode, input.aiPrivacyApprovalVersion, capabilities)
  const label = normalizeEmailEndpointPrefix(input.label)
  const addressPrefix = normalizeEmailEndpointPrefix(input.addressPrefix ?? label)
  const token = generateEmailEndpointToken()
  const emailAddress = addressFor(addressPrefix, token)
  const endpointId = randomUUID()
  const formId = `email_endpoint:${endpointId}`
  const formName = normalizeFormName(input.formName)

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
      if (aiExtractionMode === 'fallback') await assertActorCanApproveEmailAi(db, actorId)
      const endpoint = await db.query<EmailLeadEndpoint>(`
      INSERT INTO lead_email_endpoints (
        id, client_id, label, address_prefix, address_token, email_address,
        expected_provider, parser_mode, ai_extraction_mode, allowed_sender_domains,
        expected_max_silence_hours, first_response_sla_minutes, form_id, form_name, created_by,
        ai_privacy_approval_version, ai_privacy_approved_at, ai_privacy_approved_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15,
        $16, CASE WHEN $16::smallint IS NULL THEN NULL ELSE NOW() END, $17
      )
      RETURNING *
      `, [endpointId, input.clientId, label, addressPrefix, token, emailAddress,
        input.expectedProvider?.trim() || null, input.parserMode ?? 'auto', aiExtractionMode,
        JSON.stringify(normalizeDomains(input.allowedSenderDomains)), input.expectedMaxSilenceHours ?? null,
        input.firstResponseSlaMinutes ?? null, formId, formName, actorId,
        aiExtractionMode === 'fallback' ? EMAIL_AI_PRIVACY_APPROVAL_VERSION : null,
        aiExtractionMode === 'fallback' ? actorId : null])
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
      await writeEndpointAudit(db, created, actorId, 'created', {}, auditState(created))
      return created
    })
  } catch (error: unknown) {
    if (postgresErrorCode(error) === '23505') throw createError({ statusCode: 409, statusMessage: 'duplicate_email_address' })
    throw error
  }
}

export async function updateEmailEndpoint(
  id: string,
  input: UpdateEmailEndpointInput,
  actorId: string,
  capabilities: EmailEndpointMutationCapabilities = NO_EMAIL_ENDPOINT_CAPABILITIES
): Promise<EmailLeadEndpoint> {
  validateBounds(input)
  try {
    return await transaction(async (db) => {
      const current = await db.query<EmailLeadEndpoint>(`SELECT * FROM lead_email_endpoints WHERE id = $1 FOR UPDATE`, [id])
      const endpoint = current.rows[0]
      if (!endpoint) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
      await assertActorCanManageClient(db, endpoint.client_id, actorId)
      if (endpoint.retired_at) throw createError({ statusCode: 409, statusMessage: 'email_endpoint_retired' })
      const aiExtractionMode = input.aiExtractionMode ?? endpoint.ai_extraction_mode
      const enablingAiFallback = aiExtractionMode === 'fallback' && endpoint.ai_extraction_mode !== 'fallback'
      if (enablingAiFallback) {
        validateEmailAiEnablement(aiExtractionMode, input.aiPrivacyApprovalVersion, capabilities)
        await assertActorCanApproveEmailAi(db, actorId)
      } else if (input.aiPrivacyApprovalVersion !== undefined) {
        throw createError({ statusCode: 400, statusMessage: 'email_ai_privacy_approval_not_applicable' })
      }
      const hasReceivedMail = Boolean((await db.query<{ received: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM lead_email_ingestions
          WHERE endpoint_id = $1 AND client_id = $2
        ) AS received
      `, [id, endpoint.client_id])).rows[0]?.received)
      const label = input.label === undefined ? endpoint.label : normalizeEmailEndpointPrefix(input.label)
      const addressPrefix = input.addressPrefix === undefined ? endpoint.address_prefix : normalizeEmailEndpointPrefix(input.addressPrefix)
      if (hasReceivedMail && addressPrefix !== endpoint.address_prefix) {
        throw createError({ statusCode: 409, statusMessage: 'used_email_address_immutable' })
      }
      const formName = input.formName === undefined ? endpoint.form_name : normalizeFormName(input.formName)
      const retiredAt = input.retire ? new Date().toISOString() : null
      const enabled = input.retire ? false : (input.enabled ?? endpoint.enabled)
      const emailAddress = addressPrefix === endpoint.address_prefix
        ? endpoint.email_address
        : addressFor(addressPrefix, endpoint.address_token)
      const aiApprovalVersion = aiExtractionMode === 'fallback'
        ? (enablingAiFallback ? EMAIL_AI_PRIVACY_APPROVAL_VERSION : endpoint.ai_privacy_approval_version)
        : null
      const aiApprovedAt = aiExtractionMode === 'fallback'
        ? (enablingAiFallback ? new Date().toISOString() : endpoint.ai_privacy_approved_at)
        : null
      const aiApprovedBy = aiExtractionMode === 'fallback'
        ? (enablingAiFallback ? actorId : endpoint.ai_privacy_approved_by)
        : null
      const updated = await db.query<EmailLeadEndpoint>(`
        UPDATE lead_email_endpoints SET
          label = $2, address_prefix = $3, email_address = $4, expected_provider = $5, parser_mode = $6,
          ai_extraction_mode = $7, allowed_sender_domains = $8::jsonb,
          expected_max_silence_hours = $9, first_response_sla_minutes = $10,
          form_name = $11, enabled = $12, retired_at = COALESCE($13::timestamptz, retired_at),
          ai_privacy_approval_version = $14,
          ai_privacy_approved_at = $15::timestamptz,
          ai_privacy_approved_by = $16,
          updated_at = NOW()
        WHERE id = $1 RETURNING *
      `, [id, label, addressPrefix, emailAddress,
        input.expectedProvider === undefined ? endpoint.expected_provider : input.expectedProvider?.trim() || null,
        input.parserMode ?? endpoint.parser_mode, aiExtractionMode,
        JSON.stringify(input.allowedSenderDomains === undefined ? endpoint.allowed_sender_domains : normalizeDomains(input.allowedSenderDomains)),
        input.expectedMaxSilenceHours === undefined ? endpoint.expected_max_silence_hours : input.expectedMaxSilenceHours,
        input.firstResponseSlaMinutes === undefined ? endpoint.first_response_sla_minutes : input.firstResponseSlaMinutes,
        formName, enabled, retiredAt, aiApprovalVersion, aiApprovedAt, aiApprovedBy])
      const saved = Object.assign(updated.rows[0]!, {
        address_prefix_locked: hasReceivedMail
      })
      if (formName !== endpoint.form_name) {
        await db.query(`
          UPDATE lead_form_metadata SET form_name = $2
          WHERE source = 'email' AND form_id = $1
        `, [saved.form_id, formName])
        await db.query(`
          UPDATE lead_form_rules SET form_name = $2, updated_at = NOW()
          WHERE source = 'email' AND form_id = $1 AND client_id = $3
        `, [saved.form_id, formName, saved.client_id])
      }
      const action = input.retire ? 'retired' : endpoint.enabled !== saved.enabled ? (saved.enabled ? 'enabled' : 'disabled') : 'updated'
      await writeEndpointAudit(db, saved, actorId, action, auditState(endpoint), auditState(saved))
      return saved
    })
  } catch (error: unknown) {
    if (postgresErrorCode(error) === '23505') throw createError({ statusCode: 409, statusMessage: 'duplicate_email_address' })
    throw error
  }
}

export async function rotateEmailEndpoint(id: string, actorId: string): Promise<EmailLeadEndpoint> {
  try {
    return await transaction(async (db) => {
      const existing = await db.query<EmailLeadEndpoint & { address_prefix_locked: boolean }>(`
        SELECT endpoint.*,
          EXISTS (
            SELECT 1
            FROM lead_email_ingestions ingestion
            WHERE ingestion.endpoint_id = endpoint.id
              AND ingestion.client_id = endpoint.client_id
          ) AS address_prefix_locked
        FROM lead_email_endpoints endpoint
        WHERE endpoint.id = $1
        FOR UPDATE OF endpoint
      `, [id])
      const endpoint = existing.rows[0]
      if (!endpoint) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
      await assertActorCanManageClient(db, endpoint.client_id, actorId)
      if (endpoint.retired_at) throw createError({ statusCode: 409, statusMessage: 'email_endpoint_retired' })
      if (!endpoint.enabled) throw createError({ statusCode: 409, statusMessage: 'email_endpoint_disabled' })
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
      const saved = Object.assign(rotated.rows[0]!, {
        address_prefix_locked: endpoint.address_prefix_locked
      })
      await writeEndpointAudit(db, saved, actorId, 'rotated', auditState(endpoint), auditState(saved))
      return saved
    })
  } catch (error: unknown) {
    if (postgresErrorCode(error) === '23505') throw createError({ statusCode: 409, statusMessage: 'duplicate_email_address' })
    throw error
  }
}

export async function resolveEmailEndpointToken(token: string): Promise<EmailLeadEndpoint | null> {
  if (!/^[0123456789abcdefghjkmnpqrstvwxyz]{10}$/.test(token)) return null
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
      SELECT ${SAFE_ENDPOINT_COLUMNS}, ${SAFE_ENDPOINT_OPERATIONAL_COLUMNS}
      FROM lead_email_endpoints endpoint
      ${EMAIL_ENDPOINT_RECOVERY_JOIN}
      WHERE endpoint.client_id = $1
      ORDER BY endpoint.created_at DESC
    `, [clientId])
    return result.rows
  })
}

const SAFE_ENDPOINT_COLUMNS = `
  endpoint.id, endpoint.client_id, endpoint.label, endpoint.address_prefix,
  endpoint.email_address, endpoint.expected_provider, endpoint.parser_mode,
  endpoint.ai_extraction_mode, endpoint.ai_privacy_approval_version,
  endpoint.ai_privacy_approved_at, endpoint.allowed_sender_domains,
  endpoint.expected_max_silence_hours, endpoint.first_response_sla_minutes,
  endpoint.form_id, endpoint.form_name, endpoint.enabled, endpoint.last_received_at,
  endpoint.last_accepted_at, endpoint.last_failure_at, endpoint.consecutive_failures,
  endpoint.retired_at, endpoint.created_at, endpoint.updated_at
`

const SAFE_ENDPOINT_OPERATIONAL_COLUMNS = `
  recovery.oldest_nonterminal_at,
  COALESCE(recovery.non_terminal_count, 0)::integer AS non_terminal_count,
  COALESCE(recovery.recovery_attempt_count, 0)::integer AS recovery_attempt_count,
  COALESCE(recovery.exhausted_recovery_count, 0)::integer AS exhausted_recovery_count,
  CASE
    WHEN COALESCE(recovery.exhausted_recovery_count, 0) > 0 THEN 'exhausted'
    WHEN COALESCE(recovery.non_terminal_count, 0) > 0
      AND COALESCE(recovery.recovery_attempt_count, 0) > 0 THEN 'retrying'
    WHEN COALESCE(recovery.non_terminal_count, 0) > 0 THEN 'pending'
    ELSE 'idle'
  END AS recovery_state,
  COALESCE(recovery.address_prefix_locked, FALSE) AS address_prefix_locked
`

const EMAIL_ENDPOINT_RECOVERY_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      MIN(i.created_at) FILTER (WHERE i.terminal_at IS NULL) AS oldest_nonterminal_at,
      COUNT(*) FILTER (WHERE i.terminal_at IS NULL)::integer AS non_terminal_count,
      COALESCE(MAX(i.attempt_count) FILTER (WHERE i.terminal_at IS NULL), 0)::integer
        AS recovery_attempt_count,
      COUNT(*) FILTER (WHERE i.error_class = 'attempts_exhausted')::integer
        AS exhausted_recovery_count,
      COUNT(*) > 0 AS address_prefix_locked
    FROM lead_email_ingestions i
    WHERE i.endpoint_id = endpoint.id
      AND i.client_id = endpoint.client_id
  ) recovery ON TRUE
`

const ACTOR_CLIENT_SCOPE = `
  JOIN team_members tm
    ON tm.id = $1
   AND tm.is_active = TRUE
  WHERE (
    tm.user_role IN ('owner', 'admin', 'lead', 'project_manager')
    OR EXISTS (
      SELECT 1
      FROM client_team_assignments cta
      WHERE cta.client_id = client.id
        AND cta.team_member_id = tm.id
    )
  )
`

export async function listEmailEndpointsForActor(actorId: string): Promise<{
  clients: Array<{ id: string, name: string }>
  items: SafeEmailEndpoint[]
}> {
  return transaction(async (db) => {
    const clients = await db.query<{ id: string, name: string }>(`
      SELECT client.id, client.name
      FROM agency_clients client
      ${ACTOR_CLIENT_SCOPE}
      ORDER BY client.name ASC, client.id ASC
    `, [actorId])
    const endpoints = await db.query<SafeEmailEndpoint>(`
      SELECT ${SAFE_ENDPOINT_COLUMNS}, ${SAFE_ENDPOINT_OPERATIONAL_COLUMNS}
      FROM lead_email_endpoints endpoint
      JOIN agency_clients client ON client.id = endpoint.client_id
      ${EMAIL_ENDPOINT_RECOVERY_JOIN}
      ${ACTOR_CLIENT_SCOPE}
      ORDER BY endpoint.created_at DESC, endpoint.id DESC
    `, [actorId])
    return { clients: clients.rows, items: endpoints.rows }
  })
}

export async function getEmailEndpoint(id: string, actorId: string): Promise<SafeEmailEndpoint> {
  return transaction(async (db) => {
    const endpoint = await db.query<{ client_id: string }>(
      `SELECT client_id FROM lead_email_endpoints WHERE id = $1`, [id]
    )
    if (!endpoint.rows[0]) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
    await assertActorCanManageClient(db, endpoint.rows[0].client_id, actorId)
    const result = await db.query<SafeEmailEndpoint>(`
      SELECT ${SAFE_ENDPOINT_COLUMNS}, ${SAFE_ENDPOINT_OPERATIONAL_COLUMNS}
      FROM lead_email_endpoints endpoint
      ${EMAIL_ENDPOINT_RECOVERY_JOIN}
      WHERE endpoint.id = $1 AND endpoint.client_id = $2
    `, [id, endpoint.rows[0].client_id])
    if (!result.rows[0]) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
    return result.rows[0]
  })
}

export interface EmailEndpointIngestionCursor {
  createdAt: string
  id: string
}

export interface ListEmailEndpointIngestionsOptions {
  limit?: number
  cursor?: EmailEndpointIngestionCursor | null
}

export async function listEmailEndpointIngestions(
  id: string,
  actorId: string,
  options: ListEmailEndpointIngestionsOptions = {}
) {
  const limit = options.limit ?? HISTORY_DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_MAX_LIMIT) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_history_limit' })
  }
  return transaction(async (db) => {
    const endpoint = await db.query<{ client_id: string }>(`SELECT client_id FROM lead_email_endpoints WHERE id = $1`, [id])
    if (!endpoint.rows[0]) throw createError({ statusCode: 404, statusMessage: 'email_endpoint_not_found' })
    await assertActorCanManageClient(db, endpoint.rows[0].client_id, actorId)
    const rows = await db.query(`
      SELECT i.id, i.status, i.attempt_count, i.next_attempt_at, i.terminal_at,
        i.created_at, i.updated_at,
        CASE i.error_class
          WHEN 'missing_evidence' THEN 'Retained evidence is unavailable'
          WHEN 'corrupt_evidence' THEN 'Evidence could not be decrypted'
          WHEN 'endpoint_unavailable' THEN 'Email address is disabled or retired'
          WHEN 'sender_policy_denied' THEN 'Sender policy no longer allows this message'
          WHEN 'attempts_exhausted' THEN 'Maximum recovery attempts reached'
          WHEN 'evidence_expired' THEN 'Retained evidence has expired'
          WHEN 'legacy_evidence' THEN 'Pre-sealed evidence requires manual review'
          WHEN 'canonical_window_elapsed' THEN 'Recovery paused at the evidence safety window'
          WHEN 'canonical_transient' THEN 'Lead creation is temporarily unavailable'
          ELSE NULL
        END AS reason,
        (
          i.status IN ('quarantined', 'failed')
          AND i.staged_object_key IS NOT NULL
          AND i.staged_expires_at > NOW()
          AND i.attempt_count < 5
          AND (
            i.recovery_lease_token IS NULL
            OR i.recovery_claimed_at <= NOW() - INTERVAL '5 minutes'
          )
          AND EXISTS (
            SELECT 1
            FROM lead_email_endpoints replay_endpoint
            WHERE replay_endpoint.id = i.endpoint_id
              AND replay_endpoint.client_id = i.client_id
              AND replay_endpoint.enabled = TRUE
              AND replay_endpoint.retired_at IS NULL
          )
        ) AS replay_available,
        CASE
          WHEN i.status NOT IN ('quarantined', 'failed') THEN 'Already processed'
          WHEN i.attempt_count >= 5 THEN 'Maximum recovery attempts reached'
          WHEN i.recovery_lease_token IS NOT NULL
            AND i.recovery_claimed_at > NOW() - INTERVAL '5 minutes'
            THEN 'Replay is already in progress'
          WHEN i.staged_object_key IS NULL THEN 'Retained evidence is unavailable'
          WHEN i.staged_expires_at IS NULL OR i.staged_expires_at <= NOW() THEN 'Retained evidence has expired'
          WHEN NOT EXISTS (
            SELECT 1
            FROM lead_email_endpoints replay_endpoint
            WHERE replay_endpoint.id = i.endpoint_id
              AND replay_endpoint.client_id = i.client_id
              AND replay_endpoint.enabled = TRUE
              AND replay_endpoint.retired_at IS NULL
          ) THEN 'Email address is disabled or retired'
          ELSE NULL
        END AS replay_unavailable_reason
      FROM lead_email_ingestions i
      WHERE i.endpoint_id = $1 AND i.client_id = $2
        AND ($3::timestamptz IS NULL OR (i.created_at, i.id) < ($3::timestamptz, $4::uuid))
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT $5
    `, [id, endpoint.rows[0].client_id, options.cursor?.createdAt ?? null, options.cursor?.id ?? null, limit])
    const items = rows.rows
    const last = items.at(-1) as { id?: string, created_at?: string } | undefined
    return {
      items,
      nextCursor: items.length === limit && last?.id && last.created_at
        ? { createdAt: last.created_at, id: last.id }
        : null
    }
  })
}
