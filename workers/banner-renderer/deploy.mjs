import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const account = 'a5b299b3ad15c1b5b895dc66f9357b17'
export function validateBannerRendererTarget(config, environment) {
  assert(['production', 'staging'].includes(environment), 'Explicit environment required')
  assert(Object.keys(config).every(key => ['$schema', 'account_id', 'name', 'main', 'compatibility_date', 'compatibility_flags', 'workers_dev', 'preview_urls', 'routes', 'triggers', 'browser', 'limits', 'observability', 'vars'].includes(key)), 'Unreviewed capability')
  assert.equal(config.account_id, account)
  assert.equal(config.name, `banner-renderer-${environment}`)
  assert.equal(config.main, 'dist/index.js')
  assert.equal(config.compatibility_date, '2026-07-15')
  // Public font and signed-asset URLs must reach Pages even when the RPC caller shares its zone.
  assert.deepEqual(config.compatibility_flags, ['nodejs_compat', 'global_fetch_strictly_public'])
  assert.equal(config.workers_dev, false)
  assert.equal(config.preview_urls, false)
  assert.deepEqual(config.routes, [])
  assert.deepEqual(config.triggers, { crons: [] })
  assert.deepEqual(config.browser, { binding: 'BROWSER' })
  assert.deepEqual(config.limits, { cpu_ms: 60000 })
  assert.deepEqual(config.observability, { enabled: false })
  assert.deepEqual(config.vars, {
    BANNER_RENDER_ENVIRONMENT: environment,
    BANNER_RENDER_APP_ORIGINS: environment === 'production' ? '["https://app.xeroflow.io"]' : '[]',
    BANNER_RENDER_ASSET_ORIGINS: environment === 'production' ? `["https://agency-files.${account}.r2.cloudflarestorage.com"]` : '[]'
  })
}
export function main(args = process.argv.slice(2)) {
  const [environment, mode] = args
  assert(args.length <= 2 && [undefined, '--check-only', '--dry-run'].includes(mode), 'Invalid deployment arguments')
  assert(['production', 'staging'].includes(environment), 'Explicit environment required')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const configPath = fileURLToPath(new URL(`wrangler.${environment}.jsonc`, import.meta.url))
  validateBannerRendererTarget(JSON.parse(readFileSync(configPath, 'utf8')), environment)
  if (mode === '--check-only') return
  const git = (...command) => execFileSync('git', command, { cwd: root, encoding: 'utf8' }).trim()
  const source = git('rev-parse', 'HEAD')
  if (!mode) {
    assert(/^(?:https:\/\/github\.com\/|git@github\.com:)adme-dev\/dashboard(?:\.git)?$/.test(git('remote', 'get-url', 'origin')), 'Wrong repository')
    git('fetch', 'origin', 'main')
    git('merge-base', '--is-ancestor', 'origin/main', 'HEAD')
    assert.equal(git('status', '--porcelain', '--untracked-files=all').split('\n').filter(line => line && !line.startsWith('?? .verification/')).length, 0, 'Release source must be clean')
  }
  execFileSync(process.execPath, [fileURLToPath(new URL('build.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' })
  execFileSync(process.execPath, [`${root}node_modules/wrangler/bin/wrangler.js`, 'deploy', '--config', configPath, '--message', `Dashboard source ${source}`, '--tag', source, ...(mode === '--dry-run' ? ['--dry-run', '--outdir', `${root}.verification/banner-renderer-${environment}`] : [])], { cwd: root, stdio: 'inherit' })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
