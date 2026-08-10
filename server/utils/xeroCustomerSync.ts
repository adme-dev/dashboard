/**
 * Xero customer sync — populates xero_contacts_cache, xero_invoices_cache
 * and recomputes xero_customer_rollups.
 *
 * Designed to run from a 15-min cron (server/api/cron/xero-customer-sync.post.ts)
 * or from the manual "Sync from Xero" button (server/api/xero/contacts/sync.post.ts).
 *
 * Pages through Xero with conservative limits — full sync is bounded to
 * ~1000 contacts and ~5000 invoices to keep within rate-limit budget.
 * Delta syncs (modifiedAfter) are unbounded since the page count is naturally
 * small.
 */

import { xeroFetch, camelCaseKeysDeep } from './xeroClient'
import { execute, query } from './db'

// ─── Types ──────────────────────────────────────────────────────────

interface SyncOpts {
  tenantId: string
  accessToken: string
  /** ISO date — only fetch records updated since. Skip for full resync. */
  modifiedAfter?: Date
}

export interface XeroSyncResult {
  contactsUpserted: number
  invoicesUpserted: number
  rollupsRecomputed: number
  mrrContacts: number
  insightsRecomputed: number
  durationMs: number
  errors: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Convert a Xero monetary value (decimal) to integer cents. */
function toCents(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100)
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.round(n * 100)
  }
  return 0
}

/** Slice an ISO datetime to a YYYY-MM-DD date string, or null. */
function toDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return value.slice(0, 10)
}

function pickPrimary<T>(arr: T[] | undefined, predicate: (item: T) => boolean): T | undefined {
  if (!arr?.length) return undefined
  return arr.find(predicate) ?? arr[0]
}

function formatPhone(p: any): string | null {
  if (!p) return null
  const parts = [p.phoneCountryCode, p.phoneAreaCode, p.phoneNumber].filter(Boolean)
  return parts.length ? parts.join(' ').trim() : null
}

/**
 * Land a faithful copy of a Xero payload (ADR-007): upsert the latest
 * version into the xero_raw_* mirror and append every distinct version
 * (keyed by Xero's UpdatedDateUTC) to xero_raw_history for audits.
 * The payload is stored EXACTLY as Xero sent it — PascalCase, untransformed.
 */
async function landRaw(
  entity: 'invoice' | 'contact',
  tenantId: string,
  xeroId: string,
  updatedUtc: string | null | undefined,
  rawPayload: unknown,
): Promise<void> {
  if (!xeroId || !updatedUtc) return
  const table = entity === 'invoice' ? 'xero_raw_invoices' : 'xero_raw_contacts'
  const json = JSON.stringify(rawPayload)
  await execute(
    `INSERT INTO ${table} (xero_id, tenant_id, xero_updated_utc, raw_payload, synced_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (xero_id) DO UPDATE SET
       xero_updated_utc = EXCLUDED.xero_updated_utc,
       raw_payload = EXCLUDED.raw_payload,
       synced_at = NOW()`,
    [xeroId, tenantId, updatedUtc, json],
  )
  await execute(
    `INSERT INTO xero_raw_history (entity, tenant_id, xero_id, xero_updated_utc, raw_payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT DO NOTHING`,
    [entity, tenantId, xeroId, updatedUtc, json],
  )
}

function buildModifiedAfterHeader(d?: Date): Record<string, string> {
  // Xero accepts If-Modified-Since as RFC 1123, but the SDK sets a bespoke
  // header. With our raw fetch we use If-Modified-Since which works for the
  // accounting endpoints.
  if (!d) return {}
  return { 'If-Modified-Since': d.toUTCString() }
}

// ─── Contacts cache ────────────────────────────────────────────────

const CONTACTS_MAX_PAGES = 20  // 20 × 100 = 2000 contacts safety cap

