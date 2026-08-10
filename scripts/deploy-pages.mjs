import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { sha256Directory, sha256File } from './crm-search/build-artifact.mjs'
import { runFrozenPagesRelease } from './crm-search/deploy-pages-artifact.mjs'

export const ALLOWED_PAGES_PROJECT = 'agency-dashboard'
const ALLOWED_BRANCHES = new Set(['main', 'preview'])

export function assertPagesDeployTarget({ configuredProject, requestedProject }) {
  if (configuredProject !== ALLOWED_PAGES_PROJECT) {
    throw new Error(
      `wrangler.toml identifies Pages project "${configuredProject || 'unknown'}"; expected "${ALLOWED_PAGES_PROJECT}". Deployment blocked.`
    )
  }

  if (requestedProject !== ALLOWED_PAGES_PROJECT) {
    throw new Error(
      `Refusing Pages deployment to "${requestedProject || 'unknown'}". This repository may deploy only to "${ALLOWED_PAGES_PROJECT}".`
    )
  }
}

export function buildPagesDeployArgs(branch) {
  if (!ALLOWED_BRANCHES.has(branch)) {
    throw new Error(`Unsupported Pages branch "${branch}". Expected main or preview.`)
  }

  return [
    'wrangler',
    '--cwd',
    'dist',
    'pages',
    'deploy',
    '--project-name',
    ALLOWED_PAGES_PROJECT,
    '--branch',
    branch
  ]
}

export function configuredPagesProject(configText) {
  return configText.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1]
}

export function verifyPagesDeployTarget({
  configPath = 'wrangler.toml',
  requestedProject = ALLOWED_PAGES_PROJECT
} = {}) {
  const configuredProject = configuredPagesProject(readFileSync(configPath, 'utf8'))
  assertPagesDeployTarget({ configuredProject, requestedProject })
  return { configuredProject, requestedProject }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error || result.status !== 0) throw result.error ?? new Error(`crm_search_release_command_failed:${command}`)
  return result.stdout.trim()
}

export async function runPagesDeploy({
  branch,
  checkOnly = false,
  artifactManifestPath,
  artifactDirectory = 'dist',
  bindingManifestPath,
  approvalEnvelope,
  approvalVerification
} = {}) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  const target = verifyPagesDeployTarget()
  buildPagesDeployArgs(branch)

  console.log(`Pages deploy guard: ${target.configuredProject} / ${branch}`)
  if (checkOnly) return
  if (!artifactManifestPath) throw new Error('crm_search_release_manifest_required')
  if (!bindingManifestPath) throw new Error('crm_search_binding_manifest_required')
  const manifest = JSON.parse(readFileSync(artifactManifestPath, 'utf8'))
  const actual = {
    implementationSha: capture('git', ['rev-parse', 'HEAD']),
    nodeVersion: process.versions.node,
    cleanTree: capture('git', ['status', '--short']) === '',
    artifactDigest: sha256Directory(artifactDirectory),
    bindingManifestDigest: sha256File(bindingManifestPath)
  }
  return await runFrozenPagesRelease({
    mode: branch === 'main' ? 'production' : 'preview',
    manifest,
    actual,
    approvalEnvelope,
    approvalVerification,
    artifactDirectory,
    execute: ({ args }) => run('pnpm', ['exec', ...args])
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check-only')
  const branch = args.find(arg => !arg.startsWith('--')) || 'main'
  const artifactManifestPath = process.env.CRM_SEARCH_FROZEN_ARTIFACT_MANIFEST
  const approvalEnvelope = process.env.CRM_SEARCH_DEPLOYMENT_APPROVAL
    ? JSON.parse(readFileSync(process.env.CRM_SEARCH_DEPLOYMENT_APPROVAL, 'utf8'))
    : null
  const approvalVerification = process.env.CRM_SEARCH_RELEASE_APPROVAL_VERIFICATION_KEYRING
    ? {
        nowMs: Date.now(),
        keyring: JSON.parse(process.env.CRM_SEARCH_RELEASE_APPROVAL_VERIFICATION_KEYRING)
      }
    : null
  await runPagesDeploy({
    branch,
    checkOnly,
    artifactManifestPath,
    artifactDirectory: process.env.CRM_SEARCH_FROZEN_PAGES_DIRECTORY,
    bindingManifestPath: process.env.CRM_SEARCH_FROZEN_BINDING_MANIFEST,
    approvalEnvelope,
    approvalVerification
  })
}
