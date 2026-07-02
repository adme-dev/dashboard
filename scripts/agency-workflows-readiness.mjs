#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const DEFAULT_GRAPHIFY_DIR = 'graphify-out'
const DEFAULT_GRAPHIFY_MAX_AGE_DAYS = 7
const DEFAULT_OBSIDIAN_APP_PATH = '/Applications/Obsidian.app'

const AUTH_ENV_NAMES = [
  'AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN',
  'SOCIAL_SMOKE_AUTH_TOKEN',
  'SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN',
  'AGENCY_WORKFLOWS_SMOKE_COOKIE'
]

function option(env, name, fallback = '') {
  return String(env[name] ?? '').trim() || fallback
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function formatCommand(command, args) {
  return [command, ...args].join(' ')
}

function defaultRunCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: error.message })
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

function extractReportDate(report) {
  const match = report.match(/Graph Report[^\n]*\((\d{4}-\d{2}-\d{2})\)/)
  return match?.[1] ?? null
}

function parseGraphJson(graphPath) {
  const raw = readFileSync(graphPath, 'utf8')
  const parsed = JSON.parse(raw)
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : []
  const edges = Array.isArray(parsed.links)
    ? parsed.links
    : Array.isArray(parsed.edges)
      ? parsed.edges
      : []
  return { nodes, edges }
}

export function resolveReadinessConfig(env = process.env) {
  return {
    graphifyDir: option(env, 'GRAPHIFY_OUT_DIR', DEFAULT_GRAPHIFY_DIR),
    graphifyMaxAgeDays: parsePositiveInteger(
      env.AGENCY_WORKFLOWS_GRAPHIFY_MAX_AGE_DAYS,
      DEFAULT_GRAPHIFY_MAX_AGE_DAYS
    ),
    now: option(env, 'AGENCY_WORKFLOWS_READINESS_NOW')
      ? new Date(option(env, 'AGENCY_WORKFLOWS_READINESS_NOW'))
      : new Date(),
    hasProductionSmokeAuth: AUTH_ENV_NAMES.some(name => option(env, name))
  }
}