export async function syncXeroContactsCache(opts: SyncOpts): Promise<number> {
  const { tenantId, accessToken, modifiedAfter } = opts
  let upserted = 0

  for (let page = 1; page <= CONTACTS_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where: 'ContactStatus=="ACTIVE"',
      order: 'Name ASC',
      page: String(page),
      pageSize: '100',
    })

    const body = await xeroFetch<any>({
      accessToken,
      tenantId,
      path: `Contacts?${params.toString()}`,
      // Delta path: Xero filters server-side on If-Modified-Since, so an
      // unchanged org costs one call instead of a full page-through.
      headers: buildModifiedAfterHeader(modifiedAfter),
      // Raw so the landing layer stores the payload exactly as sent
      // (ADR-007); camelCase per record below for processing.
      raw: true,
    })

    const rawContacts: any[] = body?.Contacts ?? []
    if (!rawContacts.length) break

    for (const rawC of rawContacts) {
      const c = camelCaseKeysDeep(rawC)
      // Land BEFORE the cache-side skips — the audit layer keeps everything.
      await landRaw('contact', tenantId, c.contactID, c.updatedDateUTC, rawC)
      const street = pickPrimary(c.addresses, (a: any) => a.addressType === 'STREET')
      const phone = pickPrimary(c.phones, (p: any) => p.phoneType === 'DEFAULT')
      const primaryPerson = pickPrimary(c.contactPersons, (p: any) => p.includeInEmails)

      // Xero balances live under accountsReceivable / accountsPayable. Treat
      // missing values as zero — newly-created contacts often have no balances
      // node at all.
      const ar = c.balances?.accountsReceivable ?? {}
      const ap = c.balances?.accountsPayable ?? {}

      // Belt-and-braces: Xero already filtered on If-Modified-Since, but keep
      // the JS-side skip in case a proxy strips the header.
      if (modifiedAfter && c.updatedDateUTC) {
        const updated = new Date(c.updatedDateUTC)
        if (updated < modifiedAfter) continue
      }

      await execute(
        `INSERT INTO xero_contacts_cache (
          tenant_id, contact_id, name, contact_number, account_number, status,
          is_customer, is_supplier,
          email, phone, website, tax_number, default_currency,
          payment_terms_days, payment_terms_type,
          address_line1, address_line2, city, region, postal_code, country,
          receivable_outstanding_cents, receivable_overdue_cents,
          payable_outstanding_cents, payable_overdue_cents,
          xero_updated_at, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15,
          $16, $17, $18, $19, $20, $21,
          $22, $23,
          $24, $25,
          $26, NOW()
        )
        ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
          name = EXCLUDED.name,
          contact_number = EXCLUDED.contact_number,
          account_number = EXCLUDED.account_number,
          status = EXCLUDED.status,
          is_customer = EXCLUDED.is_customer,
          is_supplier = EXCLUDED.is_supplier,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          website = EXCLUDED.website,
          tax_number = EXCLUDED.tax_number,
          default_currency = EXCLUDED.default_currency,
          payment_terms_days = EXCLUDED.payment_terms_days,
          payment_terms_type = EXCLUDED.payment_terms_type,
          address_line1 = EXCLUDED.address_line1,
          address_line2 = EXCLUDED.address_line2,
          city = EXCLUDED.city,
          region = EXCLUDED.region,
          postal_code = EXCLUDED.postal_code,
          country = EXCLUDED.country,
          receivable_outstanding_cents = EXCLUDED.receivable_outstanding_cents,
          receivable_overdue_cents = EXCLUDED.receivable_overdue_cents,
          payable_outstanding_cents = EXCLUDED.payable_outstanding_cents,
          payable_overdue_cents = EXCLUDED.payable_overdue_cents,
          xero_updated_at = EXCLUDED.xero_updated_at,
          synced_at = NOW()`,
        [
          tenantId,
          c.contactID,
          c.name ?? '',
          c.contactNumber ?? null,
          c.accountNumber ?? null,
          c.contactStatus ?? 'ACTIVE',
          Boolean(c.isCustomer),
          Boolean(c.isSupplier),
          c.emailAddress ?? primaryPerson?.emailAddress ?? null,
          formatPhone(phone),
          c.website ?? null,
          c.taxNumber ?? null,
          c.defaultCurrency ?? null,
          c.paymentTerms?.sales?.day ?? null,
          c.paymentTerms?.sales?.type ?? null,
          street?.addressLine1 ?? null,
          street?.addressLine2 ?? null,
          street?.city ?? null,
          street?.region ?? null,
          street?.postalCode ?? null,
          street?.country ?? null,
          toCents(ar.outstanding),
          toCents(ar.overdue),
          toCents(ap.outstanding),
          toCents(ap.overdue),
          c.updatedDateUTC ? new Date(c.updatedDateUTC) : null,
        ],
      )
      upserted++
    }

    if (rawContacts.length < 100) break
  }

  return upserted
}

// ─── Invoices cache ────────────────────────────────────────────────

const INVOICES_MAX_PAGES = 50  // 50 × 100 = 5000 invoices safety cap

