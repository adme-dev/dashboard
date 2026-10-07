import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function validateEmailRenderingTarget(config, environment) {
  assert(['staging', 'production'].includes(environment), 'Explicit staging or production target required')
  const allowed = ['$schema', 'name', 'account_id', 'main', 'compatibility_date', 'compatibility_flags', 'workers_dev', 'preview_urls', 'routes', 'observability', 'vars', 'triggers']
  assert(Object.keys(config).every(key => allowed.includes(key)), 'Unreviewed Worker capability')
  assert.equal(config.account_id, 'a5b299b3ad15c1b5b895dc66f9357b17')
  assert.equal(config.name, `xeroflow-email-rendering-${environment}`)
  assert.equal(config.main, 'src/index.ts')
  assert.equal(config.compatibility_date, '2026-07-15')
  assert.deepEqual(config.compatibility_flags, [])
  assert.equal(config.workers_dev, false)
  assert.equal(config.preview_urls, false)
  assert.deepEqual(config.routes, [])
  assert.deepEqual(config.triggers, { crons: [] })
  assert.deepEqual(config.vars, { EMAIL_RENDER_ENVIRONMENT: environment })
  assert.deepEqual(config.observability, { enabled: false, logs: { enabled: false, invocation_logs: false } })
}

export function main(args = process.argv.slice(2)) {
  const [environment, mode] = args
  assert(args.length <= 2 && [undefined, '--dry-run', '--check-only'].includes(mode), 'Invalid deployment arguments')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const file = fileURLToPath(new URL(`./wrangler.${environment}.jsonc`, import.meta.url))
  assert(['staging', 'production'].includes(environment), 'Explicit deployment environment required')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  validateEmailRenderingTarget(config, environment)
  const git = (...command) => execFileSync('git', command, { cwd: root, encoding: 'utf8' }).trim()
  const source = git('rev-parse', 'HEAD')
  assert(/^[a-f0-9]{40}$/.test(source))
  if (!mode) {
    assert(/^(?:https:\/\/github\.com\/|git@github\.com:)adme-dev\/dashboard(?:\.git)?$/.test(git('remote', 'get-url', 'origin')), 'Wrong source repository')
    git('fetch', 'origin', 'main')
    git('merge-base', '--is-ancestor', 'origin/main', 'HEAD')
    if (environment === 'production') assert.equal(source, git('rev-parse', 'origin/main'), 'Production must be exact current main')
    const changes = git('status', '--porcelain', '--untracked-files=all').split('\n').filter(line => line && !line.startsWith('?? .verification/'))
    assert.equal(changes.length, 0, 'Release source must be clean')
    git('ls-files', '--error-unmatch', `workers/email-rendering/wrangler.${environment}.jsonc`, 'workers/email-rendering/src/index.ts')
  }
  console.log(JSON.stringify({ target: config.name, environment, source, mode: mode ?? 'deploy' }))
  if (mode === '--check-only') return
  execFileSync(process.execPath, [`${root}node_modules/wrangler/bin/wrangler.js`, 'deploy', '--config', file, '--message', `Dashboard source ${source}`, '--tag', source, ...(mode === '--dry-run' ? ['--dry-run', '--outdir', `${root}.verification/email-rendering-worker-${environment}`] : [])], { cwd: root, stdio: 'inherit' })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
