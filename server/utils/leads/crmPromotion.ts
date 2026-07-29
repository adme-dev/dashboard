import { transaction as defaultTransaction } from '~~/server/utils/db'

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

type Transaction = <T>(callback: (db: TransactionClient) => Promise<T>) => Promise<T>

interface PromotionLeadRow {
  id: string
  client_id: string | null
  source: string
  source_lead_id: string
  form_id: string | null
  form_name: string | null
  submitted_at: string
  field_data: Record<string, string> | null
  attribution: Record<string, string> | null
  assigned_to: string | null
  is_test: boolean
  deleted_at: string | null
}

interface PersonRow {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
}

interface ExistingLinkRow {
  id: string
  person_id: string | null
  opportunity_id: string | null
}

export type CrmLeadPromotionResult
  = | { status: 'promoted', personId: string, opportunityId: string, linkId: string, personCreated: boolean }
    | { status: 'already_promoted', personId: string | null, opportunityId: string | null, linkId: string }
    | { status: 'identity_conflict', candidateCount: number }
    | { status: 'insufficient_identity', missing: Array<'name' | 'email_or_phone'> }
    | { status: 'skipped_test' }
    | { status: 'lead_not_found' }
    | { status: 'client_not_mapped' }
    | { status: 'stage_not_found' }

export interface CrmLeadPromotionServiceDeps {
  transaction: Transaction
}

interface CustomerIdentity {
  firstName: string
  lastName: string | null
  fullName: string
  email: string | null
  mobile: string | null
  phoneVariants: string[]
}

function textField(fields: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key]?.trim()
    if (value) return value
  }
  return null
}

function splitName(fullName: string): { firstName: string, lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null
  }
}