export async function syncXeroInvoicesCache(opts: SyncOpts): Promise<number> {
  const { tenantId, accessToken, modifiedAfter } = opts
  let upserted = 0

  // Sync both ACCREC (sales) and ACCPAY (purchases). Customers UI only
  // reads ACCREC but ACCPAY is cheap to grab and unlocks the supplier view
  // later for free.
  for (const type of ['ACCREC', 'ACCPAY'] as const) {
    for (let page = 1; page <= INVOICES_MAX_PAGES; page++) {
      const params = new URLSearchParams({
        where: `Type=="${type}"`,
        order: 'Date DESC',
        page: String(page),
        pageSize: '100',
      })

      const body = await xeroFetch<any>({
        accessToken,
        tenantId,
        path: `Invoices?${params.toString()}`,
        // Delta path: server-side If-Modified-Since filter — an unchanged org
        // costs one call per type instead of a full page-through.
        headers: buildModifiedAfterHeader(modifiedAfter),
        // Raw so the landing layer stores the payload exactly as sent
        // (ADR-007); camelCase per record below for processing.
        raw: true,
      })

      const rawInvoices: any[] = body?.Invoices ?? []
      if (!rawInvoices.length) break

      for (const rawInv of rawInvoices) {
        const inv = camelCaseKeysDeep(rawInv)
        // Land BEFORE the cache-side skips: the audit layer keeps everything
        // Xero sends, including DELETED records the cache ignores.
        await landRaw('invoice', tenantId, inv.invoiceID, inv.updatedDateUTC, rawInv)
        if (modifiedAfter && inv.updatedDateUTC) {
          const updated = new Date(inv.updatedDateUTC)
          if (updated < modifiedAfter) continue
        }
        // Skip DELETED — Xero returns them but we don't want zombie rows.
        if (inv.status === 'DELETED') continue
        if (!inv.invoiceID || !inv.contact?.contactID) continue

        await execute(
          `INSERT INTO xero_invoices_cache (
            tenant_id, invoice_id, contact_id, invoice_number, reference,
            type, status, date, due_date, fully_paid_on_date,
            currency_code,
            subtotal_cents, total_tax_cents, total_cents,
            amount_paid_cents, amount_due_cents, amount_credited_cents,
            xero_updated_at, synced_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11,
            $12, $13, $14,
            $15, $16, $17,
            $18, NOW()
          )
          ON CONFLICT (tenant_id, invoice_id) DO UPDATE SET
            contact_id = EXCLUDED.contact_id,
            invoice_number = EXCLUDED.invoice_number,
            reference = EXCLUDED.reference,
            status = EXCLUDED.status,
            date = EXCLUDED.date,
            due_date = EXCLUDED.due_date,
            fully_paid_on_date = EXCLUDED.fully_paid_on_date,
            currency_code = EXCLUDED.currency_code,
            subtotal_cents = EXCLUDED.subtotal_cents,
            total_tax_cents = EXCLUDED.total_tax_cents,
            total_cents = EXCLUDED.total_cents,
            amount_paid_cents = EXCLUDED.amount_paid_cents,
            amount_due_cents = EXCLUDED.amount_due_cents,
            amount_credited_cents = EXCLUDED.amount_credited_cents,
            xero_updated_at = EXCLUDED.xero_updated_at,
            synced_at = NOW()`,
          [
            tenantId,
            inv.invoiceID,
            inv.contact.contactID,
            inv.invoiceNumber ?? null,
            inv.reference ?? null,
            type,
            inv.status ?? 'AUTHORISED',
            toDateOnly(inv.date) ?? new Date().toISOString().slice(0, 10),
            toDateOnly(inv.dueDate),
            toDateOnly(inv.fullyPaidOnDate),
            inv.currencyCode ?? null,
            toCents(inv.subTotal),
            toCents(inv.totalTax),
            toCents(inv.total),
            toCents(inv.amountPaid),
            toCents(inv.amountDue),
            toCents(inv.amountCredited),
            inv.updatedDateUTC ? new Date(inv.updatedDateUTC) : null,
          ],
        )
        upserted++
      }

      if (rawInvoices.length < 100) break
    }
  }

  return upserted
}

// ─── Repeating invoices → MRR map ─────────────────────────────────

/**
 * Returns a Map<contactId, monthlyCentsAmount> for all ACTIVE ACCREC
 * repeating invoices. Schedules are normalised to a monthly equivalent:
 *   WEEKLY  → amount × 52 / 12
 *   MONTHLY → amount
 *   YEARLY  → amount / 12
 *
 * If a contact has multiple repeating schedules (e.g. retainer + media),
 * they're summed.
 */
export async function syncRepeatingInvoiceMRR(
  opts: { tenantId: string; accessToken: string },
): Promise<Map<string, number>> {
  const { tenantId, accessToken } = opts
  const result = new Map<string, number>()

  const body = await xeroFetch<any>({
    accessToken,
    tenantId,
    path: 'RepeatingInvoices',
  })

  const schedules: any[] = body?.repeatingInvoices ?? []
  for (const r of schedules) {
    if (r.type !== 'ACCREC') continue
    if (r.status !== 'AUTHORISED') continue  // ignore DRAFT / DELETED

    const contactId = r.contact?.contactID
    if (!contactId) continue

    const total = Number(r.total) || 0
    const period = Number(r.schedule?.period) || 1
    const unit = String(r.schedule?.unit ?? 'MONTHLY').toUpperCase()

    // Per-period amount → monthly equivalent
    let monthlyDecimal = 0
    if (unit === 'WEEKLY')       monthlyDecimal = (total / period) * (52 / 12)
    else if (unit === 'MONTHLY') monthlyDecimal = total / period
    else if (unit === 'YEARLY')  monthlyDecimal = (total / period) / 12

    const cents = Math.round(monthlyDecimal * 100)
    result.set(contactId, (result.get(contactId) ?? 0) + cents)
  }

  return result
}

// ─── Rollup recomputation ─────────────────────────────────────────

/**
 * Recomputes xero_customer_rollups for every contact with at least one
 * ACCREC invoice in xero_invoices_cache. Uses a single SQL statement so
 * the round-trip cost is one query regardless of customer count.
 *
 * MRR is supplied as a JSONB map { contactId: cents } since it lives in
 * a different Xero endpoint (RepeatingInvoices) and isn't worth giving
 * its own table for.
 */
