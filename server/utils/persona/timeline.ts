import { queryRows } from '~~/server/utils/db'
import { isPersonaIdentityEnabled } from '~~/server/utils/persona/feature'

interface ProfileRow {
  id: string
  first_seen_at: string
  last_seen_at: string
}

interface LeadRow {
  profile_id: string
  id: string
  source: string
  source_lead_id: string
  submitted_at: string
  field_data: Record<string, string> | null
  attribution: Record<string, string> | null
}

interface PersonRow {
  profile_id: string
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  lifecycle_stage: string | null
  updated_at: string
}

interface ProductRow {
  profile_id: string
  lead_id: string
  product_id: string | null
  match_method: string
  match_confidence: number
  inquiry_snapshot: Record<string, string> | null
  product: Record<string, unknown> | null
  created_at: string
}

interface EvidenceRow {
  profile_id: string
  id: string
  evidence_type: string
  source: string
  confidence: number
  metadata: Record<string, unknown> | null
  occurred_at: string
}

interface SubmissionRow {
  profile_id: string
  lead_id: string
  page_url: string
  form_id: string | null
  occurred_at: string
  attribution: Record<string, string> | null
}

function textField(fields: Record<string, string> | null, keys: string[]): string | null {
  if (!fields) return null
  return keys.map(key => fields[key]?.trim()).find(Boolean) ?? null
}

