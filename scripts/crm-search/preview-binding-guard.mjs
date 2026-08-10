import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { parse } from 'smol-toml'

const EXACT_PREVIEW = Object.freeze({
  pagesProject: 'agency-dashboard',
  pagesBranch: 'preview',
  worker: 'agency-crm-search-consumer-preview',
  vectorize: 'agency-crm-search-preview',
  queue: 'agency-crm-search-index-preview',
  deadLetterQueue: 'agency-crm-search-index-preview-dlq',
  retentionSeconds: 1_209_600
})
const EXACT_CATEGORIES = Object.freeze([
  'ai', 'analytics_engine_datasets', 'browser', 'd1_databases', 'durable_objects', 'hyperdrive',
  'kv_namespaces', 'queues', 'r2_buckets', 'secrets', 'services', 'vars', 'vectorize'
])
const STATEFUL = new Set([
  'd1_databases', 'durable_objects', 'hyperdrive', 'kv_namespaces', 'queues',
  'r2_buckets', 'secrets', 'services', 'vectorize', 'analytics_engine_datasets'
])
const NON_INHERITABLE = Object.freeze([
  'vars', 'd1_databases', 'durable_objects', 'hyperdrive', 'kv_namespaces',
  'r2_buckets', 'services', 'queues', 'vectorize', 'analytics_engine_datasets',
  'ai', 'browser'
])
const ALLOWED_ENV_KEYS = new Set([
  ...NON_INHERITABLE,
  'name', 'pages_build_output_dir', 'compatibility_date', 'compatibility_flags', 'placement'
])

function configRecord(category, binding, target) {
  if (typeof binding !== 'string' || !binding || typeof target !== 'string' || !target) {
    throw new Error('crm_search_preview_binding_config_invalid')
  }
  return { category, binding, target }
}

function expectedConfigBindings(config, environment) {
  const environmentConfig = config.env?.[environment]
  if (!environmentConfig || typeof environmentConfig !== 'object') {
    throw new Error('crm_search_preview_binding_config_invalid')
  }
  if (Object.keys(environmentConfig).some(key => !ALLOWED_ENV_KEYS.has(key))) {
    throw new Error('crm_search_pages_binding_unknown')
  }
  if (NON_INHERITABLE.some(category => Object.hasOwn(config, category)
    && !Object.hasOwn(environmentConfig, category))) {
    throw new Error('crm_search_pages_environment_inherited')
  }
  const records = []
  const pushRecords = (category, values, bindingField, targetField) => {
    for (const value of values ?? []) {
      records.push(configRecord(category, value[bindingField], value[targetField]))
    }
  }
  pushRecords('kv_namespaces', environmentConfig.kv_namespaces, 'binding', 'id')
  pushRecords('d1_databases', environmentConfig.d1_databases, 'binding', 'database_id')
  pushRecords('queues', environmentConfig.queues?.producers, 'binding', 'queue')
  pushRecords('r2_buckets', environmentConfig.r2_buckets, 'binding', 'bucket_name')
  pushRecords('vectorize', environmentConfig.vectorize, 'binding', 'index_name')
  pushRecords('hyperdrive', environmentConfig.hyperdrive, 'binding', 'id')
  pushRecords('services', environmentConfig.services, 'binding', 'service')
  pushRecords('durable_objects', environmentConfig.durable_objects?.bindings, 'name', 'script_name')
  for (const value of environmentConfig.analytics_engine_datasets ?? []) {
    records.push(configRecord(
      'analytics_engine_datasets', value.binding, value.dataset ?? value.binding
    ))
  }
  if (environmentConfig.ai) records.push(configRecord('ai', environmentConfig.ai.binding, 'workers-ai'))
  if (environmentConfig.browser) {
    records.push(configRecord('browser', environmentConfig.browser.binding, 'browser-rendering'))
  }
  for (const [binding, value] of Object.entries(environmentConfig.vars ?? {})) {
    records.push(configRecord(
      'vars', binding, createHash('sha256').update(String(value)).digest('hex')
    ))
  }
  const normalized = new Map()
  for (const value of records) {
    const key = `${value.category}\0${value.binding}`
    if (normalized.has(key)) throw new Error('crm_search_preview_binding_config_invalid')
    normalized.set(key, value.target)
  }
  return normalized
}

function assertConfigMatchesReadback(readback, production, preview, pagesConfigText) {
  let config
  try {
    config = parse(pagesConfigText)
  } catch {
    throw new Error('crm_search_preview_binding_config_invalid')
  }
  if (config.name !== 'agency-dashboard'
    || Object.keys(config.env ?? {}).sort().join('\0') !== ['preview', 'production'].join('\0')) {
    throw new Error('crm_search_preview_binding_config_invalid')
  }
  for (const [environment, actual] of [['production', production], ['preview', preview]]) {
    const expected = expectedConfigBindings(config, environment)
    const nonSecret = new Map([...actual].filter(([key]) => !key.startsWith('secrets\0')))
    if (expected.size !== nonSecret.size
      || [...expected].some(([key, target]) => nonSecret.get(key) !== target)) {
      throw new Error('crm_search_preview_binding_inventory_incomplete')
    }
  }
  if (readback.pagesProject !== config.name) {
    throw new Error('crm_search_preview_binding_readback_mismatch')
  }
}

function validateEnvironment(value, expected) {
  if (!value || value.environment !== expected
    || !Array.isArray(value.categories)
    || [...value.categories].sort().join('\0') !== [...EXACT_CATEGORIES].sort().join('\0')
    || !Array.isArray(value.bindings)) {
    throw new Error('crm_search_preview_binding_inventory_incomplete')
  }
  const bindings = new Map()
  for (const binding of value.bindings) {
    if (!binding || !EXACT_CATEGORIES.includes(binding.category)
      || typeof binding.binding !== 'string' || !binding.binding
      || typeof binding.target !== 'string' || !binding.target) {
      throw new Error('crm_search_preview_binding_inventory_invalid')
    }
    const key = `${binding.category}\0${binding.binding}`
    if (bindings.has(key)) throw new Error('crm_search_preview_binding_inventory_invalid')
    bindings.set(key, binding.target)
  }
  return bindings
}

export function assertPreviewBindingReadback(readback, options = {}) {
  if (!readback || Object.keys(EXACT_PREVIEW).some(key => readback[key] !== EXACT_PREVIEW[key])) {
    throw new Error('crm_search_preview_binding_readback_mismatch')
  }
  if (!Array.isArray(readback.mutableBindings) || readback.mutableBindings.length === 0) {
    throw new Error('crm_search_preview_binding_inventory_incomplete')
  }
  if (readback.pagesInventory?.version !== 'crm-search-pages-environment-inventory-v1') {
    throw new Error('crm_search_preview_binding_inventory_incomplete')
  }
  const production = validateEnvironment(readback.pagesInventory.production, 'production')
  const preview = validateEnvironment(readback.pagesInventory.preview, 'preview')
  if (production.size !== preview.size || [...production.keys()].some(key => !preview.has(key))) {
    throw new Error('crm_search_preview_binding_inventory_incomplete')
  }
  for (const [key, target] of production) {
    if (STATEFUL.has(key.split('\0', 1)[0]) && preview.get(key) === target) {
      throw new Error('crm_search_preview_binding_readback_mismatch')
    }
  }
  if (options.pagesConfigText !== undefined) {
    assertConfigMatchesReadback(readback, production, preview, options.pagesConfigText)
  }
  return { ok: true }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_preview_guard_dry_run_required')
  console.log(JSON.stringify({ status: 'readback-required', mutationCount: 0, expected: EXACT_PREVIEW }))
}