export async function recomputeCustomerRollups(opts: {
  tenantId: string
  mrrByContact: Map<string, number>
}): Promise<number> {
  const { tenantId, mrrByContact } = opts

  const mrrJson: Record<string, number> = {}
  for (const [contactId, cents] of mrrByContact) {
    mrrJson[contactId] = cents
  }

  const sql = `
    WITH per_contact AS (
      SELECT
        contact_id,
        MAX(currency_code) AS currency_code,
        MIN(date) AS first_invoice_date,
        MAX(date) AS last_invoice_date,
        MAX(fully_paid_on_date) AS last_payment_date,
        SUM(CASE WHEN status = 'PAID' THEN total_cents ELSE 0 END) AS ltv_cents,
        SUM(CASE WHEN status IN ('PAID','AUTHORISED')
                  AND date >= DATE_TRUNC('year', CURRENT_DATE)
                 THEN total_cents ELSE 0 END) AS ytd_revenue_cents,
        SUM(CASE WHEN status IN ('PAID','AUTHORISED')
                  AND date >= (CURRENT_DATE - INTERVAL '12 months')::date
                 THEN total_cents ELSE 0 END) AS last_12m_revenue_cents,
        COUNT(*) FILTER (WHERE status NOT IN ('VOIDED','DRAFT')) AS invoice_count,
        COUNT(*) FILTER (WHERE status = 'PAID') AS paid_invoice_count,
        SUM(CASE WHEN status = 'AUTHORISED' THEN amount_due_cents ELSE 0 END) AS outstanding_cents
      FROM xero_invoices_cache
      WHERE tenant_id = $1 AND type = 'ACCREC'
      GROUP BY contact_id
    ),
    -- 12 most-recent months per contact, oldest → newest in the array
    monthly AS (
      SELECT
        contact_id,
        DATE_TRUNC('month', date)::date AS month_start,
        TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month_key,
        SUM(total_cents) AS month_cents
      FROM xero_invoices_cache
      WHERE tenant_id = $1
        AND type = 'ACCREC'
        AND status IN ('PAID','AUTHORISED')
        AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months')::date
      GROUP BY contact_id, DATE_TRUNC('month', date)
    ),
    monthly_buckets AS (
      SELECT
        contact_id,
        jsonb_agg(jsonb_build_object('month', month_key, 'cents', month_cents) ORDER BY month_start) AS buckets
      FROM monthly
      GROUP BY contact_id
    ),
    -- DSO and late % over the last 10 PAID invoices per contact
    paid_ranked AS (
      SELECT
        i.contact_id,
        (i.fully_paid_on_date - i.date)::int AS days_to_pay,
        (i.fully_paid_on_date > i.due_date) AS late,
        ROW_NUMBER() OVER (PARTITION BY i.contact_id
                           ORDER BY i.fully_paid_on_date DESC) AS rn
      FROM xero_invoices_cache i
      WHERE i.tenant_id = $1
        AND i.type = 'ACCREC'
        AND i.status = 'PAID'
        AND i.fully_paid_on_date IS NOT NULL
    ),
    dso AS (
      SELECT
        contact_id,
        AVG(days_to_pay)::numeric(6,2) AS dso_days,
        (COUNT(*) FILTER (WHERE late))::numeric * 100
          / NULLIF(COUNT(*),0)::numeric AS paid_late_pct
      FROM paid_ranked
      WHERE rn <= 10
      GROUP BY contact_id
    ),
    -- Aging buckets across outstanding ACCREC AUTHORISED invoices
    aging AS (
      SELECT
        contact_id,
        SUM(amount_due_cents) AS overdue_or_open_cents,
        SUM(CASE WHEN due_date < CURRENT_DATE THEN amount_due_cents ELSE 0 END) AS overdue_cents,
        COALESCE(MAX(GREATEST(0, (CURRENT_DATE - due_date)::int)), 0) AS oldest_overdue_days,
        jsonb_build_object(
          'current', SUM(CASE WHEN due_date >= CURRENT_DATE THEN amount_due_cents ELSE 0 END),
          '1-30',    SUM(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 1 AND 30 THEN amount_due_cents ELSE 0 END),
          '31-60',   SUM(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 31 AND 60 THEN amount_due_cents ELSE 0 END),
          '61-90',   SUM(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 61 AND 90 THEN amount_due_cents ELSE 0 END),
          '90+',     SUM(CASE WHEN (CURRENT_DATE - due_date) > 90 THEN amount_due_cents ELSE 0 END)
        ) AS buckets
      FROM xero_invoices_cache
      WHERE tenant_id = $1
        AND type = 'ACCREC'
        AND status = 'AUTHORISED'
        AND amount_due_cents > 0
        AND due_date IS NOT NULL
      GROUP BY contact_id
    ),
    ytd_total AS (
      SELECT NULLIF(SUM(ytd_revenue_cents), 0)::numeric AS total FROM per_contact
    ),
    mrr AS (
      SELECT key AS contact_id, value::text::bigint AS mrr_cents
      FROM jsonb_each_text($2::jsonb)
    )
    INSERT INTO xero_customer_rollups (
      tenant_id, contact_id,
      first_invoice_date, last_invoice_date, last_payment_date,
      ltv_cents, ytd_revenue_cents, last_12m_revenue_cents, last_12m_buckets,
      invoice_count, paid_invoice_count, avg_invoice_cents,
      dso_days, paid_late_pct,
      outstanding_cents, overdue_cents, oldest_overdue_days, aging_buckets,
      mrr_cents, has_active_repeating, concentration_pct,
      currency_code, computed_at
    )
    SELECT
      $1,
      pc.contact_id,
      pc.first_invoice_date,
      pc.last_invoice_date,
      pc.last_payment_date,
      COALESCE(pc.ltv_cents, 0),
      COALESCE(pc.ytd_revenue_cents, 0),
      COALESCE(pc.last_12m_revenue_cents, 0),
      COALESCE(mb.buckets, '[]'::jsonb),
      COALESCE(pc.invoice_count, 0),
      COALESCE(pc.paid_invoice_count, 0),
      CASE WHEN COALESCE(pc.paid_invoice_count, 0) > 0
           THEN (pc.ltv_cents / pc.paid_invoice_count)::bigint
           ELSE 0 END,
      d.dso_days,
      d.paid_late_pct,
      COALESCE(pc.outstanding_cents, 0),
      COALESCE(a.overdue_cents, 0),
      COALESCE(a.oldest_overdue_days, 0),
      COALESCE(a.buckets, '{}'::jsonb),
      COALESCE(m.mrr_cents, 0),
      COALESCE(m.mrr_cents, 0) > 0,
      CASE
        WHEN yt.total IS NULL OR yt.total = 0 THEN 0
        ELSE ROUND((pc.ytd_revenue_cents::numeric / yt.total) * 100, 2)
      END,
      pc.currency_code,
      NOW()
    FROM per_contact pc
    LEFT JOIN monthly_buckets mb USING (contact_id)
    LEFT JOIN dso d            USING (contact_id)
    LEFT JOIN aging a          USING (contact_id)
    LEFT JOIN mrr m            USING (contact_id)
    CROSS JOIN ytd_total yt
    ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
      first_invoice_date     = EXCLUDED.first_invoice_date,
      last_invoice_date      = EXCLUDED.last_invoice_date,
      last_payment_date      = EXCLUDED.last_payment_date,
      ltv_cents              = EXCLUDED.ltv_cents,
      ytd_revenue_cents      = EXCLUDED.ytd_revenue_cents,
      last_12m_revenue_cents = EXCLUDED.last_12m_revenue_cents,
      last_12m_buckets       = EXCLUDED.last_12m_buckets,
      invoice_count          = EXCLUDED.invoice_count,
      paid_invoice_count     = EXCLUDED.paid_invoice_count,
      avg_invoice_cents      = EXCLUDED.avg_invoice_cents,
      dso_days               = EXCLUDED.dso_days,
      paid_late_pct          = EXCLUDED.paid_late_pct,
      outstanding_cents      = EXCLUDED.outstanding_cents,
      overdue_cents          = EXCLUDED.overdue_cents,
      oldest_overdue_days    = EXCLUDED.oldest_overdue_days,
      aging_buckets          = EXCLUDED.aging_buckets,
      mrr_cents              = EXCLUDED.mrr_cents,
      has_active_repeating   = EXCLUDED.has_active_repeating,
      concentration_pct      = EXCLUDED.concentration_pct,
      currency_code          = EXCLUDED.currency_code,
      computed_at            = NOW()
  `

  const rows = await query<{ count: string }>(
    `WITH inserted AS (${sql} RETURNING 1) SELECT COUNT(*)::text AS count FROM inserted`,
    [tenantId, JSON.stringify(mrrJson)],
  )
  return Number(rows[0]?.count ?? 0)
}

