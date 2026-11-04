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
    assets: { directory: 'dist-edm5/assets', binding: 'ASSETS', run_worker_first: true },
    observability: { enabled: false }
  }, 'Private immutable native asset target changed')
}
const publication = JSON.parse(readFileSync(resolve(directory, 'publication.json'), 'utf8'))
export function validatePrepared(receipt, base) {
  assert.equal(receipt.schemaVersion, 2, 'Additive asset bundle required')
  assert.deepEqual(Object.keys(receipt.versions).sort(), ['0.11.2-edm1', '0.11.2-edm3', '0.11.2-edm4', '0.11.2-edm5'])
  const list = (path, prefix = '') => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), 'Symlink in prepared native assets')
    const name = prefix + entry.name
    return entry.isDirectory() ? list(resolve(path, entry.name), name + '/') : [name]
  })
  const expected = []
  for (const [version, item] of Object.entries(receipt.versions)) {
    const pin = version === '0.11.2-edm1' ? publication.legacy : { ...publication.packages[version], prefix: `/figflow/${version}/` }
    assert.deepEqual(item, pin, 'Prepared receipt differs from reviewed immutable inventory')
    for (const [name, metadata] of Object.entries(item.files)) {
      assert(/^[A-Za-z0-9_./-]+$/.test(name) && !name.split('/').includes('..'))
      const relative = `figflow/${version}/${name}`
      expected.push(relative)
      const bytes = readFileSync(resolve(base, relative))
      assert.equal(bytes.length, metadata.size)
      assert(bytes.length <= 25_165_824)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256, 'Prepared native asset changed')
    }
  }
  assert.deepEqual(list(base).sort(), expected.sort(), 'Prepared asset inventory changed')
}
export function validateAssetBaseline(deployments, versions) {
  const active = [...deployments].sort((a, b) => a.created_on.localeCompare(b.created_on)).at(-1)
  const items = Array.isArray(versions) ? versions : versions.items
  const latest = [...items].sort((a, b) => a.metadata.created_on.localeCompare(b.metadata.created_on)).at(-1)
  assert.equal(active.id, publication.assetBaseline.deployment, 'Live asset deployment changed; reconcile')
  assert.deepEqual(active.versions, [{ version_id: publication.assetBaseline.version, percentage: 100 }])
  assert.equal(latest.id, publication.assetBaseline.version, 'Latest asset upload changed; refuse inheritance')
}
export function main(args = process.argv.slice(2)) {
  assert(args.length <= 1 && [undefined, '--check-only', '--dry-run'].includes(args[0]))
  const mode = args[0]
  const config = JSON.parse(readFileSync(resolve(directory, 'wrangler.json'), 'utf8'))
  validateTarget(config)
  assert.equal(process.versions.node, readFileSync(resolve(root, '.nvmrc'), 'utf8').trim())
  const receipt = JSON.parse(readFileSync(resolve(directory, 'dist-edm5/receipt.json'), 'utf8'))
  validatePrepared(receipt, resolve(directory, 'dist-edm5/assets'))
  const native = receipt.versions['0.11.2-edm5']
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const source = git('rev-parse', 'HEAD')
  assert(/^(?:https:\/\/github\.com\/|git@github\.com:)adme-dev\/dashboard(?:\.git)?$/.test(git('remote', 'get-url', 'origin')))
  git('merge-base', '--is-ancestor', native.source, source)
  assert.equal(git('diff', '--name-only', native.source, source, '--', 'workers/craft-editors', '.github/workflows/figflow-native-build.yml'), '', 'Native source changed since CI')
  if (!mode) {
    git('fetch', 'origin', 'main')
    assert.equal(source, git('rev-parse', 'origin/main'), 'Release must be exact current main')
    assert.equal(git('status', '--porcelain', '--untracked-files=all').split('\n').filter(line => line && !line.startsWith('?? .verification/')).length, 0, 'Release checkout must be clean')
    const run = JSON.parse(execFileSync('gh', ['api', `repos/adme-dev/dashboard/actions/runs/${native.ciRunId}`], { encoding: 'utf8' }))
    assert.equal(run.head_sha, native.source)
    assert.equal(run.path, '.github/workflows/figflow-native-build.yml')
    assert.equal(run.status, 'completed')
    assert.equal(run.conclusion, 'success', 'Native CI must pass before promotion')
    const wrangler = (...args) => JSON.parse(execFileSync(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--name', config.name, '--json'], { cwd: root, encoding: 'utf8' }))
    validateAssetBaseline(wrangler('deployments', 'list'), wrangler('versions', 'list'))
  }
  console.log(JSON.stringify({ target: config.name, source, nativeSource: native.source, nativeRun: native.ciRunId, mode: mode ?? 'deploy' }))
  if (mode === '--check-only') return
  execFileSync(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', resolve(directory, 'wrangler.json'), '--message', `FigFlow EDM assets from ${source}`, '--tag', source, ...(mode === '--dry-run' ? ['--dry-run', '--outdir', resolve(root, '.verification/figflow-edm-assets')] : [])], { cwd: root, stdio: 'inherit' })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
