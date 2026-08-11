import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const ACCOUNT_ID = /^[a-f0-9]{32}$/u
const EXACT_PROJECT = 'agency-dashboard'
const EXACT_EXECUTE_FLAG = 'EXECUTE CRM SEARCH PREVIEW ISOLATION'

const BINDING_MAPS = Object.freeze([
  'ai_bindings',
  'analytics_engine_datasets',
  'browsers',
  'd1_databases',
  'durable_object_namespaces',
  'hyperdrive_bindings',
  'kv_namespaces',
  'mtls_certificates',
  'queue_producers',
  'r2_buckets',
  'service_bindings',
  'vectorize_bindings'
])

const DISABLED_PREVIEW_VARIABLES = Object.freeze({
  APP_NAME: 'XeroFlow Agency',
  CRM_SEARCH_RELEASE_ENVIRONMENT: 'preview',
  CRM_SEARCH_PROVIDER_APIS_ENABLED: 'false',
  MCP_SERVER_ENABLED: 'false',
  MCP_WORKER_ORIGIN: '',
  PERSONA_AUDIENCE_PROVIDER_WRITES_ENABLED: 'false',
  PERSONA_META_AUDIENCE_WRITES_ENABLED: 'false',
  PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED: 'false',
  AGENCY_WORKFLOWS_ENABLED: 'false',
  AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
  AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: 'false',
  SEARCH_AUTHORITY_ENABLED: 'false',
  NUXT_SEARCH_AUTHORITY_ENABLED: 'false',
  NUXT_PUBLIC_SEARCH_AUTHORITY_ENABLED: 'false',
  SEND_ENABLED: 'false',
  SEND_PUBLIC_ENABLED: 'false',
  NUXT_SEND_ENABLED: 'false',
  NUXT_PUBLIC_SEND_ENABLED: 'false',
  NUXT_PUBLIC_SEND_PUBLIC_ENABLED: 'false',
  SITE_INTELLIGENCE_ENABLED: 'false',
  SITE_INTELLIGENCE_AI_ENABLED: 'false'
})

function fail(code) {
  throw new Error(code)
}

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(',')}}`
  }
  fail('crm_search_preview_isolation_noncanonical')
}

function normalizedDeploymentConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail('crm_search_preview_isolation_readback_invalid')
  }
  const normalized = structuredClone(config)
  const envVars = normalized.env_vars ?? {}
  for (const [name, value] of Object.entries(envVars)) {
    if (value?.type === 'secret_text') envVars[name] = { type: 'secret_text' }
  }
  normalized.env_vars = envVars
  return normalized
}

export function previewDeploymentDigest(config) {
  return createHash('sha256')
    .update(canonical(normalizedDeploymentConfig(config)), 'utf8')
    .digest('hex')
}

function deletionMap(value) {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail('crm_search_preview_isolation_readback_invalid')
  }
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, null]))
}

function disabledEnvironmentVariables(current) {
  const result = Object.fromEntries(
    Object.keys(current ?? {}).sort().map(key => [key, null])
  )
  for (const [name, value] of Object.entries(DISABLED_PREVIEW_VARIABLES)) {
    result[name] = { type: 'plain_text', value }
  }
  return result
}

function assertProject(value) {
  if (!value || value.name !== EXACT_PROJECT || value.production_branch !== 'main'
    || !value.deployment_configs?.production || !value.deployment_configs?.preview) {
    fail('crm_search_preview_isolation_project_invalid')
  }
  return value
}

export function buildPagesPreviewIsolationPatch(project) {
  const current = assertProject(project).deployment_configs.preview
  const preview = {
    env_vars: disabledEnvironmentVariables(current.env_vars)
  }
  for (const mapName of BINDING_MAPS) preview[mapName] = deletionMap(current[mapName])
  return { deployment_configs: { preview } }
}

function assertDisabledPreview(config) {
  const normalized = normalizedDeploymentConfig(config)
  for (const mapName of BINDING_MAPS) {
    const entries = Object.entries(normalized[mapName] ?? {})
    if (entries.length > 0) fail('crm_search_preview_isolation_readback_failed')
  }
  const expected = Object.fromEntries(Object.entries(DISABLED_PREVIEW_VARIABLES).map(
    ([name, value]) => [name, { type: 'plain_text', value }]
  ))
  if (canonical(normalized.env_vars) !== canonical(expected)) {
    fail('crm_search_preview_isolation_readback_failed')
  }
}

export async function requestCloudflarePagesProject({
  method, accountId, projectName, apiToken, body, fetchImpl = fetch
}) {
  if (!ACCOUNT_ID.test(accountId ?? '') || projectName !== EXACT_PROJECT
    || typeof apiToken !== 'string' || apiToken.length < 16
    || !['GET', 'PATCH'].includes(method)) {
    fail('crm_search_preview_isolation_request_invalid')
  }
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {})
      },
      ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {})
    }
  )
  let payload
  try {
    payload = await response.json()
  } catch {
    fail('crm_search_preview_isolation_api_failed')
  }
  if (!response.ok || payload?.success !== true || !payload.result) {
    fail('crm_search_preview_isolation_api_failed')
  }
  return payload.result
}

export async function applyPagesPreviewIsolation({
  accountId,
  projectName,
  apiToken,
  executeFlag,
  request = requestCloudflarePagesProject
}) {
  if (executeFlag !== EXACT_EXECUTE_FLAG) {
    fail('crm_search_preview_isolation_authorization_required')
  }
  const requestInput = { accountId, projectName, apiToken }
  const before = assertProject(await request({ method: 'GET', ...requestInput }))
  const productionDigest = previewDeploymentDigest(before.deployment_configs.production)
  const beforeDigest = previewDeploymentDigest(before.deployment_configs.preview)
  const body = buildPagesPreviewIsolationPatch(before)
  const patched = assertProject(await request({ method: 'PATCH', ...requestInput, body }))
  const after = assertProject(await request({ method: 'GET', ...requestInput }))
  if (previewDeploymentDigest(patched.deployment_configs.production) !== productionDigest
    || previewDeploymentDigest(after.deployment_configs.production) !== productionDigest) {
    fail('crm_search_preview_isolation_production_drift')
  }
  assertDisabledPreview(patched.deployment_configs.preview)
  assertDisabledPreview(after.deployment_configs.preview)
  const afterDigest = previewDeploymentDigest(after.deployment_configs.preview)
  return Object.freeze({
    accountId,
    projectName,
    environment: 'preview',
    status: 'isolated',
    productionUnchanged: true,
    beforeDigest,
    afterDigest
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') fail('crm_search_node_version_mismatch')
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ status: 'preview-isolation-plan-only', mutationCount: 0 }))
  } else if (process.argv.includes('--execute')) {
    const result = await applyPagesPreviewIsolation({
      accountId: process.env.CRM_SEARCH_CLOUDFLARE_ACCOUNT_ID,
      projectName: process.env.CRM_SEARCH_PAGES_PROJECT,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      executeFlag: process.env.CRM_SEARCH_PREVIEW_ISOLATION_CONFIRM
    })
    console.log(JSON.stringify(result))
  } else {
    fail('crm_search_preview_isolation_injected_token_required')
  }
}
