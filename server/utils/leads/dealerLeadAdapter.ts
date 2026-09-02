import { z } from 'zod'

const PrimitiveField = z.union([
  z.string().max(4096),
  z.number().finite(),
  z.boolean()
])

const FieldMap = z.record(
  z.string().trim().min(1).max(128),
  PrimitiveField
).refine(fields => Object.keys(fields).length <= 100, 'too_many_fields')

const AttributionMap = z.record(
  z.string().trim().min(1).max(128),
  z.string().max(512)
).refine(attribution => Object.keys(attribution).length <= 80, 'too_many_attribution_fields')

const Customer = z.object({
  first_name: z.string().trim().min(1).max(200).optional(),
  last_name: z.string().trim().min(1).max(200).optional(),
  full_name: z.string().trim().min(1).max(500).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(3).max(64).optional(),
  mobile: z.string().trim().min(3).max(64).optional()
}).optional()

const Vehicle = z.object({
  stock_number: z.string().trim().min(1).max(128).optional(),
  vin: z.string().trim().min(1).max(64).optional(),
  year: z.union([z.string().trim().max(8), z.number().int().min(1886).max(2200)]).optional(),
  make: z.string().trim().min(1).max(128).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  variant: z.string().trim().min(1).max(256).optional(),
  condition: z.string().trim().min(1).max(64).optional(),
  price: z.union([z.string().trim().max(64), z.number().finite().nonnegative()]).optional(),
  url: z.string().trim().url().max(2048).optional()
}).optional()

export const CanonicalEnquiryTypeSchema = z.enum([
  'stock', 'finance', 'test_drive', 'contact', 'model_variant', 'service_booking'
])

export type CanonicalEnquiryType = z.infer<typeof CanonicalEnquiryTypeSchema>

const DEALER_STUDIO_PROVIDER_ALIASES = new Set([
  'dealer_studio',
  'dealerstudio',
  'dealerstudio.test'
])

const LEGACY_DEALER_FORM_ALIASES: Readonly<Record<string, CanonicalEnquiryType>> = {
  'knox-finance-enquiry': 'finance',
  'finance-enquiry': 'finance',
  'knox-contact-enquiry': 'contact',
  'contact-enquiry': 'contact',
  'contact-us': 'contact',
  'knox-vehicle-enquiry': 'stock',
  'vehicle-enquiry': 'stock',
  'stock-enquiry': 'stock',
  'knox-test-drive': 'test_drive',
  'test-drive': 'test_drive',
  'model-variant-enquiry': 'model_variant',
  'service-booking': 'service_booking'
}

function legacyDealerAlias(value: string | null | undefined): CanonicalEnquiryType | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return LEGACY_DEALER_FORM_ALIASES[normalized] ?? null
}

/**
 * Classifies the authenticated legacy Dealer Studio webhook without guessing.
 * An explicit canonical type has authority. Lower-authority form aliases must
 * agree, otherwise the conversion is deliberately left untyped so the outbox
 * records a paused event rather than falling back to lead_created or fanning
 * out to several provider actions.
 */
export function classifyLegacyDealerLeadConversion(input: {
  provider: string
  formId: string | null
  formName: string | null
  fieldData: Record<string, string>
}) {
  if (!DEALER_STUDIO_PROVIDER_ALIASES.has(input.provider.trim().toLowerCase())) {
    return { status: 'not_dealer_studio' as const }
  }

  const explicit = input.fieldData.enquiry_type?.trim()
  if (explicit) {
    const parsed = CanonicalEnquiryTypeSchema.safeParse(explicit.toLowerCase())
    if (!parsed.success) {
      return {
        status: 'configuration_required' as const,
        canonicalEventName: 'web_conversion' as const,
        enquiryType: null,
        reason: 'invalid_explicit_enquiry_type' as const
      }
    }
    return {
      status: 'mapped' as const,
      canonicalEventName: 'web_conversion' as const,
      enquiryType: parsed.data,
      matchedBy: 'explicit_enquiry_type' as const
    }
  }

  const candidates = [
    legacyDealerAlias(input.fieldData.provider_form_type),
    legacyDealerAlias(input.formId),
    legacyDealerAlias(input.formName)
  ].filter((value): value is CanonicalEnquiryType => value !== null)
  const identities = new Set(candidates)
  if (identities.size === 1) {
    return {
      status: 'mapped' as const,
      canonicalEventName: 'web_conversion' as const,
      enquiryType: candidates[0]!,
      matchedBy: 'bounded_form_alias' as const
    }
  }
  return {
    status: 'configuration_required' as const,
    canonicalEventName: 'web_conversion' as const,
    enquiryType: null,
    reason: identities.size > 1 ? 'conflicting_aliases' as const : 'unknown_enquiry_type' as const
  }
}