export function checkGraphifyArtifacts({
  graphifyDir = DEFAULT_GRAPHIFY_DIR,
  now = new Date(),
  maxAgeDays = DEFAULT_GRAPHIFY_MAX_AGE_DAYS,
  obsidianAppPath = DEFAULT_OBSIDIAN_APP_PATH
} = {}) {
  const graphPath = join(graphifyDir, 'graph.json')
  const reportPath = join(graphifyDir, 'GRAPH_REPORT.md')
  const obsidianSetup = existsSync(obsidianAppPath)
    ? `Obsidian is installed at ${obsidianAppPath}; open the regenerated Graphy vault there for local architecture review.`
    : 'Install Obsidian locally, then open the regenerated Graphy vault there for architecture review.'
  const remediation = [
    'Regenerate the local Graphy artifact with the project Graphy setup.',
    obsidianSetup,
    'Then publish it with: node --env-file=.env scripts/upload-graphify.mjs graphify-out <r2-prefix>.'
  ].join(' ')

  if (!existsSync(graphifyDir)) {
    return { ok: false, reason: `Graphy directory is missing: ${graphifyDir}`, remediation }
  }
  if (!existsSync(graphPath) || !existsSync(reportPath)) {
    return {
      ok: false,
      reason: 'Graphy artifact must include graph.json and GRAPH_REPORT.md.',
      remediation
    }
  }

  let graph
  try {
    graph = parseGraphJson(graphPath)
  } catch (error) {
    return {
      ok: false,
      reason: `Graphy graph.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      remediation
    }
  }

  const report = readFileSync(reportPath, 'utf8')
  const reportDate = extractReportDate(report)
  const reportMtime = statSync(reportPath).mtime
  const timestamp = reportDate ? new Date(`${reportDate}T00:00:00Z`) : reportMtime
  const ageMs = now.getTime() - timestamp.getTime()
  const ageDays = ageMs / (24 * 60 * 60 * 1000)

  if (!graph.nodes.length) {
    return {
      ok: false,
      nodeCount: 0,
      edgeCount: graph.edges.length,
      reportDate,
      reason: 'Graphy graph.json contains no nodes.',
      remediation
    }
  }

  if (!Number.isFinite(ageDays) || ageDays > maxAgeDays) {
    return {
      ok: false,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      reportDate,
      ageDays: Number.isFinite(ageDays) ? Math.floor(ageDays) : null,
      reason: `Graphy artifact is stale; max age is ${maxAgeDays} days.`,
      remediation
    }
  }

  return {
    ok: true,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    reportDate,
    ageDays: Math.max(0, Math.floor(ageDays))
  }
}

function commandStep(name, command, args) {
  return { name, command, args }
}

function commandSummary(result) {
  const output = `${result.stdout || ''}${result.stderr ? `\n${result.stderr}` : ''}`.trim()
  return output.split('\n').slice(-8).join('\n')
}

async function runStep(step, runCommand) {
  const result = await runCommand(step.command, step.args)
  return {
    name: step.name,
    status: result.code === 0 ? 'pass' : 'fail',
    command: formatCommand(step.command, step.args),
    output: commandSummary(result)
  }
}

function summarizeStatus(steps) {
  if (steps.some(step => step.status === 'fail')) return 'failed'
  if (steps.some(step => step.status === 'blocked')) return 'blocked'
  return 'pass'
}

export async function runAgencyWorkflowsReadiness({
  env = process.env,
  runCommand = defaultRunCommand,
  log = console.log
} = {}) {
  const config = resolveReadinessConfig(env)
  const steps = []

  steps.push(await runStep(commandStep('git status', 'git', ['status', '--short', '--branch']), runCommand))

  const graphify = checkGraphifyArtifacts({
    graphifyDir: config.graphifyDir,
    now: config.now,
    maxAgeDays: config.graphifyMaxAgeDays
  })
  steps.push({
    name: 'graphify artifacts',
    status: graphify.ok ? 'pass' : 'blocked',
    output: graphify.ok
      ? `Graphy nodes=${graphify.nodeCount} edges=${graphify.edgeCount} reportDate=${graphify.reportDate ?? 'mtime'} ageDays=${graphify.ageDays}`
      : `${graphify.reason}\n${graphify.remediation}`
  })

  const localCommands = [
    commandStep('workflow config tests', 'pnpm', ['exec', 'vitest', 'run', 'test/config/agencyWorkflowsBindings.test.ts']),
    commandStep('worker typecheck', 'pnpm', ['--dir', 'workers/agency-workflows', 'run', 'typecheck']),
    commandStep('worker deploy dry-run', 'pnpm', ['run', 'deploy:workflows:dry-run'])
  ]

  for (const step of localCommands) {
    steps.push(await runStep(step, runCommand))
  }

  if (config.hasProductionSmokeAuth) {
    steps.push(await runStep(commandStep('authenticated production smoke', 'pnpm', ['run', 'smoke:agency-workflows']), runCommand))
  } else {
    steps.push({
      name: 'authenticated production smoke',
      status: 'blocked',
      output: [
        'Missing admin auth input.',
        'Set AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN or AGENCY_WORKFLOWS_SMOKE_COOKIE, then rerun pnpm run readiness:agency-workflows.'
      ].join(' ')
    })
  }

  const status = summarizeStatus(steps)
  const result = {
    ok: status === 'pass',
    status,
    steps
  }

  for (const step of steps) {
    log(`${step.status.toUpperCase()} ${step.name}`)
    if (step.output) log(step.output)
  }

  return result
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgencyWorkflowsReadiness().then((result) => {
    process.exit(result.ok ? 0 : 1)
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