// ─── Inferred MRR (retainer pattern detection) ───────────────────

/**
 * Detects retainer-style billing that isn't modeled as Xero RepeatingInvoices.
 * Looks at each contact's invoice cadence over the last 6 months and scores:
 *
 *   high   → 5+ active months AND stddev/mean < 0.2 (very steady)
 *   medium → 4+ active months AND stddev/mean < 0.4 (mostly steady)
 *   low    → 3+ active months (some pattern)
 *   none   → fewer than 3 active months
 *
 * `inferred_mrr_cents` = median of monthly totals across active months
 * (median is more robust than mean against an unusual single-month spike).
 *
 * `recurring_basis` rolls up Xero schedules + inferred:
 *   xero_repeating > inferred_high > inferred_medium > inferred_low > none
 */
export async function recomputeInferredMRR(opts: { tenantId: string }): Promise<number> {
  const { tenantId } = opts

  // Single statement: compute inferred values for any contact with activity
  // in the last 6 months, LEFT JOIN onto the rollup row, and let nulls fall
  // back to defaults so contacts with no recent activity get cleanly reset.
  const result = await query<{ contact_id: string }>(
    `
    WITH monthly AS (
      SELECT
        contact_id,
        DATE_TRUNC('month', date)::date AS month_start,
        SUM(total_cents)::bigint AS month_cents
      FROM xero_invoices_cache
      WHERE tenant_id = $1
        AND type = 'ACCREC'
        AND status IN ('PAID','AUTHORISED')
        AND date >= (CURRENT_DATE - INTERVAL '6 months')::date
      GROUP BY contact_id, DATE_TRUNC('month', date)
      HAVING SUM(total_cents) > 0
    ),
    agg AS (
      SELECT
        contact_id,
        COUNT(*)::int AS active_months,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY month_cents) AS median_cents,
        AVG(month_cents)::numeric AS avg_cents,
        STDDEV_POP(month_cents)::numeric AS stddev_cents
      FROM monthly
      GROUP BY contact_id
    ),
    inferred AS (
      SELECT
        contact_id,
        active_months,
        median_cents,
        avg_cents,
        stddev_cents,
        CASE
          WHEN active_months >= 5
               AND avg_cents > 0
               AND (stddev_cents / avg_cents) < 0.2 THEN 'high'
          WHEN active_months >= 4
               AND avg_cents > 0
               AND (stddev_cents / avg_cents) < 0.4 THEN 'medium'
          WHEN active_months >= 3 THEN 'low'
          ELSE 'none'
        END AS confidence
      FROM agg
    )
    UPDATE xero_customer_rollups r SET
      inferred_mrr_cents = CASE
        WHEN i.confidence IS NULL OR i.confidence = 'none' THEN 0
        ELSE COALESCE(i.median_cents, 0)::bigint
      END,
      inferred_mrr_confidence = COALESCE(i.confidence, 'none'),
      inferred_active_months  = COALESCE(i.active_months, 0),
      recurring_basis = CASE
        WHEN r.has_active_repeating         THEN 'xero_repeating'
        WHEN COALESCE(i.confidence, 'none') = 'high'   THEN 'inferred_high'
        WHEN COALESCE(i.confidence, 'none') = 'medium' THEN 'inferred_medium'
        WHEN COALESCE(i.confidence, 'none') = 'low'    THEN 'inferred_low'
        ELSE 'none'
      END
    FROM (SELECT contact_id FROM xero_customer_rollups WHERE tenant_id = $1) ids
    LEFT JOIN inferred i USING (contact_id)
    WHERE r.tenant_id = $1
      AND r.contact_id = ids.contact_id
    RETURNING r.contact_id
    `,
    [tenantId],
  )
  return result.length
}