const DEALER_MEASUREMENT_EVENTS = {
  stock_enquiry: { canonicalEventName: 'web_conversion', enquiryType: 'stock' },
  model_variant_enquiry: { canonicalEventName: 'web_conversion', enquiryType: 'model_variant' },
  finance_enquiry: { canonicalEventName: 'web_conversion', enquiryType: 'finance' },
  test_drive_enquiry: { canonicalEventName: 'web_conversion', enquiryType: 'test_drive' },
  contact_us: { canonicalEventName: 'web_conversion', enquiryType: 'contact' },
  service_booking: { canonicalEventName: 'web_conversion', enquiryType: 'service_booking' },
  phone_click: { canonicalEventName: 'phone_click', enquiryType: null },
  directions_click: { canonicalEventName: 'directions_click', enquiryType: null }
} as const

export function normalizeDealerMeasurementEvent(dealerEvent: string) {
  const normalized = dealerEvent.trim().toLowerCase()
  const identity = DEALER_MEASUREMENT_EVENTS[normalized as keyof typeof DEALER_MEASUREMENT_EVENTS]
  if (!identity) return { status: 'configuration_required' as const, dealerEvent }
  return { status: 'mapped' as const, dealerEvent, ...identity }
}

export const LeadSubmittedV1Schema = z.object({
  type: z.literal('lead.submitted.v1'),
  id: z.string().trim().min(1).max(255),
  occurredAt: z.string().datetime({ offset: true }),
  provider: z.string().trim().min(1).max(100)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  source: z.enum(['webhook', 'meta', 'google', 'email', 'manual', 'csv']),
  clientReference: z.string().trim().min(1).max(255).optional(),
  enquiryType: CanonicalEnquiryTypeSchema.optional(),
  form: z.object({
    id: z.string().trim().min(1).max(255).optional(),
    name: z.string().trim().min(1).max(500).optional(),
    providerType: z.string().trim().min(1).max(255).optional()
  }).optional(),
  customer: z.object({
    firstName: z.string().trim().min(1).max(200).optional(),
    lastName: z.string().trim().min(1).max(200).optional(),
    fullName: z.string().trim().min(1).max(500).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().min(3).max(64).optional()
  }).optional(),
  vehicle: z.object({
    stockNumber: z.string().trim().min(1).max(128).optional(),
    vin: z.string().trim().min(1).max(64).optional(),
    year: z.union([z.string().trim().max(8), z.number().int().min(1886).max(2200)]).optional(),
    make: z.string().trim().min(1).max(128).optional(),
    model: z.string().trim().min(1).max(128).optional(),
    variant: z.string().trim().min(1).max(256).optional(),
    condition: z.string().trim().min(1).max(64).optional(),
    price: z.union([z.string().trim().max(64), z.number().finite().nonnegative()]).optional(),
    url: z.string().trim().url().max(2048).optional()
  }).optional(),
  fields: FieldMap.default({}),
  attribution: AttributionMap.optional(),
  consentDecision: z.enum(['granted', 'denied', 'unknown']).default('unknown'),
  test: z.discriminatedUnion('isTest', [
    z.object({ isTest: z.literal(true), runId: z.string().uuid() }),
    z.object({ isTest: z.literal(false) })
  ]).default({ isTest: false })
})

export type LeadSubmittedV1 = z.infer<typeof LeadSubmittedV1Schema>

/**
 * Versioned, provider-neutral envelope accepted by the authenticated website
 * webhook. Existing fields-only callers remain valid; new integrations should
 * prefer the first-class customer and vehicle objects.
 */
