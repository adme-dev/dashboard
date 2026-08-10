import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { parse } from 'smol-toml'

import {
  CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
  CRM_SEARCH_QUEUE_RETENTION_SECONDS,
  type CrmSearchEnvironmentResources
} from './resource-manifest'

const ISSUED_AT = '2026-08-11T00:00:00.000Z'
const EXPIRES_AT = '2026-09-10T00:00:00.000Z'

export const PREVIEW_CRM_SEARCH_RESOURCES: CrmSearchEnvironmentResources = Object.freeze({
  version: CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
  environment: 'preview',
  issuedAt: ISSUED_AT,
  expiresAt: EXPIRES_AT,
  readbackSource: 'cloudflare_api',
  plan: 'workers_paid',
  pages: {
    project: 'agency-dashboard',
    branch: 'preview',
    origin: 'https://preview.agency-dashboard.pages.dev'
  },
  worker: { name: 'agency-crm-search-consumer-preview' },
  vectorize: { crmSearch: 'agency-crm-search-preview' },
  queues: {
    primary: {
      name: 'agency-crm-search-index-preview',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    },
    deadLetter: {
      name: 'agency-crm-search-index-preview-dlq',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    }
  }
} satisfies CrmSearchEnvironmentResources)

export const PRODUCTION_CRM_SEARCH_RESOURCES: CrmSearchEnvironmentResources = Object.freeze({
  version: CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
  environment: 'production',
  issuedAt: ISSUED_AT,
  expiresAt: EXPIRES_AT,
  readbackSource: 'cloudflare_api',
  plan: 'workers_paid',
  pages: {
    project: 'agency-dashboard',
    branch: 'main',
    origin: 'https://agency-dashboard-6cm.pages.dev'
  },
  worker: { name: 'agency-crm-search-consumer' },
  vectorize: { crmSearch: 'agency-crm-search' },
  queues: {
    primary: {
      name: 'agency-crm-search-index',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    },
    deadLetter: {
      name: 'agency-crm-search-index-dlq',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    }
  }
} satisfies CrmSearchEnvironmentResources)

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
  secrets: SecretBinding[]
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
    inheritedCategories,
    unknownCategories
  })
}

export function buildPagesEnvironmentInventory(
  config: PagesWranglerConfig,
  secrets: { production: SecretBinding[], preview: SecretBinding[] }
) {
  const environments = Object.keys(config.env ?? {}).sort()
  if (environments.join('\0') !== ['preview', 'production'].join('\0')) {
    throw new Error('crm_search_pages_environments_invalid')
  }
  return Object.freeze({
    version: 'crm-search-pages-environment-inventory-v1',
    production: normalizeEnvironment(config, 'production', secrets.production),
    preview: normalizeEnvironment(config, 'preview', secrets.preview)
  })
}

export function assertPagesEnvironmentIsolation(inventory: ReturnType<typeof buildPagesEnvironmentInventory>) {
  const production = new Map(inventory.production.bindings.map(value => [
    `${value.category}\0${value.binding}`, value.target
  ]))
  const preview = new Map(inventory.preview.bindings.map(value => [
    `${value.category}\0${value.binding}`, value.target
  ]))
  if (production.size !== preview.size
    || [...production.keys()].some(key => !preview.has(key))) {
    throw new Error('crm_search_pages_binding_inventory_incomplete')
  }
  for (const [key, target] of production) {
    const category = key.split('\0', 1)[0]!
    if (STATEFUL_CATEGORIES.has(category) && preview.get(key) === target) {
      throw new Error('crm_search_pages_preview_resource_alias')
    }
  }
  return { ok: true } as const
}

export const PAGES_BINDING_INVENTORY = Object.freeze({
  categories: [
    'kv', 'd1', 'queues', 'r2', 'ai', 'vectorize', 'browser', 'hyperdrive',
    'services', 'analytics_engine_datasets', 'durable_objects', 'vars', 'secrets', 'pages'
  ],
  mutableBindings: [...new Set([
    'R2',
    ...values(pagesConfig.kv_namespaces, 'binding'),
    ...values(pagesConfig.queues?.producers, 'binding'),
    ...values(pagesConfig.r2_buckets, 'binding'),
    ...(pagesConfig.ai?.binding ? [pagesConfig.ai.binding] : []),
    ...values(pagesConfig.vectorize, 'binding'),
    ...(pagesConfig.browser?.binding ? [pagesConfig.browser.binding] : []),
    ...values(pagesConfig.hyperdrive, 'binding'),
    ...values(pagesConfig.services, 'binding'),
    ...Object.keys(pagesConfig.vars ?? {})
  ])].sort(),
  productionResourceNames: [...new Set([
    ...values(pagesConfig.kv_namespaces, 'id'),
    ...values(pagesConfig.queues?.producers, 'queue'),
    ...values(pagesConfig.r2_buckets, 'bucket_name'),
    ...values(pagesConfig.vectorize, 'index_name'),
    ...values(pagesConfig.hyperdrive, 'id'),
    ...values(pagesConfig.services, 'service')
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
  ) throw new Error('crm_search_preview_manifest_invalid')

  if (
    preview.queues.primary.retentionSeconds !== CRM_SEARCH_QUEUE_RETENTION_SECONDS
    || preview.queues.deadLetter.retentionSeconds !== CRM_SEARCH_QUEUE_RETENTION_SECONDS
  ) throw new Error('crm_search_preview_retention_invalid')
  return { ok: true }
}
