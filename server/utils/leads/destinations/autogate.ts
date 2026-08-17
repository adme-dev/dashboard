import { isIP } from 'node:net'
import { registerAdapter } from './registry'
import type { DestinationAdapter, DispatchResult, Lead } from './types'

const AUTOGATE_BASE_URL = 'https://lead-api.carsalesnetwork.com.au'
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

type AutoGateApiVersion = 'v2' | 'v3'

interface AutoGateConfig {
  sellerIdentifier: string
  service?: string
  leadType?: string
  siteOrigin: string
  pageSource?: string
  sourceDevice?: string
  ipAddress: string
  tags?: string[]
}

function apiVersion(): AutoGateApiVersion {
  return process.env.AUTOGATE_LEAD_API_VERSION?.toLowerCase() === 'v3' ? 'v3' : 'v2'
}

function textField(lead: Lead, ...keys: string[]): string {
  for (const key of keys) {
    const value = lead.field_data?.[key]?.trim()
    if (value) return value
  }
  return ''
}

function splitName(fullName: string): { firstName: string, lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts.shift() ?? '',
    lastName: parts.join(' ')
  }
}

const COMMENT_EXCLUDED_KEYS = new Set([
  'full_name', 'first_name', 'last_name', 'email', 'email_address',
  'phone', 'phone_number', 'mobile', 'mobile_phone', 'postcode', 'post_code',
  'vehicle_stock_number', 'stock_number', 'retailer_item_id',
  'vehicle_make', 'make', 'vehicle_model', 'model'
])

function humanize(key: string): string {
  const value = key.replace(/_+/g, ' ').trim()
  const first = value.at(0)
  return first ? first.toUpperCase() + value.slice(1) : ''
}

function leadComments(lead: Lead): string {
  return Object.entries(lead.field_data ?? {})
    .filter(([key, value]) => !COMMENT_EXCLUDED_KEYS.has(key) && Boolean(String(value).trim()))
    .map(([key, value]) => `${humanize(key)}: ${String(value).trim()}`)
    .join('\n')
}

export function buildAutoGateLeadPayload(
  lead: Lead,
  config: AutoGateConfig,
  version: AutoGateApiVersion
): Record<string, unknown> {
  const fullName = textField(lead, 'full_name')
  const split = splitName(fullName)
  const firstName = textField(lead, 'first_name') || split.firstName
  const lastName = textField(lead, 'last_name') || split.lastName
  const phone = textField(lead, 'phone_number', 'mobile_phone', 'mobile', 'phone')
  const identifierKey = version === 'v3' ? 'Identifier' : 'UniqueIdentifier'

  return {
    [identifierKey]: lead.id,
    SellerIdentifier: config.sellerIdentifier,
    Service: config.service ?? 'ADME',
    LeadType: config.leadType ?? 'General',
    ItemType: 'Car',
    RequestType: 'Dealer',
    Status: 'New',
    Environment: {
      SiteOrigin: config.siteOrigin,
      PageSource: config.pageSource ?? 'details',
      SourceDevice: config.sourceDevice ?? '',
      IPAddress: config.ipAddress,
      SessionId: lead.source_lead_id
    },
    Prospect: {
      Title: '',
      FirstName: firstName,
      LastName: lastName,
      CompanyName: '',
      Address: textField(lead, 'address'),
      Suburb: textField(lead, 'suburb', 'city'),
      State: textField(lead, 'state'),
      Postcode: textField(lead, 'postcode', 'post_code', 'postal_code'),
      Email: textField(lead, 'email', 'email_address'),
      HomePhone: phone,
      MobilePhone: phone,
      WorkPhone: textField(lead, 'work_phone'),
      FaxNumber: ''
    },
    TradeIn: {
      Make: '', Model: '', Year: '', Kms: '', DetailsUrl: '', Colour: '', Type: ''
    },
    Item: {
      StockNumber: textField(lead, 'vehicle_stock_number', 'stock_number', 'retailer_item_id'),
      Make: textField(lead, 'vehicle_make', 'make'),
      Model: textField(lead, 'vehicle_model', 'model'),
      RedbookCode: textField(lead, 'vehicle_redbook_code', 'redbook_code')
    },
    Tags: (config.tags ?? []).map(tag => tag.trim()).filter(Boolean).slice(0, 20),
    Comments: leadComments(lead)
  }
}

