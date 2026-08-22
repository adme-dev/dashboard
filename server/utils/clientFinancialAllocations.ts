import type {
  FinancialAllocationMutation,
  FinancialAllocationResult,
} from '~~/shared/types/clientFinancials'
import { transaction } from '~~/server/utils/db'

export type ClientFinancialAllocationErrorCode =
  | 'source_not_found'
  | 'invalid_assignment'
  | 'stale_source'

export class ClientFinancialAllocationError extends Error {
  constructor(readonly code: ClientFinancialAllocationErrorCode) {
    super(code)
    this.name = 'ClientFinancialAllocationError'
  }
}

type TransactionDb = Parameters<Parameters<typeof transaction>[0]>[0]

interface ProjectRow {
  id: string
  clientId: string
}

interface MediaSpendRow {
  id: string
  clientId: string
  projectId: string | null
  platform: string
}

interface XeroLineRow {
  lineItemId: string
  invoiceId: string
  invoiceType: string
  invoiceDate: string | Date
  invoiceStatus: string
  invoiceContactId: string | null
  accountCode: string | null
  description: string | null
  lineExGstCents: string | number
  trackingClient: string | null
}

interface XeroAllocationRow {
  clientId: string
  projectId: string
  sourceFingerprint: string
}

interface ClientRow {
  id: string
  xeroContactId: string | null
}

interface TrackingMappingRow {
  trackingOptionId: string | null
  trackingOptionName: string
}

interface TrackingOptionRow {
  optionId: string
  optionName: string
}

interface ChangedAtRow {
  changedAt: string | Date
}

function allocationError(code: ClientFinancialAllocationErrorCode): never {
  throw new ClientFinancialAllocationError(code)
}

function firstRow<T>(result: { rows?: T[] }): T | null {
  return result.rows?.[0] ?? null
}

function isoDate(value: string | Date): string {
  const normalized = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('Invalid Xero source date')
  }
  return normalized
}

function integerCents(value: string | number): number {
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized)) throw new Error('Invalid Xero source amount')
  return normalized
}

function isoTimestamp(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Invalid allocation audit timestamp')
    return value.toISOString()
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid allocation audit timestamp')
  return parsed.toISOString()
}

function equalText(left: string | null, right: string | null): boolean {
  return left !== null && right !== null
    && left.trim().toLocaleLowerCase('en-AU') === right.trim().toLocaleLowerCase('en-AU')
}