// ─── Insights (churn risk + forecast) ─────────────────────────────

interface InsightsRow {
  contact_id: string
  last_12m_buckets: Array<{ month: string; cents: number }> | null
  paid_late_pct: string | null
  dso_days: string | null
  payment_terms_days: number | null
  last_invoice_date: string | null
  ltv_cents: string | number | null
  ytd_revenue_cents: string | number | null
  mrr_cents: string | number | null
  has_active_repeating: boolean
  invoice_count: number
}

/**
 * Pure-heuristic churn risk + 12-month forecast computed from rollup data.
 * Runs in the same cron pass as rollups so the score is always paired with
 * the data that produced it. AI summary is generated lazily on read — see
 * `/api/customers/[contactId]/insights`.
 */
export async function recomputeCustomerInsights(opts: { tenantId: string }): Promise<number> {
  const { tenantId } = opts

  const rows = await query<InsightsRow>(
    `SELECT
       r.contact_id,
       r.last_12m_buckets,
       r.paid_late_pct,
       r.dso_days,
       c.payment_terms_days,
       r.last_invoice_date::text AS last_invoice_date,
       r.ltv_cents,
       r.ytd_revenue_cents,
       r.mrr_cents,
       r.has_active_repeating,
       r.invoice_count
     FROM xero_customer_rollups r
     JOIN xero_contacts_cache c
       ON c.tenant_id = r.tenant_id AND c.contact_id = r.contact_id
     WHERE r.tenant_id = $1`,
    [tenantId],
  )

  if (!rows.length) return 0

  type FactorBlock = { score: number; label: string; weight: number }
  type ComputedInsight = {
    contactId: string
    score: number
    band: 'low' | 'moderate' | 'high' | 'critical'
    factors: {
      revenueTrend: FactorBlock
      paymentBehaviour: FactorBlock
      activity: FactorBlock
      mrrDiscount: number
    }
    forecastCents: number
    forecastBasis: 'mrr' | 'trend' | 'hybrid' | 'insufficient' | 'unknown'
  }

  const insights: ComputedInsight[] = rows.map((r) => {
    const buckets = r.last_12m_buckets ?? []
    const recent3 = buckets.slice(-3).reduce((s, b) => s + (Number(b.cents) || 0), 0)
    const prior3  = buckets.slice(-6, -3).reduce((s, b) => s + (Number(b.cents) || 0), 0)

    const lateRate = r.paid_late_pct != null ? Number(r.paid_late_pct) : 0
    const dso = r.dso_days != null ? Number(r.dso_days) : null
    const terms = r.payment_terms_days ?? 30
    const invoiceCount = Number(r.invoice_count) || 0
    const mrrCents = Number(r.mrr_cents) || 0
    const hasRecurring = Boolean(r.has_active_repeating)

    // ── Revenue trend ───────────────────────────────────────────
    let revenueTrendScore = 0
    let revenueTrendLabel = 'stable'
    if (invoiceCount < 3) {
      revenueTrendScore = 0.3
      revenueTrendLabel = 'insufficient history'
    } else if (recent3 === 0 && prior3 > 0) {
      revenueTrendScore = 1.0
      revenueTrendLabel = 'no invoices in 3 months'
    } else if (prior3 === 0 && recent3 > 0) {
      revenueTrendScore = 0
      revenueTrendLabel = 'newly active'
    } else if (prior3 > 0) {
      const ratio = recent3 / prior3
      if (ratio < 0.4)      { revenueTrendScore = 0.85; revenueTrendLabel = `down ${Math.round((1 - ratio) * 100)}% vs prior 3mo` }
      else if (ratio < 0.7) { revenueTrendScore = 0.55; revenueTrendLabel = `down ${Math.round((1 - ratio) * 100)}% vs prior 3mo` }
      else if (ratio < 0.9) { revenueTrendScore = 0.25; revenueTrendLabel = `down ${Math.round((1 - ratio) * 100)}% vs prior 3mo` }
      else if (ratio > 1.1) { revenueTrendScore = 0;    revenueTrendLabel = `up ${Math.round((ratio - 1) * 100)}% vs prior 3mo` }
    }

    // ── Payment behaviour ────────────────────────────────────────
    let paymentScore = 0
    let paymentLabel = 'pays on time'
    if (lateRate >= 70) { paymentScore = 0.8; paymentLabel = `${Math.round(lateRate)}% of invoices paid late` }
    else if (lateRate >= 40) { paymentScore = 0.5; paymentLabel = `${Math.round(lateRate)}% paid late` }
    else if (lateRate >= 20) { paymentScore = 0.25; paymentLabel = `${Math.round(lateRate)}% paid late` }
    else if (dso != null && terms > 0 && dso > terms * 2) {
      paymentScore = 0.5; paymentLabel = `pays in ${Math.round(dso)}d (terms ${terms}d)`
    } else if (dso != null && terms > 0 && dso > terms + 14) {
      paymentScore = 0.25; paymentLabel = `pays ${Math.round(dso - terms)}d past terms`
    }

    // ── Activity gap ────────────────────────────────────────────
    let activityScore = 0
    let activityLabel = 'active'
    if (r.last_invoice_date) {
      const daysSince = Math.floor((Date.now() - new Date(r.last_invoice_date).getTime()) / 86400_000)
      if (daysSince >= 365) { activityScore = 1.0;  activityLabel = `last invoice ${Math.floor(daysSince / 30)}mo ago` }
      else if (daysSince >= 180) { activityScore = 0.7;  activityLabel = `last invoice ${Math.floor(daysSince / 30)}mo ago` }
      else if (daysSince >= 90)  { activityScore = 0.35; activityLabel = `last invoice ${daysSince}d ago` }
      else if (daysSince >= 60)  { activityScore = 0.15; activityLabel = `last invoice ${daysSince}d ago` }
    } else {
      activityScore = 0.5
      activityLabel = 'no invoices on record'
    }

    // ── Composite score ────────────────────────────────────────
    const W = { revenueTrend: 0.45, paymentBehaviour: 0.25, activity: 0.30 }
    const raw = revenueTrendScore * W.revenueTrend
              + paymentScore       * W.paymentBehaviour
              + activityScore      * W.activity
    const mrrDiscount = hasRecurring ? 0.15 : 0
    const final = Math.max(0, Math.min(1, raw - mrrDiscount))
    const score = Math.round(final * 100)
    const band: ComputedInsight['band']
      = score < 25 ? 'low'
      : score < 50 ? 'moderate'
      : score < 75 ? 'high'
      : 'critical'

    // ── 12-month forecast ───────────────────────────────────────
    const trendRatio = prior3 > 0 ? Math.max(0.4, Math.min(2.0, recent3 / prior3)) : 1.0
    // Annualise the recent 3 months (× 4) and apply trend multiplier
    const trendForecastCents = Math.round(recent3 * 4 * trendRatio)
    const mrrAnnualisedCents = mrrCents * 12
    const forecastCents = Math.max(mrrAnnualisedCents, trendForecastCents)

    let forecastBasis: ComputedInsight['forecastBasis'] = 'unknown'
    if (invoiceCount < 3) forecastBasis = 'insufficient'
    else if (mrrAnnualisedCents > 0 && trendForecastCents > 0
             && mrrAnnualisedCents >= trendForecastCents * 0.8
             && trendForecastCents >= mrrAnnualisedCents * 0.8) forecastBasis = 'hybrid'
    else if (mrrAnnualisedCents >= trendForecastCents) forecastBasis = 'mrr'
    else forecastBasis = 'trend'

    return {
      contactId: r.contact_id,
      score,
      band,
      factors: {
        revenueTrend:     { score: revenueTrendScore, label: revenueTrendLabel, weight: W.revenueTrend },
        paymentBehaviour: { score: paymentScore,      label: paymentLabel,      weight: W.paymentBehaviour },
        activity:         { score: activityScore,     label: activityLabel,     weight: W.activity },
        mrrDiscount,
      },
      forecastCents,
      forecastBasis,
    }
  })

  // Bulk upsert via UNNEST — one round-trip regardless of customer count.
  const ids = insights.map(i => i.contactId)
  const scores = insights.map(i => i.score)
  const bands = insights.map(i => i.band)
  const factorsJson = insights.map(i => JSON.stringify(i.factors))
  const forecasts = insights.map(i => i.forecastCents)
  const bases = insights.map(i => i.forecastBasis)

  await execute(
    `INSERT INTO customer_insights
       (tenant_id, contact_id, churn_risk_score, churn_risk_band,
        churn_factors, forecast_12m_cents, forecast_basis, computed_at)
     SELECT $1, t.contact_id, t.score, t.band, t.factors::jsonb, t.forecast, t.basis, NOW()
       FROM UNNEST(
         $2::text[], $3::int[], $4::text[], $5::text[], $6::bigint[], $7::text[]
       ) AS t(contact_id, score, band, factors, forecast, basis)
     ON CONFLICT (tenant_id, contact_id) DO UPDATE SET
       churn_risk_score   = EXCLUDED.churn_risk_score,
       churn_risk_band    = EXCLUDED.churn_risk_band,
       churn_factors      = EXCLUDED.churn_factors,
       forecast_12m_cents = EXCLUDED.forecast_12m_cents,
       forecast_basis     = EXCLUDED.forecast_basis,
       computed_at        = NOW()`,
    [tenantId, ids, scores, bands, factorsJson, forecasts, bases],
  )

  return insights.length
}

