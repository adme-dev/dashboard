#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://agency-dashboard-6cm.pages.dev'
const READINESS_PATH = '/api/agency/workflows/readiness'
const STATUS_PATH = '/api/agency/workflows/status'
const REQUIRED_WORKFLOWS = ['social.post.publish', 'social.inbox.automation', 'social.spend.review', 'brief.lifecycle.check']

function usage() {
  return [
    'Agency Workflows authenticated production smoke.',
    '',
    'Required:',
    '  One admin auth input:',
    '    AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN=<admin jwt>',
    '    SOCIAL_SMOKE_AUTH_TOKEN=<admin jwt>',
    '    SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN=<admin jwt>',
    '    or AGENCY_WORKFLOWS_SMOKE_COOKIE="auth_token=...; auth_token_client=..."',
    '',
    'Optional:',
    `  AGENCY_WORKFLOWS_SMOKE_BASE_URL=${DEFAULT_BASE_URL}`,
    '  AGENCY_WORKFLOWS_SMOKE_STATUS_WORKFLOW=social.post.publish',
    '  AGENCY_WORKFLOWS_SMOKE_STATUS_INSTANCE_ID=<cloudflare workflow instance id>',
    ''
  ].join('\n')
}

function option(env, name, fallback = '') {
  return String(env[name] ?? '').trim() || fallback
}

function optionAny(env, names, fallback = '') {
  for (const name of names) {
    const value = option(env, name)
    if (value) return value
  }
  return fallback
}

function endpoint(baseUrl, path) {
  return new URL(path, baseUrl).toString()
}

export function resolveSmokeConfig(env = process.env) {
  const authToken = optionAny(env, [
    'AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN',
    'SOCIAL_SMOKE_AUTH_TOKEN',
    'SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN'
  ])
  const cookie = option(env, 'AGENCY_WORKFLOWS_SMOKE_COOKIE')
  const statusWorkflow = option(env, 'AGENCY_WORKFLOWS_SMOKE_STATUS_WORKFLOW')
  const statusInstanceId = option(env, 'AGENCY_WORKFLOWS_SMOKE_STATUS_INSTANCE_ID')

  if (!authToken && !cookie) {
    throw new Error('Missing admin auth input.\n\n' + usage())
  }

  if (Boolean(statusWorkflow) !== Boolean(statusInstanceId)) {
    throw new Error('AGENCY_WORKFLOWS_SMOKE_STATUS_WORKFLOW and AGENCY_WORKFLOWS_SMOKE_STATUS_INSTANCE_ID must be provided together.')
  }

  return {
    baseUrl: option(env, 'AGENCY_WORKFLOWS_SMOKE_BASE_URL', DEFAULT_BASE_URL),
    authToken,
    cookie,
    statusWorkflow,
    statusInstanceId
  }
}

export function authHeaders(config) {
  const headers = {
    accept: 'application/json'
  }
  if (config.authToken) {
    headers.authorization = `Bearer ${config.authToken}`
  } else if (config.cookie) {
    headers.cookie = config.cookie
  }
  return headers
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Expected JSON response, received: ${text.slice(0, 160)}`)
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} response was not a JSON object`)
  }
  return value
}

function workflowKind(workflow) {
  return workflow && typeof workflow === 'object' && !Array.isArray(workflow)
    ? workflow.kind
    : undefined
}

function workflowBindingConfigured(workflow) {
  return workflow && typeof workflow === 'object' && !Array.isArray(workflow)
    ? workflow.bindingConfigured
    : undefined
}