export const DealerLeadWebhookBodySchema = z.object({
  key: z.string().min(1).max(512),
  schema_version: z.literal(1).default(1),
  provider: z.string().trim().min(1).max(100)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
    .default('generic'),
  lead_id: z.string().trim().min(1).max(255).optional(),
  form_id: z.string().trim().max(255).optional(),
  form_name: z.string().trim().max(500).optional(),
  source: z.enum(['webhook', 'meta', 'manual', 'csv', 'google']).default('webhook'),
  customer: Customer,
  vehicle: Vehicle,
  fields: FieldMap.default({}),
  attribution: AttributionMap.optional(),
  consent_decision: z.enum(['granted', 'denied', 'unknown']).default('unknown'),
  submitted_at: z.string().datetime({ offset: true }).optional(),
  is_test: z.boolean().default(false),
  promote_to_crm: z.boolean().default(true)
})

export type DealerLeadWebhookBody = z.infer<typeof DealerLeadWebhookBodySchema>

function canonicalKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

const CAMPAIGN_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'li_fat_id',
  'xf_qr',
  'xf_qr_variant',
  'campaign_id',
  'adgroup_id',
  'ad_group_id',
  'asset_group_id',
  'adset_id',
  'ad_set_id',
  'ad_id',
  'creative_id'
] as const

const TOUCH_KEYS = [
  ...CAMPAIGN_QUERY_KEYS,
  'landing_page',
  'referrer'
] as const

function enrichAttribution(
  input: Record<string, string> | undefined,
  fieldData: Record<string, string>
): Record<string, string> | null {
  const result: Record<string, string> = { ...(input ?? {}) }
  const browserEventId = result.browserEventId
    || fieldData.zeroflow_browser_event_id
    || fieldData.browser_event_id
    || fieldData.event_id
  if (browserEventId) result.browserEventId = browserEventId
  const anonId = result.anonId || fieldData.zeroflow_anon_id || fieldData.anon_id
  const sessionId = result.sessionId || fieldData.zeroflow_session_id || fieldData.session_id
  if (anonId) result.anonId = anonId.slice(0, 512)
  if (sessionId) result.sessionId = sessionId.slice(0, 512)

  for (const touch of ['first', 'last'] as const) {
    for (const key of TOUCH_KEYS) {
      const value = fieldData[`zeroflow_${touch}_${key}`]?.trim()
      if (value && !result[`${touch}_${key}`]) {
        result[`${touch}_${key}`] = value.slice(0, 512)
      }
    }
  }

  const urlCandidates = [
    result.landing_page,
    fieldData.landing_page,
    fieldData.zeroflow_landing_page,
    fieldData.page_url,
    fieldData.vehicle_url,
    result.first_referrer,
    fieldData.zeroflow_first_referrer
  ].filter((value): value is string => Boolean(value))

  for (const value of urlCandidates) {
    try {
      const url = new URL(value)
      for (const key of CAMPAIGN_QUERY_KEYS) {
        const candidate = url.searchParams.get(key)?.trim()
        if (candidate && !result[key]) result[key] = candidate.slice(0, 512)
      }
    } catch {
      // Optional provider metadata must never reject an otherwise valid lead.
    }
  }

  for (const key of CAMPAIGN_QUERY_KEYS) {
    const candidate = fieldData[key]?.trim() || fieldData[`zeroflow_${key}`]?.trim()
    if (candidate && !result[key]) result[key] = candidate.slice(0, 512)
  }

  if (!result.landing_page && fieldData.zeroflow_landing_page) {
    result.landing_page = fieldData.zeroflow_landing_page.slice(0, 512)
  }
  if (!result.first_referrer && fieldData.zeroflow_first_referrer) {
    result.first_referrer = fieldData.zeroflow_first_referrer.slice(0, 512)
  }
  if (!result.first_landing_page && result.landing_page) {
    result.first_landing_page = result.landing_page
  }
  if (!result.last_landing_page && result.landing_page) {
    result.last_landing_page = result.landing_page
  }
  if (!result.last_referrer && fieldData.zeroflow_last_referrer) {
    result.last_referrer = fieldData.zeroflow_last_referrer.slice(0, 512)
  }

  for (const key of CAMPAIGN_QUERY_KEYS) {
    const lastValue = result[`last_${key}`]
    const firstValue = result[`first_${key}`]
    const touchValue = lastValue || firstValue
    if (!result[key] && touchValue) result[key] = touchValue
  }

  return Object.keys(result).length ? result : null
}

function assignField(target: Record<string, string>, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return
  target[key] = String(value).trim()
}

function splitFullName(fullName: string): { firstName: string, lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? fullName.trim(),
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined
  }
}

