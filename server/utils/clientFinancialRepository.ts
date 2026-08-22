import { queryOne, queryRows } from '~~/server/utils/db'

export type ClientFinancialDatabaseNumber = string | number
export type ClientFinancialDatabaseTimestamp = string | Date | null

export interface ClientFinancialRawClient {
  id: string
  name: string
  xeroContactId: string | null
}

export interface ClientFinancialRawProject {
  id: string
  name: string
  status: string
  budgetAmount: ClientFinancialDatabaseNumber | null
}

export interface ClientFinancialRawXeroLine {
  lineItemId: string
  invoiceId: string
  invoiceNumber: string | null
  invoiceType: string
  invoiceDate: string | Date
  accountCode: string | null
  accountType: string | null
  description: string | null
  lineExGstCents: ClientFinancialDatabaseNumber
  trackingClient: string | null
  contactId: string
  syncedAt: ClientFinancialDatabaseTimestamp
  allocationProjectId?: string | null
  allocationFingerprint?: string | null
}

export interface ClientFinancialRawXeroAllocation {
  lineItemId: string
  invoiceId: string
  projectId: string
  sourceFingerprint: string
  sourceInvoiceType: string
  sourceInvoiceDate: string | Date
  sourceAccountCode: string | null
  sourceDescription: string | null
  sourceExGstCents: ClientFinancialDatabaseNumber
}

export interface ClientFinancialRawMediaSpend {
  id: string
  projectId: string | null
  platform: string
  campaignName: string
  budgetAllocated: ClientFinancialDatabaseNumber | null
  actualSpend: ClientFinancialDatabaseNumber
  period: string
  connectionId: string | null
  syncedAt: ClientFinancialDatabaseTimestamp
  updatedAt: ClientFinancialDatabaseTimestamp
  dailySpend: ClientFinancialDatabaseNumber | null
  dailyRowCount: number
  pacingStatus?: string | null
}

export interface ClientFinancialRawTimeEntry {
  id: string
  projectId: string
  projectName: string
  date: string | Date
  userName: string | null
  description: string | null
  hours: ClientFinancialDatabaseNumber
  hourlyRate: ClientFinancialDatabaseNumber
  createdAt: ClientFinancialDatabaseTimestamp
}

export interface ClientFinancialRawTimeSummary {
  projectId: string
  hours: ClientFinancialDatabaseNumber
  labourCost: ClientFinancialDatabaseNumber
}

export interface ClientFinancialRawProjectExpense {
  id: string
  projectId: string
  date: string | Date
  description: string
  vendorName: string | null
  amount: ClientFinancialDatabaseNumber
  xeroInvoiceId: string | null
  createdAt: ClientFinancialDatabaseTimestamp
}

export interface ClientFinancialRawInvoice {
  id: string
  invoiceNumber: string | null
  type: string
  status: string
  date: string | Date
  dueDate: string | Date | null
  totalCents: ClientFinancialDatabaseNumber
  amountPaidCents: ClientFinancialDatabaseNumber
  amountDueCents: ClientFinancialDatabaseNumber
  currencyCode: string | null
  syncedAt: ClientFinancialDatabaseTimestamp
}

export interface ClientFinancialRawTrackingMapping {
  trackingOptionId: string | null
  trackingOptionName: string
}

export interface ClientFinancialRawTrackingOption {
  id: string | null
  name: string
  isActive: boolean
}

export interface ClientFinancialDataset {
  client: ClientFinancialRawClient
  projects: ClientFinancialRawProject[]
  xeroLines: ClientFinancialRawXeroLine[]
  savedXeroAllocations: ClientFinancialRawXeroAllocation[]
  mediaSpend: ClientFinancialRawMediaSpend[]
  activeMediaConnection: {
    exists: boolean
    updatedAt: ClientFinancialDatabaseTimestamp
  }
  timeEntries: ClientFinancialRawTimeEntry[]
  /** Full-period project aggregates used for calculation when detail is capped. */
  timeSummaries?: ClientFinancialRawTimeSummary[]
  totalTimeEntries: number
  projectExpenses: ClientFinancialRawProjectExpense[]
  invoices: ClientFinancialRawInvoice[]
  trackingMapping: ClientFinancialRawTrackingMapping | null
  trackingOptions: ClientFinancialRawTrackingOption[]
  freshness: {
    xeroInvoices: ClientFinancialDatabaseTimestamp
    xeroLines: ClientFinancialDatabaseTimestamp
    media: ClientFinancialDatabaseTimestamp
    timeEntries: ClientFinancialDatabaseTimestamp
    projectExpenses: ClientFinancialDatabaseTimestamp
  }
}

