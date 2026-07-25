import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const checkOnly = process.argv.includes('--check-only')
const workerDir = path.resolve('dist/_worker.js')
const sourceConfigPath = path.join(workerDir, 'wrangler.json')
const stagingConfigPath = path.join(workerDir, 'wrangler.worker-staging.json')
const assetsIgnorePath = path.resolve('dist/.assetsignore')
const stagingName = process.env.CLOUDFLARE_STAGING_WORKER || 'agency-dashboard-worker-staging'

const config = JSON.parse(await readFile(sourceConfigPath, 'utf8'))
delete config.pages_build_output_dir

config.name = stagingName
config.main = './index.js'
config.no_bundle = true
config.find_additional_modules = true
config.base_dir = '.'
config.preserve_file_names = true
config.rules = [
  {
    type: 'ESModule',
    globs: [
      '**/*.js',
      '**/*.mjs'
    ],
    fallthrough: true
  },
  {
    type: 'CompiledWasm',
    globs: ['**/*.wasm'],
    fallthrough: true
  }
]
config.assets = {
  directory: '..',
  binding: 'ASSETS'
}
config.workers_dev = true
config.preview_urls = true
config.observability = {
  enabled: true
}

await writeFile(stagingConfigPath, `${JSON.stringify(config, null, 2)}\n`)
await writeFile(assetsIgnorePath, '_worker.js\n')

const args = [
  'exec',
  'wrangler',
  'deploy',
  '--config',
  stagingConfigPath,
  '--no-bundle',
  '--keep-vars',
  ...(checkOnly ? ['--dry-run'] : [])
]

const child = spawn('pnpm', args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || '/tmp/dashboard-worker-staging.log'
  },
  stdio: 'inherit'
})

child.on('exit', code => {
  process.exitCode = code ?? 1
})
