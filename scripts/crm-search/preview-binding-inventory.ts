import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { parse } from 'smol-toml'

import {
  CRM_SEARCH_EXTERNAL_MUTABLE_INTEGRATIONS,
  CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
  CRM_SEARCH_QUEUE_RETENTION_SECONDS,
  type CrmSearchExternalMutableIntegration,
  type CrmSearchExternalIntegrationTarget,
  type CrmSearchEnvironmentResources
} from './resource-manifest'

const ISSUED_AT = '2026-08-11T00:00:00.000Z'
const EXPIRES_AT = '2026-09-10T00:00:00.000Z'
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u

export interface ExternalIntegrationReadback {
  name: CrmSearchExternalMutableIntegration
  enabled: boolean
  targetIdentity: string | null
  verifiedAt: string
  source: 'cloudflare_api'
}

const SAFETY_STATE_FROM_CONFIG: Partial<Record<CrmSearchExternalMutableIntegration, (config: PagesWranglerConfig) => boolean>> = {
  database: config => (config.hyperdrive?.length ?? 0) > 0,
  provider_apis: config => config.vars?.CRM_SEARCH_PROVIDER_APIS_ENABLED === 'true',
  ai_gateway: config => typeof config.vars?.AI_GATEWAY_URL === 'string'
    && config.vars.AI_GATEWAY_URL.trim().length > 0,
  mcp: config => config.vars?.MCP_SERVER_ENABLED === 'true',
  meta: config => config.vars?.PERSONA_META_AUDIENCE_WRITES_ENABLED === 'true',
  google: config => config.vars?.PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED === 'true',
  meta_audiences: config => config.vars?.PERSONA_META_AUDIENCE_WRITES_ENABLED === 'true',
  google_audiences: config => config.vars?.PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED === 'true'
}

const SAFETY_TARGET_FROM_CONFIG: Partial<Record<CrmSearchExternalMutableIntegration, (config: PagesWranglerConfig) => string | null>> = {
  ai_gateway: config => typeof config.vars?.AI_GATEWAY_URL === 'string'
    ? config.vars.AI_GATEWAY_URL
    : null,
  mcp: config => typeof config.vars?.MCP_WORKER_ORIGIN === 'string'
    ? config.vars.MCP_WORKER_ORIGIN
    : null
}

function normalizeTargetIdentity(value: string): string {
  const normalized = value.trim()
  if (normalized.length < 1 || normalized.length > 512 || /[\s@]/u.test(normalized)) {
    throw new Error('crm_search_pages_integration_target_invalid')
  }
  if (/^https?:/iu.test(normalized)) {
    let target: URL
    try {
      target = new URL(normalized)
    } catch {
      throw new Error('crm_search_pages_integration_target_invalid')
    }
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) {
      throw new Error('crm_search_pages_integration_target_invalid')
    }
    target.pathname = target.pathname.replace(/\/+$/u, '') || '/'
    return target.toString()
  }
  if (!/^[A-Za-z0-9:._/-]+$/u.test(normalized)) {
    throw new Error('crm_search_pages_integration_target_invalid')
  }
  return normalized
}

