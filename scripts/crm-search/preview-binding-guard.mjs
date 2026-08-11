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
const EXACT_EXTERNAL_INTEGRATIONS = Object.freeze([
  'database', 'provider_apis', 'ai_gateway', 'mcp', 'meta', 'google', 'meta_audiences',
  'google_audiences', 'xero', 'email_delivery', 'monday', 'slack',
  'outbound_webhooks', 'google_sheets', 'social_dashboard'
])
const DIGEST = /^[a-f0-9]{64}$/u
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
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
const CONFIG_STATE = Object.freeze({
  database: config => (config.hyperdrive?.length ?? 0) > 0,
  provider_apis: config => config.vars?.CRM_SEARCH_PROVIDER_APIS_ENABLED === 'true',
  ai_gateway: config => typeof config.vars?.AI_GATEWAY_URL === 'string'
    && config.vars.AI_GATEWAY_URL.trim().length > 0,
  mcp: config => config.vars?.MCP_SERVER_ENABLED === 'true',
  meta: config => config.vars?.PERSONA_META_AUDIENCE_WRITES_ENABLED === 'true',
  google: config => config.vars?.PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED === 'true',
  meta_audiences: config => config.vars?.PERSONA_META_AUDIENCE_WRITES_ENABLED === 'true',
  google_audiences: config => config.vars?.PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED === 'true'
})

function normalizedTargetDigest(value) {
  if (typeof value !== 'string' || value.trim().length < 1) {
    throw new Error('crm_search_pages_integration_config_mismatch')
  }
  let normalized = value.trim()
  if (/^https?:/iu.test(normalized)) {
    const target = new URL(normalized)
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) {
      throw new Error('crm_search_pages_integration_config_mismatch')
    }
    target.pathname = target.pathname.replace(/\/+$/u, '') || '/'
    normalized = target.toString()
  }
  return createHash('sha256').update(normalized).digest('hex')
}

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
  const targetEnvironment = readback.pagesBranch === 'preview' ? 'preview' : 'production'
  const actualByEnvironment = { production, preview }
  for (const environment of [targetEnvironment]) {
    const actual = actualByEnvironment[environment]
    const expected = expectedConfigBindings(config, environment)
    const nonSecret = new Map([...actual].filter(([key]) => !key.startsWith('secrets\0')))
    if (expected.size !== nonSecret.size
      || [...expected].some(([key, target]) => nonSecret.get(key) !== target)) {
      throw new Error('crm_search_preview_binding_inventory_incomplete')
    }
    const integrationInventory = readback.pagesInventory[environment].integrations
    for (const [name, derive] of Object.entries(CONFIG_STATE)) {
      const target = integrationInventory.find(value => value.name === name)
      if (!target || (target.state === 'enabled') !== derive(config.env[environment])) {
        throw new Error('crm_search_pages_integration_config_mismatch')
      }
    }
    const vars = config.env[environment].vars ?? {}
    for (const [name, configuredIdentity] of [
      ['ai_gateway', vars.AI_GATEWAY_URL], ['mcp', vars.MCP_WORKER_ORIGIN]
    ]) {
      const target = integrationInventory.find(value => value.name === name)
      if (target?.state === 'enabled'
        && target.targetIdentityDigest !== normalizedTargetDigest(configuredIdentity)) {
        throw new Error('crm_search_pages_integration_config_mismatch')
      }
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
    || !Array.isArray(value.bindings)
    || !Array.isArray(value.integrations)
    || value.integrations.map(target => target?.name).join('\0')
    !== EXACT_EXTERNAL_INTEGRATIONS.join('\0')) {
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
  const integrations = new Map()
  for (const target of value.integrations) {
    const exactKeys = target && Object.keys(target).sort().join('\0')
      === ['name', 'state', 'targetIdentityDigest', 'verifiedAt'].sort().join('\0')
    const enabled = target?.state === 'enabled'
      && DIGEST.test(target.targetIdentityDigest ?? '')
      && ISO_TIMESTAMP.test(target.verifiedAt ?? '')
      && Number.isFinite(Date.parse(target.verifiedAt ?? ''))
    const disabled = target?.state === 'disabled'
      && target.targetIdentityDigest === null
      && ISO_TIMESTAMP.test(target.verifiedAt ?? '')
      && Number.isFinite(Date.parse(target.verifiedAt ?? ''))
    if (!exactKeys || (!enabled && !disabled) || integrations.has(target.name)) {
      throw new Error('crm_search_preview_integration_inventory_invalid')
    }
    integrations.set(target.name, target)
  }
  return { bindings, integrations }
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
  const productionEnvironment = validateEnvironment(readback.pagesInventory.production, 'production')
  const previewEnvironment = validateEnvironment(readback.pagesInventory.preview, 'preview')
  const production = productionEnvironment.bindings
  const preview = previewEnvironment.bindings
  const productionStatefulTargets = new Set(
    [...production].filter(([key]) => STATEFUL.has(key.split('\0', 1)[0])).map(([, target]) => target)
  )
  for (const [key, target] of preview) {
    if (STATEFUL.has(key.split('\0', 1)[0]) && productionStatefulTargets.has(target)) {
      throw new Error('crm_search_preview_binding_readback_mismatch')
    }
  }
  for (const [name, target] of previewEnvironment.integrations) {
    const productionTarget = productionEnvironment.integrations.get(name)
    if (!productionTarget) throw new Error('crm_search_preview_integration_inventory_invalid')
    if (target.state === 'enabled' && productionTarget.state === 'enabled'
      && target.targetIdentityDigest === productionTarget.targetIdentityDigest) {
      throw new Error('crm_search_preview_integration_target_mismatch')
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