export type ClientFinancialRepositoryErrorCode = 'client_not_found'

export class ClientFinancialRepositoryError extends Error {
  readonly statusCode = 404

  constructor(readonly code: ClientFinancialRepositoryErrorCode) {
    super(code === 'client_not_found' ? 'Client not found' : code)
    this.name = 'ClientFinancialRepositoryError'
  }
}

interface RawCount {
  count: string | number
}

interface RawConnectionState {
  exists: boolean
  updatedAt: ClientFinancialDatabaseTimestamp
}

type RawFreshness = ClientFinancialDataset['freshness']

async function loadProjects(clientId: string): Promise<ClientFinancialRawProject[]> {
  return queryRows<ClientFinancialRawProject>(
    `SELECT
       p.id,
       p.name,
       p.status,
       p.budget_amount AS "budgetAmount"
     FROM projects p
     WHERE p.client_id = $1
     ORDER BY p.name ASC, p.id ASC`,
    [clientId],
  )
}

async function loadTrackingMapping(
  tenantId: string | null,
  clientId: string,
): Promise<ClientFinancialRawTrackingMapping | null> {
  if (!tenantId) return null
  return queryOne<ClientFinancialRawTrackingMapping>(
    `SELECT
       m.tracking_option_id AS "trackingOptionId",
       m.tracking_option_name AS "trackingOptionName"
     FROM agency_client_xero_tracking_mappings m
     WHERE m.tenant_id = $1
       AND m.client_id = $2
     LIMIT 1`,
    [tenantId, clientId],
  )
}

async function loadXeroLines(input: {
  tenantId: string | null
  clientId: string
  contactId: string | null
  from: string
  to: string
}): Promise<ClientFinancialRawXeroLine[]> {
  if (!input.tenantId) return []
  return queryRows<ClientFinancialRawXeroLine>(
    `SELECT
       l.line_item_id AS "lineItemId",
       l.invoice_id AS "invoiceId",
       i.invoice_number AS "invoiceNumber",
       l.invoice_type AS "invoiceType",
       l.invoice_date AS "invoiceDate",
       l.account_code AS "accountCode",
       account.type AS "accountType",
       l.description,
       l.line_ex_gst_cents AS "lineExGstCents",
       l.tracking_client AS "trackingClient",
       i.contact_id AS "contactId",
       l.synced_at AS "syncedAt",
       allocation.project_id AS "allocationProjectId",
       allocation.source_fingerprint AS "allocationFingerprint"
     FROM xero_invoice_lines_cache l
     JOIN xero_invoices_cache i
       ON i.tenant_id = l.tenant_id
      AND i.invoice_id = l.invoice_id
     LEFT JOIN xero_accounts_cache account
       ON account.tenant_id = l.tenant_id
      AND account.code = l.account_code
     LEFT JOIN xero_project_allocations allocation
       ON allocation.tenant_id = l.tenant_id
      AND allocation.line_item_id = l.line_item_id
      AND allocation.client_id = $2
     WHERE l.tenant_id = $1
       AND l.invoice_date BETWEEN $3::date AND $4::date
       AND UPPER(COALESCE(l.invoice_status, i.status)) NOT IN ('DRAFT', 'VOIDED', 'DELETED')
       AND (
         (
           UPPER(l.invoice_type) = 'ACCREC'
           AND $5::text IS NOT NULL
           AND i.contact_id = $5
         )
         OR (
           UPPER(l.invoice_type) = 'ACCPAY'
           AND EXISTS (
             SELECT 1
             FROM agency_client_xero_tracking_mappings mapping
             WHERE mapping.tenant_id = l.tenant_id
               AND mapping.client_id = $2
               AND LOWER(mapping.tracking_option_name) = LOWER(l.tracking_client)
           )
         )
       )
     ORDER BY l.invoice_date DESC, l.invoice_id, l.line_item_id`,
    [input.tenantId, input.clientId, input.from, input.to, input.contactId],
  )
}