function deriveExternalIntegrations(
  environmentConfig: PagesWranglerConfig,
  readbacks: ExternalIntegrationReadback[],
  secrets: SecretBinding[] = []
): CrmSearchExternalIntegrationTarget[] {
  if (!Array.isArray(readbacks)
    || readbacks.map(value => value?.name).join('\0') !== CRM_SEARCH_EXTERNAL_MUTABLE_INTEGRATIONS.join('\0')) {
    throw new Error('crm_search_pages_integration_inventory_invalid')
  }
  return readbacks.map((readback) => {
    const exactKeys = Object.keys(readback ?? {}).sort().join('\0')
      === ['name', 'enabled', 'targetIdentity', 'verifiedAt', 'source'].sort().join('\0')
    const verifiedAt = Date.parse(readback?.verifiedAt ?? '')
    if (!exactKeys || readback.source !== 'cloudflare_api'
      || typeof readback.enabled !== 'boolean'
      || !ISO_TIMESTAMP.test(readback.verifiedAt ?? '') || !Number.isFinite(verifiedAt)) {
      throw new Error('crm_search_pages_integration_inventory_invalid')
    }
    const databaseConfigured = (environmentConfig.hyperdrive?.length ?? 0) > 0
      || secrets.some(secret => secret.binding === 'DATABASE_URL')
    const configuredState = readback.name === 'database'
      ? databaseConfigured
      : SAFETY_STATE_FROM_CONFIG[readback.name]?.(environmentConfig)
    if (configuredState !== undefined && configuredState !== readback.enabled) {
      throw new Error('crm_search_pages_integration_config_mismatch')
    }
    if (!readback.enabled) {
      if (readback.targetIdentity !== null) {
        throw new Error('crm_search_pages_integration_inventory_invalid')
      }
      return Object.freeze({
        name: readback.name, state: 'disabled' as const,
        targetIdentityDigest: null, verifiedAt: readback.verifiedAt
      })
    }
    if (typeof readback.targetIdentity !== 'string') {
      throw new Error('crm_search_pages_integration_inventory_invalid')
    }
    const normalizedTarget = normalizeTargetIdentity(readback.targetIdentity)
    const configuredTarget = SAFETY_TARGET_FROM_CONFIG[readback.name]?.(environmentConfig)
    if (configuredTarget != null
      && normalizedTarget !== normalizeTargetIdentity(configuredTarget)) {
      throw new Error('crm_search_pages_integration_config_mismatch')
    }
    return Object.freeze({
      name: readback.name, state: 'enabled' as const,
      targetIdentityDigest: createHash('sha256')
        .update(normalizedTarget).digest('hex'),
      verifiedAt: readback.verifiedAt
    })
  })
}

export function buildCrmSearchEnvironmentResources(
  environment: 'production' | 'preview',
  integrationReadbacks: ExternalIntegrationReadback[]
): CrmSearchEnvironmentResources {
  const config = parse(
    readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
  ) as PagesWranglerConfig
  const environmentConfig = config.env?.[environment]
  if (!environmentConfig) throw new Error('crm_search_pages_environment_missing')
  const preview = environment === 'preview'
  return Object.freeze({
    version: CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
    environment,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    readbackSource: 'cloudflare_api',
    plan: 'workers_paid',
    pages: {
      project: 'agency-dashboard',
      branch: preview ? 'preview' : 'main',
      origin: preview
        ? 'https://preview.agency-dashboard.pages.dev'
        : 'https://agency-dashboard-6cm.pages.dev'
    },
    worker: { name: preview ? 'agency-crm-search-consumer-preview' : 'agency-crm-search-consumer' },
    vectorize: { crmSearch: preview ? 'agency-crm-search-preview' : 'agency-crm-search' },
    queues: {
      primary: {
        name: preview ? 'agency-crm-search-index-preview' : 'agency-crm-search-index',
        retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
      },
      deadLetter: {
        name: preview ? 'agency-crm-search-index-preview-dlq' : 'agency-crm-search-index-dlq',
        retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
      }
    },
    externalIntegrations: deriveExternalIntegrations(environmentConfig, integrationReadbacks)
  })
}

interface BindingRecord extends Record<string, unknown> {
  binding?: string
}

interface PagesWranglerConfig extends Record<string, unknown> {
  name?: string
  d1_databases?: BindingRecord[]
  analytics_engine_datasets?: BindingRecord[]
  kv_namespaces?: BindingRecord[]
  queues?: { producers?: BindingRecord[] }
  r2_buckets?: BindingRecord[]
  ai?: BindingRecord
  vectorize?: BindingRecord[]
  browser?: BindingRecord
  hyperdrive?: BindingRecord[]
  services?: BindingRecord[]
  vars?: Record<string, unknown>
  durable_objects?: { bindings?: BindingRecord[] }
  env?: Record<string, PagesWranglerConfig>
}

interface SecretBinding {
  binding: string
  digest: string
}

interface NormalizedBinding {
  category: string
  binding: string
  target: string
}

const NON_INHERITABLE_CATEGORIES = Object.freeze([
  'vars', 'd1_databases', 'durable_objects', 'hyperdrive', 'kv_namespaces',
  'r2_buckets', 'services', 'queues', 'vectorize', 'analytics_engine_datasets',
  'ai', 'browser'
])
const ALLOWED_ENVIRONMENT_KEYS = new Set([
  ...NON_INHERITABLE_CATEGORIES,
  'name', 'pages_build_output_dir', 'compatibility_date', 'compatibility_flags', 'placement'
])
const STATEFUL_CATEGORIES = new Set([
  'd1_databases', 'durable_objects', 'hyperdrive', 'kv_namespaces', 'r2_buckets',
  'services', 'queues', 'vectorize', 'analytics_engine_datasets', 'secrets'
])

