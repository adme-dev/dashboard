import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

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
    branch,
    '--commit-dirty=true',
    // Nitro already emits an ESM module graph under dist/_worker.js. Rebundling
    // it duplicates enough code to breach Pages' 25 MiB Function upload limit.
    '--no-bundle'
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

export function runPagesDeploy({ branch, checkOnly = false } = {}) {
  const target = verifyPagesDeployTarget()
  const deployArgs = buildPagesDeployArgs(branch)

  console.log(`Pages deploy guard: ${target.configuredProject} / ${branch}`)
  if (checkOnly) return

  run('pnpm', ['build'])
  run('pnpm', ['exec', ...deployArgs])
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check-only')
  const branch = args.find(arg => !arg.startsWith('--')) || 'main'
  runPagesDeploy({ branch, checkOnly })
}
