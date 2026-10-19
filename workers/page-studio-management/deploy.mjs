import assert from 'node:assert/strict'
import { z } from 'zod'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function validateManagementTarget(config, environment) {
  assert(['staging', 'production'].includes(environment), 'Explicit staging or production target required')
  const allowed = ['$schema', 'name', 'account_id', 'main', 'compatibility_date', 'compatibility_flags', 'workers_dev', 'preview_urls', 'routes', 'observability', 'vars', 'hyperdrive', 'triggers', 'r2_buckets', 'services', 'tsconfig']
  assert(Object.keys(config).every(key => allowed.includes(key)), 'Unreviewed Worker capability')
  assert.equal(config.account_id, 'a5b299b3ad15c1b5b895dc66f9357b17')
  assert.equal(config.name, `xeroflow-page-studio-management-${environment}`)
  assert.equal(config.main, 'src/index.ts')
  assert.equal(config.tsconfig, 'tsconfig.json')
  assert.equal(config.compatibility_date, '2026-07-15')
  assert.deepEqual(config.compatibility_flags, ['nodejs_compat'])
  assert.equal(config.workers_dev, false)
  assert.equal(config.preview_urls, false)
  assert.deepEqual(config.routes, [])
  assert.deepEqual(config.triggers, { crons: [] })
  assert.equal(config.vars.PAGE_STUDIO_RELEASE_ENVIRONMENT, environment)
  const allowedVars = ['MANAGED_TRANSFER_EXECUTION_POLICY', 'PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST', 'PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST', 'PAGE_STUDIO_PROVISIONING_ENVIRONMENT', 'MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY', 'PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID', 'PAGE_STUDIO_CLOUDFLARE_ZONE_ID', 'PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET', 'PAGE_STUDIO_DOMAIN_IDENTITY_MODE', 'PAGE_STUDIO_CMS_OBJECT_TRANSPORT', 'PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT', 'PAGE_STUDIO_ACTION_RUNTIME_DIGEST', 'PAGE_STUDIO_CMS_STAGING_ACTION_RUNTIME_DIGEST']
  assert(Object.keys(config.vars).every(key => allowedVars.includes(key)), 'Unreviewed Worker variable')
  assert.equal(config.vars.PAGE_STUDIO_PROVISIONING_ENVIRONMENT, environment === 'production' ? 'production' : undefined)
  if (config.vars.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY !== undefined) {
    assert.equal(environment, 'production', 'Prepared transfer policy is production-only')
    const runtime = z.object({ compatibilityDate: z.iso.date(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
    const policy = z.object({ version: z.literal(1), kind: z.literal('managed-draft-import'),
      accountId: z.literal(config.account_id), namespace: z.literal('xeroflow-page-studio-dispatch-production'),
      from: runtime, to: runtime }).strict().parse(JSON.parse(config.vars.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY))
    assert.notEqual(policy.from.digest, policy.to.digest, 'Prepared runtime must be distinct')
  }
  const preparationKeys = ['MANAGED_TRANSFER_EXECUTION_POLICY', 'PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST', 'PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST']
  if (preparationKeys.some(key => config.vars[key] !== undefined)) {
    assert.equal(environment, 'production', 'Transfer preparation is production-only')
    const runtime = z.object({ compatibilityDate: z.iso.date(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
    const source = z.object({ version: z.literal(1), kind: z.literal('managed-draft-transfer'),
      accountId: z.literal(config.account_id), namespace: z.literal('xeroflow-page-studio-dispatch-staging'),
      from: runtime, to: runtime }).strict().parse(JSON.parse(config.vars.MANAGED_TRANSFER_EXECUTION_POLICY))
    const destination = JSON.parse(config.vars.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY)
    assert.notEqual(source.from.digest, source.to.digest, 'Source successor must be distinct')
    assert.deepEqual(source.to, destination.to, 'Transfer phases must use the same reviewed successor')
    assert.equal(config.vars.PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST, destination.from.digest, 'Bootstrap runtime must match destination predecessor')
    assert.match(config.vars.PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST ?? '', /^[a-f0-9]{64}$/, 'Reviewed bootstrap schema required')
  }
  for (const [key, value] of Object.entries(config.vars)) {
    assert.equal(typeof value, 'string', `Invalid variable ${key}`)
    assert(value === value.trim() && !/[\r\n]/.test(value), `Invalid variable ${key}`)
  }
  assert(!Object.keys(config.vars).some(key => /SECRET|TOKEN|PASSWORD|DATABASE_URL|API_KEY/.test(key)), 'Secrets must not be in configuration')
  assert.deepEqual(config.services, environment === 'production'
    ? [{ binding: 'PAGE_STUDIO_CLIENT_STAGING', service: 'xeroflow-page-studio-client-staging' },
        { binding: 'PAGE_STUDIO_CONTENT_ROUTER', service: 'xeroflow-content-router-production' },
        { binding: 'PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER', service: 'xeroflow-content-router-staging' },
        { binding: 'PAGE_STUDIO_PROVISIONER', service: 'xeroflow-provisioning-production' }]
    : [{ binding: 'PAGE_STUDIO_CONTENT_ROUTER', service: 'xeroflow-content-router-staging' }])
  assert.equal(config.vars.PAGE_STUDIO_CMS_OBJECT_TRANSPORT, environment === 'staging' ? 'placed-fetch' : undefined)
  assert.equal(config.vars.PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT, environment === 'production' ? 'placed-fetch' : undefined)
  const actionRuntime = 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
  assert.equal(config.vars.PAGE_STUDIO_ACTION_RUNTIME_DIGEST, environment === 'staging' ? actionRuntime : undefined)
  assert.equal(config.vars.PAGE_STUDIO_CMS_STAGING_ACTION_RUNTIME_DIGEST, environment === 'production' ? actionRuntime : undefined)
  if (environment === 'production') assert.equal(config.vars.PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID, config.account_id)
  else assert.equal(config.vars.PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID, undefined)
  if (environment === 'production') assert.equal(config.vars.PAGE_STUDIO_CLOUDFLARE_ZONE_ID, '8e38cbf3910d291dd218710296661073')
  if (config.vars.PAGE_STUDIO_DOMAIN_IDENTITY_MODE !== undefined) assert(['metadata', 'standard'].includes(config.vars.PAGE_STUDIO_DOMAIN_IDENTITY_MODE), 'Invalid domain identity policy')
  if (environment === 'production') assert.equal(config.vars.PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET, 'sites.xeroflow.io')
  assert.deepEqual(config.hyperdrive, [{ binding: 'HYPERDRIVE_FRESH', id: environment === 'staging' ? '3865ea5568234fc7b0e9e3e595a30286' : '90228af3e2cc461bbc09accc3b47bd9f' }])
  assert.deepEqual(config.r2_buckets, [{ binding: 'PAGE_STUDIO_CHECKPOINTS', bucket_name: `xeroflow-page-studio-checkpoints${environment === 'staging' ? '-staging' : ''}` },
    ...(environment === 'production' ? [{ binding: 'PAGE_STUDIO_CMS_STAGING_CHECKPOINTS', bucket_name: 'xeroflow-page-studio-checkpoints-staging' }] : [])])
  assert.deepEqual(config.observability, { enabled: true, head_sampling_rate: 0.1 })
}

export function main(args = process.argv.slice(2)) {
  const [environment, mode] = args
  assert(args.length <= 2 && [undefined, '--dry-run', '--check-only'].includes(mode), 'Invalid deployment arguments')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const file = fileURLToPath(new URL(`./wrangler.${environment}.jsonc`, import.meta.url))
  assert(['staging', 'production'].includes(environment), 'Explicit deployment environment required')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  validateManagementTarget(config, environment)
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
    git('ls-files', '--error-unmatch', `workers/page-studio-management/wrangler.${environment}.jsonc`, 'workers/page-studio-management/src/index.ts')
  }
  console.log(JSON.stringify({ target: config.name, environment, source, mode: mode ?? 'deploy' }))
  if (mode === '--check-only') return
  execFileSync(process.execPath, [`${root}node_modules/wrangler/bin/wrangler.js`, 'deploy', '--config', file, '--tsconfig', `${root}workers/page-studio-management/tsconfig.json`, '--message', `Dashboard source ${source}`, '--tag', source, ...(mode === '--dry-run' ? ['--dry-run', '--outdir', `${root}.verification/managed-transfer/cms-management-${environment}`] : [])], { cwd: fileURLToPath(new URL('./', import.meta.url)), stdio: 'inherit' })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