const pagesConfig = parse(
  readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
) as PagesWranglerConfig

function values(records: BindingRecord[] | undefined, field: string): string[] {
  return (records ?? []).map(record => record[field]).filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
}

function record(category: string, binding: unknown, target: unknown): NormalizedBinding {
  if (typeof binding !== 'string' || binding.length === 0
    || typeof target !== 'string' || target.length === 0) {
    throw new Error('crm_search_pages_binding_invalid')
  }
  return { category, binding, target }
}

function normalizeEnvironment(
  config: PagesWranglerConfig,
  environment: 'production' | 'preview',
  secrets: SecretBinding[],
  integrationReadbacks: ExternalIntegrationReadback[]
) {
  const environmentConfig = config.env?.[environment]
  if (!environmentConfig || typeof environmentConfig !== 'object') {
    throw new Error('crm_search_pages_environment_missing')
  }
  const unknownCategories = Object.keys(environmentConfig).filter(key => !ALLOWED_ENVIRONMENT_KEYS.has(key))
  if (unknownCategories.length > 0) throw new Error('crm_search_pages_binding_unknown')
  const inheritedCategories = NON_INHERITABLE_CATEGORIES.filter(category =>
    Object.prototype.hasOwnProperty.call(config, category)
    && (!Object.prototype.hasOwnProperty.call(environmentConfig, category)
      || environmentConfig[category] === undefined))
  if (inheritedCategories.length > 0) throw new Error('crm_search_pages_environment_inherited')
  if (!Array.isArray(secrets) || secrets.length === 0) {
    throw new Error('crm_search_pages_secret_inventory_missing')
  }
  const integrations = deriveExternalIntegrations(environmentConfig, integrationReadbacks, secrets)

  const bindings: NormalizedBinding[] = []
  for (const value of environmentConfig.kv_namespaces ?? []) {
    bindings.push(record('kv_namespaces', value.binding, value.id))
  }
  for (const value of environmentConfig.d1_databases ?? []) {
    bindings.push(record('d1_databases', value.binding, value.database_id))
  }
  for (const value of environmentConfig.queues?.producers ?? []) {
    bindings.push(record('queues', value.binding, value.queue))
  }
  for (const value of environmentConfig.analytics_engine_datasets ?? []) {
    bindings.push(record(
      'analytics_engine_datasets', value.binding,
      value.dataset ?? value.binding
    ))
  }
  for (const value of environmentConfig.r2_buckets ?? []) {
    bindings.push(record('r2_buckets', value.binding, value.bucket_name))
  }
  for (const value of environmentConfig.vectorize ?? []) {
    bindings.push(record('vectorize', value.binding, value.index_name))
  }
  for (const value of environmentConfig.hyperdrive ?? []) {
    bindings.push(record('hyperdrive', value.binding, value.id))
  }
  for (const value of environmentConfig.services ?? []) {
    bindings.push(record('services', value.binding, value.service))
  }
  for (const value of environmentConfig.durable_objects?.bindings ?? []) {
    bindings.push(record('durable_objects', value.name, value.script_name))
  }
  if (environmentConfig.ai) bindings.push(record('ai', environmentConfig.ai.binding, 'workers-ai'))
  if (environmentConfig.browser) bindings.push(record('browser', environmentConfig.browser.binding, 'browser-rendering'))
  for (const [binding, value] of Object.entries(environmentConfig.vars ?? {})) {
    bindings.push(record('vars', binding, createHash('sha256').update(String(value)).digest('hex')))
  }
  for (const secret of secrets) {
    if (!/^[a-f0-9]{64}$/u.test(secret?.digest ?? '')) throw new Error('crm_search_pages_secret_inventory_invalid')
    bindings.push(record('secrets', secret.binding, secret.digest))
  }
  bindings.sort((left, right) => `${left.category}\0${left.binding}`.localeCompare(`${right.category}\0${right.binding}`))
  const identities = bindings.map(value => `${value.category}\0${value.binding}`)
  if (new Set(identities).size !== identities.length) throw new Error('crm_search_pages_binding_duplicate')
  return Object.freeze({
    environment,
    categories: [...NON_INHERITABLE_CATEGORIES, 'secrets'].sort(),
    bindings,
    integrations,
    inheritedCategories,
    unknownCategories
  })
}

