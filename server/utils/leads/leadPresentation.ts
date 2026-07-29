const PII_KEYS = new Set([
  'name',
  'first_name',
  'last_name',
  'full_name',
  'email',
  'email_address',
  'phone',
  'phone_number',
  'mobile',
  'mobile_number',
  'address',
  'street_address',
  'postcode',
  'postal_code'
])

const MAX_DEPTH = 5
const MAX_ITEMS = 100
const MAX_TEXT = 500

function normalizedKey(key: string): string {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s.-]+/g, '_')
}

function isPiiKey(key: string): boolean {
  const normalized = normalizedKey(key)
  if (PII_KEYS.has(normalized)) return true
  const tokens = normalized.split('_')
  return tokens.some(token => ['name', 'email', 'phone', 'mobile', 'address', 'postcode'].includes(token))
}

function redactValueShape(value: unknown, depth: number): unknown {
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return '[redacted]'
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map(item => redactValueShape(item, depth + 1))
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_ITEMS)
      .map(([key, item]) => [key, redactValueShape(item, depth + 1)])
  )
}

export function redactLeadFieldSample(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (typeof value === 'string') return value.slice(0, MAX_TEXT)
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map(item => redactLeadFieldSample(item, depth + 1))
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_ITEMS)
      .map(([key, item]) => [
        key,
        isPiiKey(key)
          ? redactValueShape(item, depth + 1)
          : redactLeadFieldSample(item, depth + 1)
      ])
  )
}

export function redactLeadFieldSampleValue(value: unknown, fieldKey: string): string {
  if (isPiiKey(fieldKey)) return '[redacted]'
  if (typeof value !== 'string') return JSON.stringify(redactLeadFieldSample(value))
  const trimmed = value.trim()
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length <= 10_000) {
    try {
      return JSON.stringify(redactLeadFieldSample(JSON.parse(trimmed)))
    } catch {
      // A plain sample that happens to start with punctuation is still safe to bound.
    }
  }
  return value.slice(0, MAX_TEXT)
}

export function safeEmailLeadPresentationSelect(
  leadAlias = 'l',
  duplicateConstraint = 'TRUE'
): string {
  return `
    (
      SELECT CASE lower(lei.provider)
        WHEN 'carsales' THEN 'carsales'
        WHEN 'autotrader' THEN 'autotrader'
        WHEN 'carsguide' THEN 'carsguide'
        WHEN 'drive' THEN 'drive'
        WHEN 'gumtree' THEN 'gumtree'
        WHEN 'podium' THEN 'podium'
        WHEN 'google' THEN 'google'
        WHEN 'meta' THEN 'meta'
        WHEN 'website' THEN 'website'
        ELSE 'email'
      END
      FROM lead_email_ingestions lei
      WHERE lei.lead_id = ${leadAlias}.id AND lei.client_id = ${leadAlias}.client_id
      ORDER BY lei.created_at DESC
      LIMIT 1
    ) AS email_provider,
    (
      SELECT ep.label
      FROM lead_email_ingestions lei
      JOIN lead_email_endpoints ep
        ON ep.id = lei.endpoint_id AND ep.client_id = ${leadAlias}.client_id
      WHERE lei.lead_id = ${leadAlias}.id AND lei.client_id = ${leadAlias}.client_id
      ORDER BY lei.created_at DESC
      LIMIT 1
    ) AS email_endpoint_label,
    (
      SELECT duplicate_lead.id
      FROM lead_email_ingestions lei
      JOIN leads duplicate_lead
       ON duplicate_lead.id = lei.possible_duplicate_of_lead_id
       AND duplicate_lead.client_id = ${leadAlias}.client_id
       AND duplicate_lead.deleted_at IS NULL
       AND (${duplicateConstraint})
      WHERE lei.lead_id = ${leadAlias}.id AND lei.client_id = ${leadAlias}.client_id
      ORDER BY lei.created_at DESC
      LIMIT 1
    ) AS possible_duplicate_lead_id
  `
}