async function sourceFingerprint(tenantId: string, line: XeroLineRow): Promise<string> {
  const source = [
    tenantId,
    line.lineItemId,
    line.invoiceId,
    line.invoiceType,
    isoDate(line.invoiceDate),
    line.accountCode ?? '',
    integerCents(line.lineExGstCents),
    line.description ?? '',
  ].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function resolveProject(
  db: TransactionDb,
  projectId: string | null,
  clientId: string,
): Promise<ProjectRow | null> {
  if (projectId === null) return null
  const project = firstRow(await db.query<ProjectRow>(
    `SELECT
       project.id,
       project.client_id AS "clientId"
     FROM projects project
     WHERE project.id = $1
     FOR UPDATE`,
    [projectId],
  ))
  if (!project || project.clientId !== clientId) allocationError('invalid_assignment')
  return project
}

async function appendAudit(
  db: TransactionDb,
  input: {
    sourceType: FinancialAllocationResult['sourceType']
    tenantId: string | null
    sourceKey: string
    clientId: string
    previousProjectId: string | null
    projectId: string | null
    actorId: string
    metadata: Record<string, unknown>
  },
): Promise<string> {
  const audit = firstRow(await db.query<ChangedAtRow>(
    `INSERT INTO financial_allocation_audit (
       source_type,
       tenant_id,
       source_key,
       client_id,
       previous_project_id,
       new_project_id,
       actor_id,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING changed_at AS "changedAt"`,
    [
      input.sourceType,
      input.tenantId,
      input.sourceKey,
      input.clientId,
      input.previousProjectId,
      input.projectId,
      input.actorId,
      JSON.stringify(input.metadata),
    ],
  ))
  if (!audit) throw new Error('Allocation audit insert returned no row')
  return isoTimestamp(audit.changedAt)
}

async function applyMediaAllocation(
  db: TransactionDb,
  input: {
    tenantId: string | null
    clientId: string
    actorId: string
    mutation: Extract<FinancialAllocationMutation, { sourceType: 'media_spend' }>
  },
): Promise<FinancialAllocationResult> {
  const source = firstRow(await db.query<MediaSpendRow>(
    `SELECT
       spend.id,
       spend.client_id AS "clientId",
       spend.project_id AS "projectId",
       spend.platform
     FROM media_spend spend
     WHERE spend.id = $1
     FOR UPDATE`,
    [input.mutation.sourceId],
  ))
  if (!source) allocationError('source_not_found')

  const project = await resolveProject(db, input.mutation.projectId, input.clientId)
  if (source.clientId !== input.clientId || (project && project.clientId !== source.clientId)) {
    allocationError('invalid_assignment')
  }

  await db.query(
    `UPDATE media_spend
     SET project_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [source.id, input.mutation.projectId],
  )

  const changedAt = await appendAudit(db, {
    sourceType: 'media_spend',
    tenantId: input.tenantId,
    sourceKey: source.id,
    clientId: input.clientId,
    previousProjectId: source.projectId,
    projectId: input.mutation.projectId,
    actorId: input.actorId,
    metadata: { platform: source.platform },
  })
  return {
    sourceType: 'media_spend',
    sourceId: source.id,
    previousProjectId: source.projectId,
    projectId: input.mutation.projectId,
    changedAt,
  }
}

async function lockXeroLine(
  db: TransactionDb,
  tenantId: string,
  sourceId: string,
): Promise<XeroLineRow> {
  const source = firstRow(await db.query<XeroLineRow>(
    `SELECT
       source.line_item_id AS "lineItemId",
       source.invoice_id AS "invoiceId",
       source.invoice_type AS "invoiceType",
       source.invoice_date AS "invoiceDate",
       source.invoice_status AS "invoiceStatus",
       invoice.contact_id AS "invoiceContactId",
       source.account_code AS "accountCode",
       source.description,
       source.line_ex_gst_cents AS "lineExGstCents",
       source.tracking_client AS "trackingClient"
     FROM xero_invoice_lines_cache source
     LEFT JOIN xero_invoices_cache invoice
       ON invoice.tenant_id = source.tenant_id
      AND invoice.invoice_id = source.invoice_id
     WHERE source.tenant_id = $1
       AND source.line_item_id = $2
     FOR UPDATE OF source`,
    [tenantId, sourceId],
  ))
  if (!source) allocationError('source_not_found')
  return source
}

async function lockCurrentXeroAllocation(
  db: TransactionDb,
  tenantId: string,
  sourceId: string,
): Promise<XeroAllocationRow | null> {
  return firstRow(await db.query<XeroAllocationRow>(
    `SELECT
       allocation.client_id AS "clientId",
       allocation.project_id AS "projectId",
       allocation.source_fingerprint AS "sourceFingerprint"
     FROM xero_project_allocations allocation
     WHERE allocation.tenant_id = $1
       AND allocation.line_item_id = $2
     FOR UPDATE`,
    [tenantId, sourceId],
  ))
}

async function lockClient(
  db: TransactionDb,
  clientId: string,
): Promise<ClientRow> {
  const client = firstRow(await db.query<ClientRow>(
    `SELECT
       client.id,
       client.xero_contact_id AS "xeroContactId"
     FROM agency_clients client
     WHERE client.id = $1
     FOR UPDATE`,
    [clientId],
  ))
  if (!client) allocationError('source_not_found')
  return client
}

async function lockTrackingMapping(
  db: TransactionDb,
  tenantId: string,
  clientId: string,
): Promise<TrackingMappingRow | null> {
  return firstRow(await db.query<TrackingMappingRow>(
    `SELECT
       mapping.tracking_option_id AS "trackingOptionId",
       mapping.tracking_option_name AS "trackingOptionName"
     FROM agency_client_xero_tracking_mappings mapping
     WHERE mapping.tenant_id = $1
       AND mapping.client_id = $2
     FOR UPDATE`,
    [tenantId, clientId],
  ))
}

function assertEligibleXeroSource(
  source: XeroLineRow,
  client: ClientRow,
  trackingMapping: TrackingMappingRow | null,
): void {
  const status = source.invoiceStatus.toUpperCase()
  if (['DRAFT', 'VOIDED', 'DELETED'].includes(status)) allocationError('invalid_assignment')

  const type = source.invoiceType.toUpperCase()
  if (type === 'ACCREC') {
    if (!client.xeroContactId || source.invoiceContactId !== client.xeroContactId) {
      allocationError('invalid_assignment')
    }
    return
  }
  if (type === 'ACCPAY') {
    if (!trackingMapping || !equalText(source.trackingClient, trackingMapping.trackingOptionName)) {
      allocationError('invalid_assignment')
    }
    return
  }
  allocationError('invalid_assignment')
}

async function applyXeroAllocation(
  db: TransactionDb,
  input: {
    tenantId: string
    clientId: string
    actorId: string
    mutation: Extract<FinancialAllocationMutation, { sourceType: 'xero_line' }>
  },
): Promise<FinancialAllocationResult> {
  const source = await lockXeroLine(db, input.tenantId, input.mutation.sourceId)
  const existing = await lockCurrentXeroAllocation(db, input.tenantId, source.lineItemId)
  await resolveProject(db, input.mutation.projectId, input.clientId)
  const client = await lockClient(db, input.clientId)

  if (existing && existing.clientId !== input.clientId) allocationError('invalid_assignment')
  const fingerprint = await sourceFingerprint(input.tenantId, source)
  if (existing && existing.sourceFingerprint !== fingerprint) allocationError('stale_source')

  const trackingMapping = source.invoiceType.toUpperCase() === 'ACCPAY'
    ? await lockTrackingMapping(db, input.tenantId, input.clientId)
    : null
  assertEligibleXeroSource(source, client, trackingMapping)

  if (input.mutation.projectId === null) {
    await db.query(
      `DELETE FROM xero_project_allocations
       WHERE tenant_id = $1
         AND line_item_id = $2
         AND client_id = $3`,
      [input.tenantId, source.lineItemId, input.clientId],
    )
  } else {
    await db.query(
      `INSERT INTO xero_project_allocations (
         tenant_id,
         line_item_id,
         invoice_id,
         client_id,
         project_id,
         source_invoice_type,
         source_invoice_date,
         source_account_code,
         source_description,
         source_ex_gst_cents,
         source_fingerprint,
         assigned_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12)
       ON CONFLICT (tenant_id, line_item_id) DO UPDATE SET
         invoice_id = EXCLUDED.invoice_id,
         client_id = EXCLUDED.client_id,
         project_id = EXCLUDED.project_id,
         source_invoice_type = EXCLUDED.source_invoice_type,
         source_invoice_date = EXCLUDED.source_invoice_date,
         source_account_code = EXCLUDED.source_account_code,
         source_description = EXCLUDED.source_description,
         source_ex_gst_cents = EXCLUDED.source_ex_gst_cents,
         source_fingerprint = EXCLUDED.source_fingerprint,
         assigned_by = EXCLUDED.assigned_by,
         updated_at = NOW()`,
      [
        input.tenantId,
        source.lineItemId,
        source.invoiceId,
        input.clientId,
        input.mutation.projectId,
        source.invoiceType,
        isoDate(source.invoiceDate),
        source.accountCode,
        source.description,
        integerCents(source.lineExGstCents),
        fingerprint,
        input.actorId,
      ],
    )
  }

  const previousProjectId = existing?.projectId ?? null
  const changedAt = await appendAudit(db, {
    sourceType: 'xero_line',
    tenantId: input.tenantId,
    sourceKey: source.lineItemId,
    clientId: input.clientId,
    previousProjectId,
    projectId: input.mutation.projectId,
    actorId: input.actorId,
    metadata: { invoiceId: source.invoiceId, sourceFingerprint: fingerprint },
  })
  return {
    sourceType: 'xero_line',
    sourceId: source.lineItemId,
    previousProjectId,
    projectId: input.mutation.projectId,
    changedAt,
  }
}

async function lockActiveTrackingOption(
  db: TransactionDb,
  input: {
    tenantId: string
    trackingOptionId: string
    trackingOptionName: string
  },
): Promise<TrackingOptionRow> {
  const option = firstRow(await db.query<TrackingOptionRow>(
    `SELECT
       COALESCE(option.xero_option_id, option.id::text) AS "optionId",
       option.name AS "optionName"
     FROM xero_tracking_categories category
     JOIN xero_tracking_options option ON option.category_id = category.id
     WHERE category.tenant_id = $1
       AND LOWER(category.name) = LOWER('Client')
       AND UPPER(COALESCE(category.status, 'ACTIVE')) = 'ACTIVE'
       AND UPPER(COALESCE(option.status, 'ACTIVE')) = 'ACTIVE'
       AND COALESCE(option.xero_option_id, option.id::text) = $2
       AND LOWER(option.name) = LOWER($3)
     FOR UPDATE OF category, option`,
    [input.tenantId, input.trackingOptionId, input.trackingOptionName],
  ))
  if (!option) allocationError('invalid_assignment')
  return option
}

async function applyTrackingAllocation(
  db: TransactionDb,
  input: {
    tenantId: string
    clientId: string
    actorId: string
    mutation: Extract<FinancialAllocationMutation, { sourceType: 'client_tracking' }>
  },
): Promise<FinancialAllocationResult> {
  await lockClient(db, input.clientId)
  const existing = await lockTrackingMapping(db, input.tenantId, input.clientId)

  let selected: TrackingOptionRow | null = null
  if (input.mutation.trackingOptionId === null) {
    await db.query(
      `DELETE FROM agency_client_xero_tracking_mappings
       WHERE tenant_id = $1
         AND client_id = $2`,
      [input.tenantId, input.clientId],
    )
  } else {
    selected = await lockActiveTrackingOption(db, {
      tenantId: input.tenantId,
      trackingOptionId: input.mutation.trackingOptionId,
      trackingOptionName: input.mutation.trackingOptionName,
    })
    await db.query(
      `INSERT INTO agency_client_xero_tracking_mappings (
         tenant_id,
         client_id,
         tracking_option_id,
         tracking_option_name,
         confirmed_by
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, client_id) DO UPDATE SET
         tracking_option_id = EXCLUDED.tracking_option_id,
         tracking_option_name = EXCLUDED.tracking_option_name,
         confirmed_by = EXCLUDED.confirmed_by,
         updated_at = NOW()`,
      [input.tenantId, input.clientId, selected.optionId, selected.optionName, input.actorId],
    )
  }

  const changedAt = await appendAudit(db, {
    sourceType: 'client_tracking',
    tenantId: input.tenantId,
    sourceKey: input.clientId,
    clientId: input.clientId,
    previousProjectId: null,
    projectId: null,
    actorId: input.actorId,
    metadata: {
      previousTrackingOptionId: existing?.trackingOptionId ?? null,
      previousTrackingOptionName: existing?.trackingOptionName ?? null,
      newTrackingOptionId: selected?.optionId ?? null,
      newTrackingOptionName: selected?.optionName ?? null,
    },
  })
  return {
    sourceType: 'client_tracking',
    sourceId: input.clientId,
    previousProjectId: null,
    projectId: null,
    changedAt,
  }
}

export async function applyClientFinancialAllocation(input: {
  tenantId: string | null
  clientId: string
  actorId: string
  mutation: FinancialAllocationMutation
}): Promise<FinancialAllocationResult> {
  return transaction(async (db) => {
    switch (input.mutation.sourceType) {
      case 'media_spend':
        return applyMediaAllocation(db, { ...input, mutation: input.mutation })
      case 'xero_line':
        if (!input.tenantId) allocationError('invalid_assignment')
        return applyXeroAllocation(db, { ...input, tenantId: input.tenantId, mutation: input.mutation })
      case 'client_tracking':
        if (!input.tenantId) allocationError('invalid_assignment')
        return applyTrackingAllocation(db, { ...input, tenantId: input.tenantId, mutation: input.mutation })
    }
  })
}