export function buildPagesEnvironmentInventory(
  config: PagesWranglerConfig,
  secrets: { production: SecretBinding[], preview: SecretBinding[] },
  integrations: {
    production: ExternalIntegrationReadback[]
    preview: ExternalIntegrationReadback[]
  }
) {
  const environments = Object.keys(config.env ?? {}).sort()
  if (environments.join('\0') !== ['preview', 'production'].join('\0')) {
    throw new Error('crm_search_pages_environments_invalid')
  }
  return Object.freeze({
    version: 'crm-search-pages-environment-inventory-v1',
    production: normalizeEnvironment(
      config, 'production', secrets.production, integrations?.production
    ),
    preview: normalizeEnvironment(config, 'preview', secrets.preview, integrations?.preview)
  })
}

export function assertPagesEnvironmentIsolation(inventory: ReturnType<typeof buildPagesEnvironmentInventory>) {
  const production = new Map(inventory.production.bindings.map(value => [
    `${value.category}\0${value.binding}`, value.target
  ]))
  const preview = new Map(inventory.preview.bindings.map(value => [
    `${value.category}\0${value.binding}`, value.target
  ]))
  const productionStatefulTargets = new Set(
    [...production]
      .filter(([key]) => STATEFUL_CATEGORIES.has(key.split('\0', 1)[0]!))
      .map(([, target]) => target)
  )
  for (const [key, target] of preview) {
    const category = key.split('\0', 1)[0]!
    if (STATEFUL_CATEGORIES.has(category) && productionStatefulTargets.has(target)) {
      throw new Error('crm_search_pages_preview_resource_alias')
    }
  }
  const productionIntegrations = new Map(inventory.production.integrations.map(value => [value.name, value]))
  for (const integration of inventory.preview.integrations) {
    const productionIntegration = productionIntegrations.get(integration.name)
    if (!productionIntegration) throw new Error('crm_search_pages_integration_inventory_invalid')
    if (integration.state === 'enabled'
      && productionIntegration.state === 'enabled'
      && integration.targetIdentityDigest === productionIntegration.targetIdentityDigest) {
      throw new Error('crm_search_pages_preview_integration_alias')
    }
  }
  return { ok: true } as const
}

const productionPagesConfig = pagesConfig.env?.production ?? {}

export const PAGES_BINDING_INVENTORY = Object.freeze({
  categories: [
    'kv', 'd1', 'queues', 'r2', 'ai', 'vectorize', 'browser', 'hyperdrive',
    'services', 'analytics_engine_datasets', 'durable_objects', 'vars', 'secrets', 'pages'
  ],
  mutableBindings: [...new Set([
    'R2',
    ...values(productionPagesConfig.kv_namespaces, 'binding'),
    ...values(productionPagesConfig.d1_databases, 'binding'),
    ...values(productionPagesConfig.queues?.producers, 'binding'),
    ...values(productionPagesConfig.r2_buckets, 'binding'),
    ...(productionPagesConfig.ai?.binding ? [productionPagesConfig.ai.binding] : []),
    ...values(productionPagesConfig.vectorize, 'binding'),
    ...(productionPagesConfig.browser?.binding ? [productionPagesConfig.browser.binding] : []),
    ...values(productionPagesConfig.hyperdrive, 'binding'),
    ...values(productionPagesConfig.services, 'binding'),
    ...values(productionPagesConfig.analytics_engine_datasets, 'binding'),
    ...values(productionPagesConfig.durable_objects?.bindings, 'name'),
    ...Object.keys(productionPagesConfig.vars ?? {})
  ])].sort(),
  productionResourceNames: [...new Set([
    ...values(productionPagesConfig.kv_namespaces, 'id'),
    ...values(productionPagesConfig.d1_databases, 'database_id'),
    ...values(productionPagesConfig.queues?.producers, 'queue'),
    ...values(productionPagesConfig.r2_buckets, 'bucket_name'),
    ...values(productionPagesConfig.vectorize, 'index_name'),
    ...values(productionPagesConfig.hyperdrive, 'id'),
    ...values(productionPagesConfig.services, 'service'),
    ...values(productionPagesConfig.analytics_engine_datasets, 'dataset'),
    ...values(productionPagesConfig.durable_objects?.bindings, 'script_name')
  ])].sort()
})