function normalizeEmail(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

export function normalizeCrmPhone(value: string | null): string | null {
  if (!value) return null
  let digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0') && digits.length >= 9) digits = `61${digits.slice(1)}`
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

function phoneVariants(mobile: string | null): string[] {
  if (!mobile) return []
  const digits = mobile.replace(/\D/g, '')
  const variants = new Set([digits])
  if (digits.startsWith('61') && digits.length > 2) variants.add(`0${digits.slice(2)}`)
  return [...variants]
}

export function extractCrmCustomerIdentity(
  fields: Record<string, string>
): { identity: CustomerIdentity | null, missing: Array<'name' | 'email_or_phone'> } {
  const fullNameField = textField(fields, 'full_name', 'name', 'customer_name')
  const split = fullNameField ? splitName(fullNameField) : { firstName: '', lastName: null }
  const firstName = textField(fields, 'first_name', 'given_name') ?? split.firstName
  const lastName = textField(fields, 'last_name', 'family_name') ?? split.lastName
  const email = normalizeEmail(textField(fields, 'email', 'email_address', 'work_email'))
  const mobile = normalizeCrmPhone(textField(
    fields,
    'mobile',
    'mobile_number',
    'phone_number',
    'phone',
    'work_phone'
  ))
  const missing: Array<'name' | 'email_or_phone'> = []
  if (!firstName) missing.push('name')
  if (!email && !mobile) missing.push('email_or_phone')
  if (missing.length) return { identity: null, missing }

  return {
    identity: {
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      email,
      mobile,
      phoneVariants: phoneVariants(mobile)
    },
    missing: []
  }
}

function numericPrice(value: string | null): number {
  if (!value) return 0
  const parsed = Number(value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

interface CrmSourceCopy {
  provider: string
  personActivityTitle: string
  opportunityActivityTitle: string
  opportunityFallback: string
}

const EMAIL_PROVIDER_LABELS: Record<string, string> = {
  carsales: 'Carsales',
  autotrader: 'Autotrader',
  carsguide: 'CarsGuide',
  drive: 'Drive',
  gumtree: 'Gumtree',
  podium: 'Podium',
  google: 'Google',
  meta: 'Meta'
}

export function crmSourceCopy(lead: Pick<PromotionLeadRow, 'source' | 'field_data'>): CrmSourceCopy {
  const providerKey = textField(lead.field_data ?? {}, 'lead_provider')?.toLowerCase() ?? ''
  if (lead.source !== 'email') {
    if (lead.source === 'google' || lead.source === 'meta') {
      const label = lead.source === 'google' ? 'Google' : 'Meta'
      return {
        provider: lead.source,
        personActivityTitle: `${label} lead received`,
        opportunityActivityTitle: `Created from ${label} lead`,
        opportunityFallback: `${label} enquiry`
      }
    }
    if (lead.source === 'manual') {
      return {
        provider: 'manual',
        personActivityTitle: 'Manual lead created',
        opportunityActivityTitle: 'Created from manual lead',
        opportunityFallback: 'Manual enquiry'
      }
    }
    if (lead.source === 'csv') {
      return {
        provider: 'csv',
        personActivityTitle: 'Imported lead received',
        opportunityActivityTitle: 'Created from imported lead',
        opportunityFallback: 'Imported enquiry'
      }
    }
    if (providerKey === 'podium') {
      return {
        provider: 'podium',
        personActivityTitle: 'Podium lead received',
        opportunityActivityTitle: 'Created from Podium lead',
        opportunityFallback: 'Podium enquiry'
      }
    }
    return {
      provider: ['dealer_studio', 'generic', 'website'].includes(providerKey) ? providerKey : 'webhook',
      personActivityTitle: 'Website lead received',
      opportunityActivityTitle: 'Created from website lead',
      opportunityFallback: 'Website enquiry'
    }
  }

  if (providerKey === 'website') {
    return {
      provider: 'website',
      personActivityTitle: 'Website lead received',
      opportunityActivityTitle: 'Created from website lead',
      opportunityFallback: 'Website enquiry'
    }
  }
  const label = EMAIL_PROVIDER_LABELS[providerKey]
  return {
    provider: label ? providerKey : 'email',
    personActivityTitle: label ? `${label} email lead received` : 'Email lead received',
    opportunityActivityTitle: label ? `Created from ${label} email lead` : 'Created from email lead',
    opportunityFallback: label ? `${label} email enquiry` : 'Email enquiry'
  }
}

function opportunityName(fields: Record<string, string>, fullName: string, fallback: string): string {
  const vehicle = [
    textField(fields, 'vehicle_year'),
    textField(fields, 'vehicle_make'),
    textField(fields, 'vehicle_model'),
    textField(fields, 'vehicle_variant')
  ].filter(Boolean).join(' ')
  return `${vehicle || fallback} — ${fullName}`.slice(0, 500)
}

function opportunityFields(lead: PromotionLeadRow, provider: string): Record<string, string> {
  const fields = lead.field_data ?? {}
  const result: Record<string, string> = {
    lead_id: lead.id,
    source_lead_id: lead.source_lead_id,
    lead_provider: provider
  }
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('vehicle_') && value) result[key] = value
  }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const value = lead.attribution?.[key]?.trim()
    if (value) result[key] = value
  }
  return result
}

export function createCrmLeadPromotionService(
  deps: CrmLeadPromotionServiceDeps = { transaction: defaultTransaction as unknown as Transaction }
) {
  return {
    async promote(leadId: string): Promise<CrmLeadPromotionResult> {
      return deps.transaction(async (db) => {
        const leadResult = await db.query(
          `SELECT id, client_id, source, source_lead_id, form_id, form_name,
                  submitted_at, field_data, attribution, assigned_to, is_test, deleted_at
             FROM leads
            WHERE id = $1 AND deleted_at IS NULL
            FOR UPDATE`,
          [leadId]
        )
        const lead = leadResult.rows?.[0] as PromotionLeadRow | undefined
        if (!lead) return { status: 'lead_not_found' }
        if (!lead.client_id) return { status: 'client_not_mapped' }
        if (lead.is_test) return { status: 'skipped_test' }

        const linkResult = await db.query(
          `SELECT id, person_id, opportunity_id
             FROM lead_crm_links
            WHERE client_id = $1 AND lead_id = $2
            LIMIT 1`,
          [lead.client_id, lead.id]
        )
        const existingLink = linkResult.rows?.[0] as ExistingLinkRow | undefined
        if (existingLink) {
          return {
            status: 'already_promoted',
            personId: existingLink.person_id,
            opportunityId: existingLink.opportunity_id,
            linkId: existingLink.id
          }
        }

        const extracted = extractCrmCustomerIdentity(lead.field_data ?? {})
        if (!extracted.identity) {
          return { status: 'insufficient_identity', missing: extracted.missing }
        }
        const identity = extracted.identity
        const sourceCopy = crmSourceCopy(lead)

        const stageResult = await db.query(
          `SELECT id, probability
             FROM crm_stages
            WHERE code = 'new'
              AND is_active = TRUE
              AND (client_id = $1 OR client_id IS NULL)
            ORDER BY (client_id = $1) DESC
            LIMIT 1`,
          [lead.client_id]
        )
        const stage = stageResult.rows?.[0] as { id: string, probability: number } | undefined
        if (!stage) return { status: 'stage_not_found' }

        const personResult = await db.query(
          `SELECT id, first_name, last_name, email, phone, mobile
             FROM crm_people
            WHERE client_id = $1
              AND deleted_at IS NULL
              AND (
                ($2::text IS NOT NULL AND lower(trim(email)) = $2)
                OR
                (cardinality($3::text[]) > 0 AND
                 regexp_replace(COALESCE(NULLIF(mobile, ''), phone, ''), '[^0-9]', '', 'g') = ANY($3::text[]))
              )
            FOR UPDATE`,
          [lead.client_id, identity.email, identity.phoneVariants]
        )
        const people = (personResult.rows ?? []) as PersonRow[]
        const uniquePeople = [...new Map(people.map(person => [person.id, person])).values()]
        if (uniquePeople.length > 1) {
          return { status: 'identity_conflict', candidateCount: uniquePeople.length }
        }

        let personId: string
        let personCreated = false
        const existingPerson = uniquePeople[0]
        if (existingPerson) {
          personId = existingPerson.id
          await db.query(
            `UPDATE crm_people
                SET first_name = COALESCE(NULLIF(BTRIM(first_name), ''), $3),
                    last_name = COALESCE(NULLIF(BTRIM(last_name), ''), $4),
                    email = COALESCE(NULLIF(BTRIM(email), ''), $5),
                    mobile = COALESCE(NULLIF(BTRIM(mobile), ''), $6),
                    assigned_to = COALESCE(assigned_to, $7),
                    lifecycle_stage = COALESCE(lifecycle_stage, 'lead'),
                    updated_at = NOW()
              WHERE client_id = $1 AND id = $2 AND deleted_at IS NULL
              RETURNING id`,
            [
              lead.client_id,
              personId,
              identity.firstName,
              identity.lastName,
              identity.email,
              identity.mobile,
              lead.assigned_to
            ]
          )
        } else {
          const inserted = await db.query(
            `INSERT INTO crm_people (
               client_id, first_name, last_name, email, mobile,
               lifecycle_stage, assigned_to, custom_fields
             ) VALUES ($1, $2, $3, $4, $5, 'lead', $6, $7::jsonb)
             RETURNING id`,
            [
              lead.client_id,
              identity.firstName,
              identity.lastName,
              identity.email,
              identity.mobile,
              lead.assigned_to,
              JSON.stringify({ first_lead_id: lead.id, lead_provider: sourceCopy.provider })
            ]
          )
          personId = (inserted.rows?.[0] as { id: string }).id
          personCreated = true
        }

        const provider = sourceCopy.provider
        const opportunityResult = await db.query(
          `INSERT INTO crm_opportunities (
             client_id, name, person_id, stage_id, owner_id, assigned_to,
             amount, probability, status, source, custom_fields
           ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 'open', $8, $9::jsonb)
           RETURNING id`,
          [
            lead.client_id,
            opportunityName(lead.field_data ?? {}, identity.fullName, sourceCopy.opportunityFallback),
            personId,
            stage.id,
            lead.assigned_to,
            numericPrice(textField(lead.field_data ?? {}, 'vehicle_price')),
            stage.probability,
            provider,
            JSON.stringify(opportunityFields(lead, provider))
          ]
        )
        const opportunityId = (opportunityResult.rows?.[0] as { id: string }).id

        const linkResultInsert = await db.query(
          `INSERT INTO lead_crm_links (
             client_id, lead_id, person_id, opportunity_id,
             link_method, source_system, source_reference, linked_by
           ) VALUES ($1, $2, $3, $4, 'source_id', $5, $6, 'system:crm_lead_promotion')
           RETURNING id`,
          [lead.client_id, lead.id, personId, opportunityId, provider, lead.source_lead_id]
        )
        const linkId = (linkResultInsert.rows?.[0] as { id: string }).id

        const activityMetadata = JSON.stringify({
          lead_id: lead.id,
          source_lead_id: lead.source_lead_id,
          provider,
          form_id: lead.form_id,
          vehicle_stock_number: textField(lead.field_data ?? {}, 'vehicle_stock_number')
        })
        await db.query(
          `INSERT INTO crm_activities (
             client_id, target_type, target_id, type, title, metadata
           ) VALUES ($1, 'person', $2, 'system', $3, $4::jsonb)`,
          [lead.client_id, personId, sourceCopy.personActivityTitle, activityMetadata]
        )
        await db.query(
          `INSERT INTO crm_activities (
             client_id, target_type, target_id, type, title, metadata
           ) VALUES ($1, 'opportunity', $2, 'system', $3, $4::jsonb)`,
          [lead.client_id, opportunityId, sourceCopy.opportunityActivityTitle, activityMetadata]
        )

        return {
          status: 'promoted',
          personId,
          opportunityId,
          linkId,
          personCreated
        }
      })
    }
  }
}

export const crmLeadPromotionService = createCrmLeadPromotionService()