export function validateReadinessPayload(payload) {
  const body = requireObject(payload, 'Readiness')
  const worker = requireObject(body.worker, 'Readiness worker')
  const workflows = Array.isArray(worker.workflows) ? worker.workflows : []
  const workflowKinds = new Set(workflows.map(workflowKind).filter(Boolean))
  const missing = REQUIRED_WORKFLOWS.filter(kind => !workflowKinds.has(kind))
  const missingBindings = workflows
    .filter(workflow => REQUIRED_WORKFLOWS.includes(workflowKind(workflow)))
    .filter(workflow => workflowBindingConfigured(workflow) !== true)
    .map(workflow => workflowKind(workflow))

  const failures = []
  if (body.ok !== true) failures.push(`readiness ok=${String(body.ok)}`)
  if (body.status !== 'ready') failures.push(`readiness status=${String(body.status)}`)
  if (body.enabled !== true) failures.push('AGENCY_WORKFLOWS_ENABLED is not true')
  if (body.serviceSecretConfigured !== true) failures.push('WORKFLOW_SERVICE_SECRET is not configured')
  if (body.bindingConfigured !== true) failures.push('Pages service binding is not configured')
  if (body.transport !== 'service-binding') failures.push(`transport is ${String(body.transport)}, expected service-binding`)
  if (worker.ok !== true) failures.push(`Worker ok=${String(worker.ok)}`)
  if (worker.enabled !== true) failures.push('Worker AGENCY_WORKFLOWS_ENABLED is not true')
  if (missing.length) failures.push(`Missing workflows: ${missing.join(', ')}`)
  if (missingBindings.length) failures.push(`Missing workflow bindings: ${missingBindings.join(', ')}`)
  if (Array.isArray(body.missingWorkflows) && body.missingWorkflows.length) {
    failures.push(`Readiness reported missing workflows: ${body.missingWorkflows.join(', ')}`)
  }

  if (failures.length) {
    throw new Error(`Agency Workflows readiness is not production-ready:\n- ${failures.join('\n- ')}`)
  }

  return {
    transport: body.transport,
    workflows: REQUIRED_WORKFLOWS
  }
}

export function validateStatusPayload(payload, expected) {
  const body = requireObject(payload, 'Status')
  const failures = []
  if (body.ok !== true) failures.push(`status ok=${String(body.ok)}`)
  if (body.enabled !== true) failures.push('status endpoint is not enabled')
  if (body.transport !== 'service-binding') failures.push(`status transport is ${String(body.transport)}, expected service-binding`)
  if (body.workflow !== expected.workflow) failures.push(`workflow is ${String(body.workflow)}, expected ${expected.workflow}`)
  if (body.instanceId !== expected.instanceId) failures.push(`instanceId is ${String(body.instanceId)}, expected ${expected.instanceId}`)
  if (!body.status || typeof body.status !== 'object') failures.push('status payload is missing the Cloudflare instance status object')

  if (failures.length) {
    throw new Error(`Agency Workflows status lookup failed production checks:\n- ${failures.join('\n- ')}`)
  }

  return body.status
}

async function getJson(fetchImpl, url, config, label) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: authHeaders(config)
  })
  const body = await readJson(response)
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${JSON.stringify(body)}`)
  }
  return body
}

export async function runAgencyWorkflowsProductionSmoke({
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = console.log
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available.')
  }

  const config = resolveSmokeConfig(env)
  const readiness = await getJson(fetchImpl, endpoint(config.baseUrl, READINESS_PATH), config, 'Readiness')
  const readinessSummary = validateReadinessPayload(readiness)
  log(`OK readiness transport=${readinessSummary.transport} workflows=${readinessSummary.workflows.join(',')}`)

  if (config.statusWorkflow && config.statusInstanceId) {
    const url = new URL(endpoint(config.baseUrl, STATUS_PATH))
    url.searchParams.set('workflow', config.statusWorkflow)
    url.searchParams.set('instanceId', config.statusInstanceId)
    const status = await getJson(fetchImpl, url.toString(), config, 'Status')
    const instanceStatus = validateStatusPayload(status, {
      workflow: config.statusWorkflow,
      instanceId: config.statusInstanceId
    })
    log(`OK status workflow=${config.statusWorkflow} instanceId=${config.statusInstanceId} state=${String(instanceStatus.status ?? 'unknown')}`)
  } else {
    log('SKIP status lookup: provide AGENCY_WORKFLOWS_SMOKE_STATUS_WORKFLOW and AGENCY_WORKFLOWS_SMOKE_STATUS_INSTANCE_ID to verify a live instance.')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgencyWorkflowsProductionSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
