import { randomBytes } from 'node:crypto'
import { queryOne, queryRows } from '~~/server/utils/db'
import { decryptToken, encryptToken } from '~~/server/utils/tokenCrypto'
import type {
  CreateLeadConnector,
  LeadConnectorReadModel,
  UpdateLeadConnector
} from '~~/server/utils/leads/connectorContracts'

type ConnectorRow = {
  id: string
  client_id: string
  site_id: string | null
  type: LeadConnectorReadModel['type']
  provider: string
  status: LeadConnectorReadModel['status']
  authority: LeadConnectorReadModel['authority']
  capabilities: LeadConnectorReadModel['capabilities'] | string
  approved_origins: string[] | string
  form_references: string[] | string
  public_token: string | null
  secret_ciphertext?: Uint8Array | null
  secret_iv?: Uint8Array | null
  previous_secret_ciphertext?: Uint8Array | null
  previous_secret_iv?: Uint8Array | null
  previous_secret_valid_until?: string | null
  credential_configured: boolean
  last_receipt_at: string | null
  last_attempt_at: string | null
  last_poll_at: string | null
  last_error_class: string | null
  duplicate_receipts: string | number
  replay_rejections: string | number
  version: number
  created_at: string
  updated_at: string
}

function arrayValue<T>(value: T[] | string): T[] {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readModel(row: ConnectorRow): LeadConnectorReadModel {
  return {
    id: row.id,
    clientId: row.client_id,
    siteId: row.site_id,
    type: row.type,
    provider: row.provider,
    status: row.status,
    authority: row.authority,
    capabilities: arrayValue(row.capabilities),
    approvedOrigins: arrayValue(row.approved_origins),
    formReferences: arrayValue(row.form_references),
    path: row.public_token ? `/api/leads/webhook/standard/${row.public_token}` : null,
    credentialConfigured: row.credential_configured,
    lastReceiptAt: row.last_receipt_at,
    lastAttemptAt: row.last_attempt_at,
    lastPollAt: row.last_poll_at,
    lastErrorClass: row.last_error_class,
    duplicateReceipts: Number(row.duplicate_receipts) || 0,
    replayRejections: Number(row.replay_rejections) || 0,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const READ_COLUMNS = `
  id, client_id, site_id, type, provider, status, authority,
  capabilities, approved_origins, form_references, public_token,
  (secret_ciphertext IS NOT NULL) AS credential_configured,
  last_receipt_at, last_attempt_at, last_poll_at, last_error_class,
  duplicate_receipts, replay_rejections, version, created_at, updated_at
`

export interface ResolvedLeadConnector {
  id: string
  clientId: string
  siteId: string | null
  type: LeadConnectorReadModel['type']
  provider: string
  status: LeadConnectorReadModel['status']
  authority: LeadConnectorReadModel['authority']
  capabilities: LeadConnectorReadModel['capabilities']
  approvedOrigins: string[]
  secrets: string[]
}

export const leadConnectorRepository = {
  async list(clientId?: string): Promise<LeadConnectorReadModel[]> {
    const rows = await queryRows<ConnectorRow>(
      `SELECT ${READ_COLUMNS}
         FROM lead_connectors
        WHERE ($1::uuid IS NULL OR client_id = $1)
        ORDER BY client_id, created_at`,
      [clientId ?? null]
    )
    return rows.map(readModel)
  },

  async create(input: CreateLeadConnector & { actorId: string }): Promise<{
    connector: LeadConnectorReadModel
    secret: string | null
  }> {
    const needsSecret = input.capabilities.includes('push') && input.authority === 'canonical'
    const publicToken = needsSecret ? randomBytes(24).toString('base64url') : null
    const secret = needsSecret ? `whsec_${randomBytes(32).toString('base64url')}` : null
    const encrypted = secret ? await encryptToken(secret) : null
    const row = await queryOne<ConnectorRow>(
      `INSERT INTO lead_connectors (
         client_id, site_id, type, provider, status, authority, capabilities,
         approved_origins, form_references, public_token,
         secret_ciphertext, secret_iv, provisioned_by, provision_reason
       ) VALUES (
         $1, $2, $3, $4, 'test', $5, $6::jsonb,
         $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13
       )
       RETURNING ${READ_COLUMNS}`,
      [
        input.clientId,
        input.siteId ?? null,
        input.type,
        input.provider,
        input.authority,
        JSON.stringify(input.capabilities),
        JSON.stringify(input.approvedOrigins),
        JSON.stringify(input.formReferences),
        publicToken,
        encrypted?.ciphertext ?? null,
        encrypted?.iv ?? null,
        input.actorId,
        input.reason
      ]
    )
    if (!row) throw new Error('lead_connector_create_failed')
    return { connector: readModel(row), secret }
  },

  async update(id: string, clientId: string, input: UpdateLeadConnector): Promise<LeadConnectorReadModel | null> {
    const row = await queryOne<ConnectorRow>(
      `UPDATE lead_connectors
          SET status = COALESCE($4, status),
              authority = COALESCE($5, authority),
              capabilities = COALESCE($6::jsonb, capabilities),
              approved_origins = COALESCE($7::jsonb, approved_origins),
              form_references = COALESCE($8::jsonb, form_references),
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1 AND client_id = $2 AND version = $3
        RETURNING ${READ_COLUMNS}`,
      [
        id,
        clientId,
        input.expectedVersion,
        input.status ?? null,
        input.authority ?? null,
        input.capabilities ? JSON.stringify(input.capabilities) : null,
        input.approvedOrigins ? JSON.stringify(input.approvedOrigins) : null,
        input.formReferences ? JSON.stringify(input.formReferences) : null
      ]
    )
    return row ? readModel(row) : null
  },

  async rotate(id: string, clientId: string, expectedVersion: number): Promise<{
    connector: LeadConnectorReadModel
    secret: string
  } | null> {
    const secret = `whsec_${randomBytes(32).toString('base64url')}`
    const encrypted = await encryptToken(secret)
    const row = await queryOne<ConnectorRow>(
      `UPDATE lead_connectors
          SET previous_secret_ciphertext = secret_ciphertext,
              previous_secret_iv = secret_iv,
              previous_secret_valid_until = NOW() + INTERVAL '30 minutes',
              secret_ciphertext = $4,
              secret_iv = $5,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1
          AND client_id = $2
          AND version = $3
          AND public_token IS NOT NULL
          AND secret_ciphertext IS NOT NULL
        RETURNING ${READ_COLUMNS}`,
      [id, clientId, expectedVersion, encrypted.ciphertext, encrypted.iv]
    )
    return row ? { connector: readModel(row), secret } : null
  },

  async resolveByPublicToken(token: string): Promise<ResolvedLeadConnector | null> {
    const row = await queryOne<ConnectorRow>(
      `SELECT ${READ_COLUMNS}, secret_ciphertext, secret_iv,
              previous_secret_ciphertext, previous_secret_iv,
              previous_secret_valid_until
         FROM lead_connectors
        WHERE public_token = $1
        LIMIT 1`,
      [token]
    )
    if (!row || !row.secret_ciphertext || !row.secret_iv) return null
    const secrets = [await decryptToken(row.secret_ciphertext, row.secret_iv)]
    if (
      row.previous_secret_ciphertext
      && row.previous_secret_iv
      && row.previous_secret_valid_until
      && new Date(row.previous_secret_valid_until).getTime() > Date.now()
    ) {
      secrets.push(await decryptToken(row.previous_secret_ciphertext, row.previous_secret_iv))
    }
    return {
      id: row.id,
      clientId: row.client_id,
      siteId: row.site_id,
      type: row.type,
      provider: row.provider,
      status: row.status,
      authority: row.authority,
      capabilities: arrayValue(row.capabilities),
      approvedOrigins: arrayValue(row.approved_origins),
      secrets
    }
  },

  async markReceipt(id: string, duplicate = false): Promise<void> {
    await queryOne(
      `UPDATE lead_connectors
          SET last_attempt_at = NOW(),
              last_receipt_at = CASE WHEN $2 THEN last_receipt_at ELSE NOW() END,
              duplicate_receipts = duplicate_receipts + CASE WHEN $2 THEN 1 ELSE 0 END,
              last_error_class = NULL,
              status = CASE WHEN status = 'disabled' THEN status ELSE 'active' END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [id, duplicate]
    )
  },

  async markRejection(id: string, errorClass: string, replay = false): Promise<void> {
    await queryOne(
      `UPDATE lead_connectors
          SET last_attempt_at = NOW(),
              last_error_class = $2,
              replay_rejections = replay_rejections + CASE WHEN $3 THEN 1 ELSE 0 END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [id, errorClass.slice(0, 255), replay]
    )
  },

  async markFailure(id: string, errorClass: string, replay = false): Promise<void> {
    await queryOne(
      `UPDATE lead_connectors
          SET last_attempt_at = NOW(),
              last_error_class = $2,
              replay_rejections = replay_rejections + CASE WHEN $3 THEN 1 ELSE 0 END,
              status = CASE WHEN status = 'disabled' THEN status ELSE 'error' END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id`,
      [id, errorClass.slice(0, 255), replay]
    )
  }
}