export async function listPersonaTimelines(clientId: string) {
  if (!await isPersonaIdentityEnabled(clientId)) {
    return { enabled: false, generatedAt: new Date().toISOString(), personas: [] }
  }

  const profiles = await queryRows<ProfileRow>(
    `SELECT profile.id, profile.first_seen_at, profile.last_seen_at
       FROM crm_identity_profiles profile
      WHERE profile.client_id = $1
        AND EXISTS (
          SELECT 1
            FROM crm_lead_identity_links identity_link
           WHERE identity_link.client_id = profile.client_id
             AND identity_link.profile_id = profile.id
        )
      ORDER BY profile.last_seen_at DESC
      LIMIT 250`,
    [clientId]
  )
  if (!profiles.length) {
    return { enabled: true, generatedAt: new Date().toISOString(), personas: [] }
  }
  const profileIds = profiles.map(profile => profile.id)

  const [leads, people, products, evidence, submissions] = await Promise.all([
    queryRows<LeadRow>(
      `SELECT identity_link.profile_id, lead.id, lead.source, lead.source_lead_id,
              lead.submitted_at, lead.field_data, lead.attribution
         FROM crm_lead_identity_links identity_link
         JOIN leads lead
           ON lead.client_id = identity_link.client_id
          AND lead.id = identity_link.lead_id
          AND lead.deleted_at IS NULL
        WHERE identity_link.client_id = $1
          AND identity_link.profile_id = ANY($2::uuid[])
        ORDER BY lead.submitted_at DESC`,
      [clientId, profileIds]
    ),
    queryRows<PersonRow>(
      `SELECT DISTINCT ON (identity_link.profile_id, person.id)
              identity_link.profile_id, person.id, person.first_name, person.last_name,
              person.email, person.phone, person.mobile, person.lifecycle_stage,
              person.updated_at
         FROM crm_lead_identity_links identity_link
         JOIN lead_crm_links crm_link
           ON crm_link.client_id = identity_link.client_id
          AND crm_link.lead_id = identity_link.lead_id
         JOIN crm_people person
           ON person.client_id = crm_link.client_id
          AND person.id = crm_link.person_id
          AND person.deleted_at IS NULL
        WHERE identity_link.client_id = $1
          AND identity_link.profile_id = ANY($2::uuid[])
        ORDER BY identity_link.profile_id, person.id, person.updated_at DESC`,
      [clientId, profileIds]
    ),
    queryRows<ProductRow>(
      `SELECT identity_link.profile_id, interest.lead_id, interest.product_id,
              interest.match_method, interest.match_confidence,
              interest.inquiry_snapshot, TO_JSONB(product) AS product,
              interest.created_at
         FROM crm_lead_identity_links identity_link
         JOIN crm_lead_product_interests interest
           ON interest.client_id = identity_link.client_id
          AND interest.lead_id = identity_link.lead_id
         LEFT JOIN crm_products product
           ON product.client_id = interest.client_id
          AND product.id = interest.product_id
          AND product.deleted_at IS NULL
        WHERE identity_link.client_id = $1
          AND identity_link.profile_id = ANY($2::uuid[])
        ORDER BY interest.created_at DESC`,
      [clientId, profileIds]
    ),
    queryRows<EvidenceRow>(
      `SELECT id, profile_id, evidence_type, source, confidence, metadata, occurred_at
         FROM crm_identity_evidence
        WHERE client_id = $1
          AND profile_id = ANY($2::uuid[])
        ORDER BY occurred_at DESC`,
      [clientId, profileIds]
    ),
    queryRows<SubmissionRow>(
      `SELECT identity_link.profile_id, identity_link.lead_id,
              intent.page_url, intent.form_id, intent.occurred_at, intent.attribution
         FROM crm_lead_identity_links identity_link
         JOIN lead_submission_intents intent
           ON intent.client_id = identity_link.client_id
          AND intent.matched_lead_id = identity_link.lead_id
        WHERE identity_link.client_id = $1
          AND identity_link.profile_id = ANY($2::uuid[])
        ORDER BY intent.occurred_at DESC`,
      [clientId, profileIds]
    )
  ])

  const personas = profiles.map(profile => {
    const profileLeads = leads.filter(lead => lead.profile_id === profile.id)
    const profilePeople = people.filter(person => person.profile_id === profile.id)
    const latestFields = profileLeads[0]?.field_data ?? null
    const person = profilePeople[0]
    const name = person
      ? [person.first_name, person.last_name].filter(Boolean).join(' ')
      : textField(latestFields, ['full_name', 'name', 'customer_name'])
    const email = person?.email ?? textField(latestFields, ['email', 'email_address'])
    const phone = person?.mobile ?? person?.phone
      ?? textField(latestFields, ['mobile', 'phone_number', 'phone'])
    const profileEvidence = evidence.filter(item => item.profile_id === profile.id)

    return {
      id: profile.id,
      displayName: name || 'Known website visitor',
      email,
      phone,
      firstSeenAt: profile.first_seen_at,
      lastSeenAt: profile.last_seen_at,
      lifecycleStage: person?.lifecycle_stage ?? null,
      hasConflict: profileEvidence.some(item => item.evidence_type === 'identity_conflict'),
      leads: profileLeads.map(lead => ({
        id: lead.id,
        source: lead.source,
        sourceLeadId: lead.source_lead_id,
        submittedAt: lead.submitted_at,
        formName: textField(lead.field_data, ['form_name', 'lead_type']),
        vehicle: [
          textField(lead.field_data, ['vehicle_year']),
          textField(lead.field_data, ['vehicle_make']),
          textField(lead.field_data, ['vehicle_model']),
          textField(lead.field_data, ['vehicle_variant'])
        ].filter(Boolean).join(' ') || null,
        attribution: lead.attribution ?? {}
      })),
      crmPeople: profilePeople.map(item => ({
        id: item.id,
        name: [item.first_name, item.last_name].filter(Boolean).join(' '),
        email: item.email,
        phone: item.mobile ?? item.phone,
        lifecycleStage: item.lifecycle_stage,
        updatedAt: item.updated_at
      })),
      products: products
        .filter(item => item.profile_id === profile.id)
        .map(item => ({
          leadId: item.lead_id,
          productId: item.product_id,
          matchMethod: item.match_method,
          confidence: Number(item.match_confidence),
          snapshot: item.inquiry_snapshot ?? {},
          product: item.product,
          occurredAt: item.created_at
        })),
      submissions: submissions
        .filter(item => item.profile_id === profile.id)
        .map(item => ({
          leadId: item.lead_id,
          pageUrl: item.page_url,
          formId: item.form_id,
          occurredAt: item.occurred_at,
          attribution: item.attribution ?? {}
        })),
      evidence: profileEvidence.map(item => ({
        id: item.id,
        type: item.evidence_type,
        source: item.source,
        confidence: Number(item.confidence),
        metadata: item.metadata ?? {},
        occurredAt: item.occurred_at
      }))
    }
  })

  return { enabled: true, generatedAt: new Date().toISOString(), personas }
}

