import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function validateEmailDesignTarget(config, environment) {
  assert(['staging', 'production'].includes(environment), 'Explicit staging or production target required')
  const production = environment === 'production'
  // Reviewed resource identities come from the existing Pages configuration.
  // This service has no public route, send provider, queue, or scheduled work.
  assert.deepEqual(config, {
    $schema: '../../node_modules/wrangler/config-schema.json',
    name: `xeroflow-email-design-${environment}`,
    account_id: 'a5b299b3ad15c1b5b895dc66f9357b17',
    main: 'dist/worker.mjs',
    compatibility_date: '2026-07-08',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    preview_urls: false,
    routes: [],
    triggers: { crons: [] },
    observability: { enabled: false, logs: { enabled: false, invocation_logs: false } },
    vars: {
      EMAIL_DESIGN_ENVIRONMENT: environment,
      PAGE_STUDIO_RELEASE_ENVIRONMENT: environment,
      FIGFLOW_EDM_DRAFT_SAVES_ENABLED: production ? 'true' : 'false',
      EMAIL_DESIGN_SESSION_AUTHORITY: 'pages-auth-me-v1'
    },
    services: [{ binding: 'EMAIL_RENDERER', service: `xeroflow-email-rendering-${environment}`, entrypoint: 'EmailRenderer' }],
    hyperdrive: [
      { binding: 'HYPERDRIVE', id: production ? '900b4b74ec41462cbbabebd0aa8775aa' : '3865ea5568234fc7b0e9e3e595a30286' },
      { binding: 'HYPERDRIVE_FRESH', id: production ? '90228af3e2cc461bbc09accc3b47bd9f' : '3865ea5568234fc7b0e9e3e595a30286' }
    ],
    kv_namespaces: production ? [{ binding: 'CACHE', id: '7d5db1c489cb40f4b809d611e1408acd' }] : []
  }, 'Private email service configuration differs from reviewed target')
}

export function main(args = process.argv.slice(2)) {
  const [environment, mode] = args
  assert(args.length <= 2 && [undefined, '--dry-run', '--check-only'].includes(mode), 'Invalid deployment arguments')
  assert(['staging', 'production'].includes(environment), 'Explicit deployment environment required')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const worker = fileURLToPath(new URL('./', import.meta.url))
  assert.equal(process.versions.node, readFileSync(`${root}.nvmrc`, 'utf8').trim(), 'Use the repository Node version')
  const file = fileURLToPath(new URL(`./wrangler.${environment}.jsonc`, import.meta.url))
  const config = JSON.parse(readFileSync(file, 'utf8'))
  validateEmailDesignTarget(config, environment)
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
    git('ls-files', '--error-unmatch', `workers/email-design/wrangler.${environment}.jsonc`, 'workers/email-design/admission.mjs', 'workers/email-design/nitro.config.ts')
  }
  console.log(JSON.stringify({ target: config.name, environment, source, mode: mode ?? 'deploy' }))
  if (mode === '--check-only') return
  // Rebuild from the checked source; never publish a retained experiment artifact.
  execFileSync(process.execPath, [`${root}node_modules/nitropack/dist/cli/index.mjs`, 'build'], { cwd: worker, stdio: 'inherit' })
  execFileSync(process.execPath, ['build.mjs'], { cwd: worker, stdio: 'inherit' })
  execFileSync(process.execPath, [`${root}node_modules/wrangler/bin/wrangler.js`, 'deploy', '--config', file, '--message', `Dashboard source ${source}`, '--tag', source, ...(mode === '--dry-run' ? ['--dry-run', '--outdir', `${root}.verification/email-design-worker-${environment}`] : [])], { cwd: root, stdio: 'inherit' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