function responseError(body: string): string {
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.message ?? parsed?.error?.message ?? parsed?.error ?? parsed?.title
    if (message) return String(message).slice(0, 500)
  } catch {
    // Plain-text failures are returned by some carsales gateway paths.
  }
  return body.trim().slice(0, 500) || 'empty_response'
}

function responseLeadId(body: string): string | null {
  try {
    const parsed = JSON.parse(body)
    return typeof parsed === 'string' && GUID_RE.test(parsed) ? parsed : null
  } catch {
    return GUID_RE.test(body.trim()) ? body.trim() : null
  }
}

const adapter: DestinationAdapter<AutoGateConfig> = {
  type: 'autogate',

  validateConfig(input) {
    const config = input as Partial<AutoGateConfig> | null
    const errors: Record<string, string> = {}
    if (!config || !GUID_RE.test(config.sellerIdentifier ?? '')) {
      errors.sellerIdentifier = 'Valid carsales SellerIdentifier GUID required'
    }
    if (!config?.siteOrigin || !DOMAIN_RE.test(config.siteOrigin)) {
      errors.siteOrigin = 'Bare domain required, without protocol or path'
    }
    if (!config?.ipAddress || isIP(config.ipAddress) === 0) {
      errors.ipAddress = 'Valid IPv4 or IPv6 address required'
    }
    if (config?.service !== undefined && !config.service.trim()) {
      errors.service = 'Service cannot be empty'
    }
    if (config?.tags && (!Array.isArray(config.tags) || config.tags.some(tag => typeof tag !== 'string'))) {
      errors.tags = 'Tags must be strings'
    }
    return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
  },

  async dispatch(_delivery, lead, config) {
    const validation = adapter.validateConfig(config)
    if (!validation.valid) {
      return {
        status: 'failed',
        error: `autogate_invalid_config: ${JSON.stringify(validation.errors)}`,
        final: true
      } as DispatchResult
    }

    const username = process.env.AUTOGATE_LEAD_API_USERNAME?.trim()
    const password = process.env.AUTOGATE_LEAD_API_PASSWORD
    if (!username || !password) {
      return {
        status: 'failed',
        error: 'autogate_credentials_missing',
        final: true
      } as DispatchResult
    }

    const version = apiVersion()
    const body = JSON.stringify(buildAutoGateLeadPayload(lead, config, version))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

    let response: Response
    try {
      response = await fetch(`${AUTOGATE_BASE_URL}/${version}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
        },
        body,
        signal: controller.signal
      })
    } catch (error) {
      return {
        status: 'failed',
        error: `autogate_network_error: ${error instanceof Error ? error.message : String(error)}`
      }
    } finally {
      clearTimeout(timer)
    }

    const responseBody = await response.text().catch(() => '')
    if (response.ok) {
      return {
        status: 'delivered',
        response_meta: {
          http_status: response.status,
          api_version: version,
          autogate_lead_id: responseLeadId(responseBody)
        }
      }
    }

    const result = {
      status: 'failed' as const,
      error: `autogate_http_${response.status}: ${responseError(responseBody)}`,
      ...(response.status >= 400 && response.status < 500 && response.status !== 429
        ? { final: true }
        : {})
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? 60)
      return {
        ...result,
        retry_after_ms: (Number.isFinite(retryAfter) ? retryAfter : 60) * 1000
      }
    }
    return result
  }
}

registerAdapter(adapter)
export default adapter