// ─── Orchestrator ────────────────────────────────────────────────

/**
 * Full sync: contacts → invoices → repeating → rollups, in that order.
 *
 * Pass `full: true` for the initial backfill or after adding new fields.
 * Default is a delta sync since the last successful run for this tenant
 * (recorded via the synced_at columns) — much cheaper on Xero rate limits
 * once the cache is warm.
 */
export async function fullCustomerSync(opts: {
  tenantId: string
  accessToken: string
  full?: boolean
}): Promise<XeroSyncResult> {
  const { tenantId, accessToken, full = false } = opts
  const start = Date.now()
  const errors: string[] = []
  let contactsUpserted = 0
  let invoicesUpserted = 0
  let rollupsRecomputed = 0
  let mrrContacts = 0

  // For delta sync, find the most-recent synced_at across both caches.
  // Fall back to "30 days ago" if either cache is empty so we're not
  // accidentally trying to sync the entire history every run.
  let modifiedAfter: Date | undefined
  if (!full) {
    const rows = await query<{ last_synced: Date | null }>(
      `SELECT GREATEST(
         (SELECT MAX(synced_at) FROM xero_contacts_cache WHERE tenant_id = $1),
         (SELECT MAX(synced_at) FROM xero_invoices_cache WHERE tenant_id = $1)
       ) AS last_synced`,
      [tenantId],
    )
    const lastSynced = rows[0]?.last_synced
    if (lastSynced) {
      // Re-window by 1 hour to catch records updated mid-run last time.
      modifiedAfter = new Date(new Date(lastSynced).getTime() - 60 * 60 * 1000)
    }
  }

  try {
    contactsUpserted = await syncXeroContactsCache({ tenantId, accessToken, modifiedAfter })
  } catch (e: any) {
    errors.push(`contacts: ${e?.statusMessage ?? e?.message ?? String(e)}`)
  }

  try {
    invoicesUpserted = await syncXeroInvoicesCache({ tenantId, accessToken, modifiedAfter })
  } catch (e: any) {
    errors.push(`invoices: ${e?.statusMessage ?? e?.message ?? String(e)}`)
  }

  let mrrMap = new Map<string, number>()
  try {
    mrrMap = await syncRepeatingInvoiceMRR({ tenantId, accessToken })
    mrrContacts = mrrMap.size
  } catch (e: any) {
    errors.push(`repeating-invoices: ${e?.statusMessage ?? e?.message ?? String(e)}`)
  }

  // Always recompute rollups even if a partial fetch failed — better to
  // have a slightly-stale rollup than a fully-stale one.
  try {
    rollupsRecomputed = await recomputeCustomerRollups({ tenantId, mrrByContact: mrrMap })
  } catch (e: any) {
    errors.push(`rollups: ${e?.statusMessage ?? e?.message ?? String(e)}`)
  }

  // Inferred MRR is a post-pass over the rollup data — keep it in this
  // orchestrator so a fresh sync always lands with both the schedule-based
  // and the cadence-based recurring picture in the same row.
  try {
    await recomputeInferredMRR({ tenantId })
  } catch (e: any) {
    errors.push(`inferred-mrr: ${e?.statusMessage ?? e?.message ?? String(e)}`)
  }

  // Insights are pure derivations from rollup data — even if rollups are
  // slightly stale, the insights table should still reflect what's there.
  let insightsRecomputed = 0
  try {
    insightsRecomputed = await recomputeCustomerInsights({ tenantId })
  } catch (e: any) {
    errors.push(`insights: ${e?.statusMessage ?? e?.message ?? String(e)}`)
  }

  return {
    contactsUpserted,
    invoicesUpserted,
    rollupsRecomputed,
    mrrContacts,
    insightsRecomputed,
    durationMs: Date.now() - start,
    errors,
  }
}