async function loadSavedXeroAllocations(input: {
  tenantId: string | null
  clientId: string
  from: string
  to: string
}): Promise<ClientFinancialRawXeroAllocation[]> {
  if (!input.tenantId) return []
  return queryRows<ClientFinancialRawXeroAllocation>(
    `SELECT
       allocation.line_item_id AS "lineItemId",
       allocation.invoice_id AS "invoiceId",
       allocation.project_id AS "projectId",
       allocation.source_fingerprint AS "sourceFingerprint",
       allocation.source_invoice_type AS "sourceInvoiceType",
       allocation.source_invoice_date AS "sourceInvoiceDate",
       allocation.source_account_code AS "sourceAccountCode",
       allocation.source_description AS "sourceDescription",
       allocation.source_ex_gst_cents AS "sourceExGstCents"
     FROM xero_project_allocations allocation
     WHERE allocation.tenant_id = $1
       AND allocation.client_id = $2
       AND allocation.source_invoice_date BETWEEN $3::date AND $4::date
     ORDER BY allocation.source_invoice_date DESC, allocation.line_item_id`,
    [input.tenantId, input.clientId, input.from, input.to],
  )
}

async function loadMediaSpend(input: {
  clientId: string
  from: string
  to: string
}): Promise<ClientFinancialRawMediaSpend[]> {
  const rows = await queryRows<ClientFinancialRawMediaSpend & { dailyRowCount: string | number }>(
    `SELECT
       spend.id,
       spend.project_id AS "projectId",
       spend.platform,
       COALESCE(NULLIF(spend.campaign_name, ''), spend.platform, 'Media campaign') AS "campaignName",
       spend.budget_allocated AS "budgetAllocated",
       COALESCE(spend.actual_spend, 0) AS "actualSpend",
       spend.period,
       spend.connection_id AS "connectionId",
       spend.synced_at AS "syncedAt",
       spend.updated_at AS "updatedAt",
       daily.total_spend AS "dailySpend",
       daily.row_count AS "dailyRowCount",
       spend.campaign_status AS "pacingStatus"
     FROM media_spend spend
     LEFT JOIN LATERAL (
       SELECT
         SUM(day.spend) AS total_spend,
         COUNT(*) AS row_count
       FROM daily_spend day
       WHERE day.media_spend_id = spend.id
         AND day.spend_date BETWEEN $2::date AND $3::date
     ) daily ON TRUE
     WHERE spend.client_id = $1
       AND spend.period BETWEEN LEFT($2::text, 7) AND LEFT($3::text, 7)
     ORDER BY spend.period DESC, spend.platform, spend.campaign_name, spend.id`,
    [input.clientId, input.from, input.to],
  )
  return rows.map(row => ({ ...row, dailyRowCount: Number(row.dailyRowCount || 0) }))
}

async function loadActiveMediaConnection(clientId: string): Promise<RawConnectionState> {
  const row = await queryOne<RawConnectionState>(
    `SELECT
       EXISTS (
         SELECT 1
         FROM social_connections connection
         WHERE connection.client_id = $1
           AND connection.status = 'active'
       ) AS "exists",
       MAX(connection.updated_at) FILTER (WHERE connection.status = 'active') AS "updatedAt"
     FROM social_connections connection
     WHERE connection.client_id = $1`,
    [clientId],
  )
  return row ?? { exists: false, updatedAt: null }
}

async function loadTimeEntries(input: {
  clientId: string
  from: string
  to: string
}): Promise<ClientFinancialRawTimeEntry[]> {
  return queryRows<ClientFinancialRawTimeEntry>(
    `SELECT
       entry.id,
       entry.project_id AS "projectId",
       project.name AS "projectName",
       entry.date,
       member.name AS "userName",
       entry.description,
       entry.hours,
       entry.hourly_rate AS "hourlyRate",
       entry.created_at AS "createdAt"
     FROM time_entries entry
     JOIN projects project
       ON project.id = entry.project_id
      AND project.client_id = $1
     LEFT JOIN team_members member ON member.id = entry.user_id
     WHERE entry.date BETWEEN $2::date AND $3::date
     ORDER BY entry.date DESC, entry.created_at DESC, entry.id
     LIMIT 500`,
    [input.clientId, input.from, input.to],
  )
}

