import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const workerDirectory = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = path.resolve(workerDirectory, '../..')
const wranglerEntry = path.join(repositoryRoot, 'node_modules/wrangler/bin/wrangler.js')
const configPath = path.join(workerDirectory, 'wrangler.toml')

const result = spawnSync(
  process.execPath,
  [wranglerEntry, 'deploy', '--config', configPath, ...process.argv.slice(2)],
  {
    cwd: tmpdir(),
    env: process.env,
    stdio: 'inherit'
  }
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
