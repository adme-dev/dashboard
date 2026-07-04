#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { runAgencyWorkflowsProductionSmoke } from './agency-workflows-production-smoke.mjs'

const DEFAULT_WRANGLER_CONFIG = 'wrangler.toml'
const AUTH_ENV_NAMES = [
  'AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN',
  'SOCIAL_SMOKE_AUTH_TOKEN',
  'SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN',
  'AGENCY_WORKFLOWS_SMOKE_COOKIE'
]
const CUTOVER_FLAG_PATTERN = /^AGENCY_WORKFLOWS_.*(?:PRIMARY|WRITES_ENABLED)$/

function option(env, name) {
  return String(env[name] ?? '').trim()
}

function flagEnabled(value) {
  return String(value ?? '').trim().toLowerCase() === 'true'
}

export function readPagesWorkflowVars(configPath = DEFAULT_WRANGLER_CONFIG) {
  const config = parse(readFileSync(configPath, 'utf8'))
  return config && typeof config === 'object' && config.vars && typeof config.vars === 'object'
    ? config.vars
    : {}
}

export function activeWorkflowCutoverFlags(vars = {}) {
  return Object.entries(vars)
    .filter(([name, value]) => CUTOVER_FLAG_PATTERN.test(name) && flagEnabled(value))
    .map(([name]) => name)
    .sort()
}

export function evaluateCiSmokeGate({
  env = process.env,
  pagesVars = readPagesWorkflowVars()
} = {}) {
  const authNames = AUTH_ENV_NAMES.filter(name => option(env, name))
  const activeCutoverFlags = activeWorkflowCutoverFlags(pagesVars)
  const strictRequired = flagEnabled(env.AGENCY_WORKFLOWS_CI_REQUIRE_SMOKE_AUTH)
  const authConfigured = authNames.length > 0
  const authRequired = strictRequired || activeCutoverFlags.length > 0

  if (!authConfigured && authRequired) {
    return {
      ok: false,
      status: 'blocked',
      authConfigured,
      activeCutoverFlags,
      reason: [
        'Authenticated Workflows smoke auth is required before deploying active Workflow cutovers.',
        activeCutoverFlags.length
          ? `Active cutover flags: ${activeCutoverFlags.join(', ')}.`
          : 'AGENCY_WORKFLOWS_CI_REQUIRE_SMOKE_AUTH=true.',
        'Configure AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN or AGENCY_WORKFLOWS_SMOKE_COOKIE as a GitHub Actions secret.'
      ].join(' ')
    }
  }

  if (!authConfigured) {
    return {
      ok: true,
      status: 'skipped',
      authConfigured,
      activeCutoverFlags,
      reason: 'Authenticated Workflows smoke skipped because all Workflow cutover flags are dormant.'
    }
  }

  return {
    ok: true,
    status: 'run',
    authConfigured,
    activeCutoverFlags,
    reason: `Authenticated Workflows smoke auth configured via ${authNames.join(', ')}.`
  }
}

export async function runCiSmokeGate({
  env = process.env,
  pagesVars,
  log = console.log,
  smokeRunner = runAgencyWorkflowsProductionSmoke
} = {}) {
  const gate = evaluateCiSmokeGate({ env, pagesVars })

  if (!gate.ok) {
    throw new Error(gate.reason)
  }

  if (gate.status === 'skipped') {
    log(`SKIP ${gate.reason}`)
    return gate
  }

  log(gate.reason)
  await smokeRunner({ env, log })
  return gate
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCiSmokeGate().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