async function loadTimeSummaries(input: {
  clientId: string
  from: string
  to: string
}): Promise<ClientFinancialRawTimeSummary[]> {
  return queryRows<ClientFinancialRawTimeSummary>(
    `SELECT
       entry.project_id AS "projectId",
       COALESCE(SUM(entry.hours), 0) AS hours,
       COALESCE(SUM(entry.hours * entry.hourly_rate), 0) AS "labourCost"
     FROM time_entries entry
     JOIN projects project
       ON project.id = entry.project_id
      AND project.client_id = $1
     WHERE entry.date BETWEEN $2::date AND $3::date
     GROUP BY entry.project_id
     ORDER BY entry.project_id`,
    [input.clientId, input.from, input.to],
  )
}

async function countTimeEntries(input: {
  clientId: string
  from: string
  to: string
}): Promise<number> {
  const row = await queryOne<RawCount>(
    `SELECT COUNT(*) AS count
     FROM time_entries entry
     JOIN projects project
       ON project.id = entry.project_id
      AND project.client_id = $1
     WHERE entry.date BETWEEN $2::date AND $3::date`,
    [input.clientId, input.from, input.to],
  )
  return Number(row?.count || 0)
}

async function loadProjectExpenses(input: {
  clientId: string
  from: string
  to: string
}): Promise<ClientFinancialRawProjectExpense[]> {
  return queryRows<ClientFinancialRawProjectExpense>(
    `SELECT
       expense.id,
       expense.project_id AS "projectId",
       expense.date,
       expense.description,
       expense.vendor_name AS "vendorName",
       expense.amount,
       expense.xero_invoice_id AS "xeroInvoiceId",
       expense.created_at AS "createdAt"
     FROM project_expenses expense
     JOIN projects project
       ON project.id = expense.project_id
      AND project.client_id = $1
     WHERE expense.date BETWEEN $2::date AND $3::date
     ORDER BY expense.date DESC, expense.created_at DESC, expense.id`,
    [input.clientId, input.from, input.to],
  )
}

async function loadInvoices(input: {
  tenantId: string | null
  contactId: string | null
  from: string
  to: string
}): Promise<ClientFinancialRawInvoice[]> {
  if (!input.tenantId || !input.contactId) return []
  return queryRows<ClientFinancialRawInvoice>(
    `SELECT
       invoice.invoice_id AS id,
       invoice.invoice_number AS "invoiceNumber",
       invoice.type,
       invoice.status,
       invoice.date,
       invoice.due_date AS "dueDate",
       invoice.total_cents AS "totalCents",
       invoice.amount_paid_cents AS "amountPaidCents",
       invoice.amount_due_cents AS "amountDueCents",
       invoice.currency_code AS "currencyCode",
       invoice.synced_at AS "syncedAt"
     FROM xero_invoices_cache invoice
     WHERE invoice.tenant_id = $1
       AND invoice.contact_id = $2
       AND invoice.date BETWEEN $3::date AND $4::date
       AND UPPER(invoice.type) IN ('ACCREC', 'ACCPAY')
     ORDER BY invoice.date DESC, invoice.invoice_number, invoice.invoice_id`,
    [input.tenantId, input.contactId, input.from, input.to],
  )
}

async function loadTrackingOptions(includeSources: boolean): Promise<ClientFinancialRawTrackingOption[]> {
  if (!includeSources) return []
  return queryRows<ClientFinancialRawTrackingOption>(
    `SELECT
       COALESCE(option.xero_option_id, option.id::text) AS id,
       option.name,
       TRUE AS "isActive"
     FROM xero_tracking_categories category
     JOIN xero_tracking_options option ON option.category_id = category.id
     WHERE LOWER(category.name) = LOWER('Client')
       AND UPPER(COALESCE(category.status, 'ACTIVE')) = 'ACTIVE'
       AND UPPER(COALESCE(option.status, 'ACTIVE')) = 'ACTIVE'
     ORDER BY LOWER(option.name), option.id`,
  )
}