export function inventoryPagesBindings() {
  const environments = Object.keys(pagesConfig.env ?? {}).sort((left, right) =>
    ['production', 'preview'].indexOf(left) - ['production', 'preview'].indexOf(right))
  const inheritedCategories = environments.flatMap(environment =>
    NON_INHERITABLE_CATEGORIES.filter(category =>
      Object.prototype.hasOwnProperty.call(pagesConfig, category)
      && !Object.prototype.hasOwnProperty.call(pagesConfig.env?.[environment] ?? {}, category)))
  const unknownCategories = environments.flatMap(environment =>
    Object.keys(pagesConfig.env?.[environment] ?? {}).filter(key => !ALLOWED_ENVIRONMENT_KEYS.has(key)))
  return {
    categories: [...PAGES_BINDING_INVENTORY.categories],
    mutableBindings: [...PAGES_BINDING_INVENTORY.mutableBindings],
    productionResourceNames: [...PAGES_BINDING_INVENTORY.productionResourceNames],
    environments,
    inheritedCategories: [...new Set(inheritedCategories)].sort(),
    unknownCategories: [...new Set(unknownCategories)].sort()
  }
}

export function assertPreviewIsolation(input: {
  preview: CrmSearchEnvironmentResources
  production: CrmSearchEnvironmentResources
}): { ok: true } {
  const { preview, production } = input
  const previewMutable = [
    preview.pages.origin,
    preview.worker.name,
    preview.vectorize.crmSearch,
    preview.queues.primary.name,
    preview.queues.deadLetter.name
  ]
  const productionMutable = new Set([
    ...PAGES_BINDING_INVENTORY.productionResourceNames,
    production.pages.origin,
    production.worker.name,
    production.vectorize.crmSearch,
    production.queues.primary.name,
    production.queues.deadLetter.name
  ])
  if (previewMutable.some(value => productionMutable.has(value))) {
    throw new Error('crm_search_preview_resource_alias')
  }
  if (
    preview.environment !== 'preview'
    || production.environment !== 'production'
    || preview.pages.project !== 'agency-dashboard'
    || preview.pages.branch !== 'preview'
    || production.pages.branch !== 'main'
    || preview.worker.name !== 'agency-crm-search-consumer-preview'
    || preview.vectorize.crmSearch !== 'agency-crm-search-preview'
    || preview.queues.primary.name !== 'agency-crm-search-index-preview'
    || preview.queues.deadLetter.name !== 'agency-crm-search-index-preview-dlq'
    || preview.externalIntegrations.length !== CRM_SEARCH_EXTERNAL_MUTABLE_INTEGRATIONS.length
    || preview.externalIntegrations.some((value, index) =>
      value.name !== CRM_SEARCH_EXTERNAL_MUTABLE_INTEGRATIONS[index]
      || !['disabled', 'enabled'].includes(value.state)
      || (value.state === 'disabled'
        ? value.targetIdentityDigest !== null
        : !/^[a-f0-9]{64}$/u.test(value.targetIdentityDigest ?? ''))
      || !ISO_TIMESTAMP.test(value.verifiedAt))
    || production.externalIntegrations.some((value, index) =>
      value.name !== CRM_SEARCH_EXTERNAL_MUTABLE_INTEGRATIONS[index])
  ) throw new Error('crm_search_preview_manifest_invalid')

  const productionIntegrations = new Map(
    production.externalIntegrations.map(value => [value.name, value])
  )
  if (preview.externalIntegrations.some((value) => {
    const productionTarget = productionIntegrations.get(value.name)
    return !productionTarget || (value.state === 'enabled'
      && productionTarget.state === 'enabled'
      && value.targetIdentityDigest === productionTarget.targetIdentityDigest)
  })) throw new Error('crm_search_preview_integration_alias')

  if (
    preview.queues.primary.retentionSeconds !== CRM_SEARCH_QUEUE_RETENTION_SECONDS
    || preview.queues.deadLetter.retentionSeconds !== CRM_SEARCH_QUEUE_RETENTION_SECONDS
  ) throw new Error('crm_search_preview_retention_invalid')
  return { ok: true }
}