export interface NormalizedDealerLeadWebhookBody {
  provider: string
  sourceLeadId?: string
  formId: string | null
  formName: string | null
  fieldData: Record<string, string>
  attribution: Record<string, string> | null
  consentDecision: 'granted' | 'denied' | 'unknown'
  submittedAt?: string
  isTest: boolean
  promoteToCrm: boolean
  submittedKey: string
  requestedSource: DealerLeadWebhookBody['source']
}

export function normalizeDealerLeadWebhookBody(
  input: DealerLeadWebhookBody
): NormalizedDealerLeadWebhookBody {
  const fieldData: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.fields)) {
    const normalizedKey = canonicalKey(key)
    if (normalizedKey) assignField(fieldData, normalizedKey, value)
  }

  const customer = input.customer
  if (customer) {
    let firstName = customer.first_name
    let lastName = customer.last_name
    if (customer.full_name && !firstName) {
      const split = splitFullName(customer.full_name)
      firstName = split.firstName
      lastName = lastName ?? split.lastName
    }
    assignField(fieldData, 'first_name', firstName)
    assignField(fieldData, 'last_name', lastName)
    assignField(
      fieldData,
      'full_name',
      customer.full_name ?? [firstName, lastName].filter(Boolean).join(' ')
    )
    assignField(fieldData, 'email', customer.email)
    assignField(fieldData, 'phone_number', customer.mobile ?? customer.phone)
  }

  const vehicle = input.vehicle
  if (vehicle) {
    assignField(fieldData, 'vehicle_stock_number', vehicle.stock_number)
    assignField(fieldData, 'vehicle_vin', vehicle.vin)
    assignField(fieldData, 'vehicle_year', vehicle.year)
    assignField(fieldData, 'vehicle_make', vehicle.make)
    assignField(fieldData, 'vehicle_model', vehicle.model)
    assignField(fieldData, 'vehicle_variant', vehicle.variant)
    assignField(fieldData, 'vehicle_condition', vehicle.condition)
    assignField(fieldData, 'vehicle_price', vehicle.price)
    assignField(fieldData, 'vehicle_url', vehicle.url)
  }

  // Provider is server-validated metadata, so it wins over an arbitrary field.
  fieldData.lead_provider = input.provider
  const attribution = enrichAttribution(input.attribution, fieldData)

  return {
    provider: input.provider,
    sourceLeadId: input.lead_id,
    formId: input.form_id ?? null,
    formName: input.form_name ?? null,
    fieldData,
    attribution,
    consentDecision: input.consent_decision,
    submittedAt: input.submitted_at,
    isTest: input.is_test,
    promoteToCrm: input.promote_to_crm,
    submittedKey: input.key,
    requestedSource: input.source
  }
}

export function normalizeLeadSubmittedV1(input: LeadSubmittedV1): NormalizedDealerLeadWebhookBody & {
  enquiryType: CanonicalEnquiryType | null
  testRunId: string | null
} {
  return {
    ...normalizeDealerLeadWebhookBody({
      key: 'standard-webhook',
      schema_version: 1,
      provider: input.provider,
      lead_id: input.clientReference ?? input.id,
      form_id: input.form?.id,
      form_name: input.form?.name,
      source: input.source === 'email' ? 'webhook' : input.source,
      customer: input.customer
        ? {
            first_name: input.customer.firstName,
            last_name: input.customer.lastName,
            full_name: input.customer.fullName,
            email: input.customer.email,
            phone: input.customer.phone
          }
        : undefined,
      vehicle: input.vehicle
        ? {
            stock_number: input.vehicle.stockNumber,
            vin: input.vehicle.vin,
            year: input.vehicle.year,
            make: input.vehicle.make,
            model: input.vehicle.model,
            variant: input.vehicle.variant,
            condition: input.vehicle.condition,
            price: input.vehicle.price,
            url: input.vehicle.url
          }
        : undefined,
      fields: {
        ...input.fields,
        ...(input.form?.providerType ? { provider_form_type: input.form.providerType } : {}),
        ...(input.enquiryType ? { enquiry_type: input.enquiryType } : {})
      },
      attribution: input.attribution,
      consent_decision: input.consentDecision,
      submitted_at: input.occurredAt,
      is_test: input.test.isTest,
      promote_to_crm: true
    }),
    enquiryType: input.enquiryType ?? null,
    testRunId: input.test.isTest ? input.test.runId : null
  }
}