async function loadFreshness(input: {
  tenantId: string | null
  contactId: string | null
  clientId: string
  from: string
  to: string
}): Promise<RawFreshness> {
  const row = await queryOne<RawFreshness>(
    `SELECT
       (
         SELECT MAX(invoice.synced_at)
         FROM xero_invoices_cache invoice
         WHERE invoice.tenant_id = $1
           AND $2::text IS NOT NULL
           AND invoice.contact_id = $2
           AND invoice.date BETWEEN $4::date AND $5::date
       ) AS "xeroInvoices",
       (
         SELECT MAX(line.synced_at)
         FROM xero_invoice_lines_cache line
         JOIN xero_invoices_cache invoice
           ON invoice.tenant_id = line.tenant_id
          AND invoice.invoice_id = line.invoice_id
         WHERE line.tenant_id = $1
           AND line.invoice_date BETWEEN $4::date AND $5::date
           AND UPPER(COALESCE(line.invoice_status, invoice.status)) NOT IN ('DRAFT', 'VOIDED', 'DELETED')
           AND (
             (UPPER(line.invoice_type) = 'ACCREC' AND $2::text IS NOT NULL AND invoice.contact_id = $2)
             OR (
               UPPER(line.invoice_type) = 'ACCPAY'
               AND EXISTS (
                 SELECT 1
                 FROM agency_client_xero_tracking_mappings mapping
                 WHERE mapping.tenant_id = line.tenant_id
                   AND mapping.client_id = $3
                   AND LOWER(mapping.tracking_option_name) = LOWER(line.tracking_client)
               )
             )
           )
       ) AS "xeroLines",
       (
         SELECT MAX(source.updated_at)
         FROM (
           SELECT COALESCE(spend.synced_at, spend.updated_at) AS updated_at
           FROM media_spend spend
           WHERE spend.client_id = $3
             AND spend.period BETWEEN LEFT($4::text, 7) AND LEFT($5::text, 7)
           UNION ALL
           SELECT connection.updated_at
           FROM social_connections connection
           WHERE connection.client_id = $3
             AND connection.status = 'active'
         ) source
       ) AS media,
       (
         SELECT MAX(entry.created_at)
         FROM time_entries entry
         JOIN projects project ON project.id = entry.project_id AND project.client_id = $3
         WHERE entry.date BETWEEN $4::date AND $5::date
       ) AS "timeEntries",
       (
         SELECT MAX(expense.created_at)
         FROM project_expenses expense
         JOIN projects project ON project.id = expense.project_id AND project.client_id = $3
         WHERE expense.date BETWEEN $4::date AND $5::date
       ) AS "projectExpenses"`,
    [input.tenantId, input.contactId, input.clientId, input.from, input.to],
  )
  return row ?? {
    xeroInvoices: null,
    xeroLines: null,
    media: null,
    timeEntries: null,
    projectExpenses: null,
  }
}

export async function loadClientFinancialDataset(input: {
  tenantId: string | null
  clientId: string
  from: string
  to: string
  includeSources: boolean
}): Promise<ClientFinancialDataset> {
  const client = await queryOne<ClientFinancialRawClient>(
    `SELECT
       client.id,
       client.name,
       client.xero_contact_id AS "xeroContactId"
     FROM agency_clients client
     WHERE client.id = $1
     LIMIT 1`,
    [input.clientId],
  )
  if (!client) throw new ClientFinancialRepositoryError('client_not_found')

  const sourceInput = {
    tenantId: input.tenantId,
    clientId: client.id,
    contactId: client.xeroContactId,
    from: input.from,
    to: input.to,
  }
  const [
    projects,
    xeroLines,
    savedXeroAllocations,
    mediaSpend,
    activeMediaConnection,
    timeEntries,
    timeSummaries,
    totalTimeEntries,
    projectExpenses,
    invoices,
    trackingMapping,
    trackingOptions,
    freshness,
  ] = await Promise.all([
    loadProjects(client.id),
    loadXeroLines(sourceInput),
    loadSavedXeroAllocations(sourceInput),
    loadMediaSpend(sourceInput),
    loadActiveMediaConnection(client.id),
    loadTimeEntries(sourceInput),
    loadTimeSummaries(sourceInput),
    countTimeEntries(sourceInput),
    loadProjectExpenses(sourceInput),
    loadInvoices(sourceInput),
    loadTrackingMapping(input.tenantId, client.id),
    loadTrackingOptions(input.includeSources),
    loadFreshness(sourceInput),
  ])

  return {
    client,
    projects,
    xeroLines,
    savedXeroAllocations,
    mediaSpend,
    activeMediaConnection,
    timeEntries,
    timeSummaries,
    totalTimeEntries,
    projectExpenses,
    invoices,
    trackingMapping,
    trackingOptions,
    freshness,
  }
}
