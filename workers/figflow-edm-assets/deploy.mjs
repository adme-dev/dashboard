import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = fileURLToPath(new URL('./', import.meta.url))
export function validateTarget(config) {
  assert.deepEqual(config, {
    $schema: '../../node_modules/wrangler/config-schema.json',
    name: 'xeroflow-figflow-edm-assets', account_id: 'a5b299b3ad15c1b5b895dc66f9357b17',
    main: 'worker.mjs', compatibility_date: '2026-10-27',
    workers_dev: false, preview_urls: false, routes: [],
    assets: { directory: 'dist/assets', binding: 'ASSETS', run_worker_first: true },
    observability: { enabled: false }
  }, 'Private immutable native asset target changed')
}
export function validatePrepared(receipt, base) {
  assert(/^[a-f0-9]{40}$/.test(receipt.source), 'Native source revision missing')
  assert.equal(receipt.prefix, '/figflow/0.11.2-edm1/')
  assert(/^[0-9]+$/.test(receipt.ciRunId), 'Native CI run missing')
  const list = (path, prefix = '') => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), 'Symlink in prepared native assets')
    const name = prefix + entry.name
    return entry.isDirectory() ? list(resolve(path, entry.name), name + '/') : [name]
  })
  const nativeRoot = resolve(base, 'figflow/0.11.2-edm1')
  assert.deepEqual(list(base).sort(), Object.keys(receipt.files).map(name => 'figflow/0.11.2-edm1/' + name).sort(), 'Prepared asset inventory changed')
  for (const [name, metadata] of Object.entries(receipt.files)) {
    assert(/^[A-Za-z0-9_./-]+$/.test(name) && !name.split('/').includes('..'))
    const bytes = readFileSync(resolve(nativeRoot, name))
    assert.equal(bytes.length, metadata.size)
    assert(bytes.length <= 25_165_824)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256, 'Prepared native asset changed')
  }
}
export function main(args = process.argv.slice(2)) {
  assert(args.length <= 1 && [undefined, '--check-only', '--dry-run'].includes(args[0]))
  const mode = args[0]
  const config = JSON.parse(readFileSync(resolve(directory, 'wrangler.json'), 'utf8'))
  validateTarget(config)
  assert.equal(process.versions.node, readFileSync(resolve(root, '.nvmrc'), 'utf8').trim())
  const receipt = JSON.parse(readFileSync(resolve(directory, 'dist/receipt.json'), 'utf8'))
  validatePrepared(receipt, resolve(directory, 'dist/assets'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const source = git('rev-parse', 'HEAD')
  assert(/^(?:https:\/\/github\.com\/|git@github\.com:)adme-dev\/dashboard(?:\.git)?$/.test(git('remote', 'get-url', 'origin')))
  git('merge-base', '--is-ancestor', receipt.source, source)
  assert.equal(git('diff', '--name-only', receipt.source, source, '--', 'workers/craft-editors', '.github/workflows/figflow-native-build.yml'), '', 'Native source changed since CI')
  if (!mode) {
    git('fetch', 'origin', 'main')
    assert.equal(source, git('rev-parse', 'origin/main'), 'Release must be exact current main')
    assert.equal(git('status', '--porcelain', '--untracked-files=all').split('\n').filter(line => line && !line.startsWith('?? .verification/')).length, 0, 'Release checkout must be clean')
    const run = JSON.parse(execFileSync('gh', ['api', `repos/adme-dev/dashboard/actions/runs/${receipt.ciRunId}`], { encoding: 'utf8' }))
    assert.equal(run.head_sha, receipt.source)
    assert.equal(run.path, '.github/workflows/figflow-native-build.yml')
    assert.equal(run.status, 'completed')
    assert.equal(run.conclusion, 'success', 'Native CI must pass before promotion')
  }
  console.log(JSON.stringify({ target: config.name, source, nativeSource: receipt.source, nativeRun: receipt.ciRunId, mode: mode ?? 'deploy' }))
  if (mode === '--check-only') return
  execFileSync(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', resolve(directory, 'wrangler.json'), '--message', `FigFlow EDM assets from ${source}`, '--tag', source, ...(mode === '--dry-run' ? ['--dry-run', '--outdir', resolve(root, '.verification/figflow-edm-assets')] : [])], { cwd: root, stdio: 'inherit' })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
