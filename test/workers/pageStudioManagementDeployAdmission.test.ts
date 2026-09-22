import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../../workers/page-studio-management/deploy.mjs'

const mocks = vi.hoisted(() => ({ exec: vi.fn(), read: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: mocks.exec }))
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>(), readFileSync: mocks.read }))

const root = fileURLToPath(new URL('../../', import.meta.url))
const head = 'a'.repeat(40)
const configFile = (environment: string) => `${root}workers/page-studio-management/wrangler.${environment}.jsonc`
const trackedFiles = (environment: string) => [
  'ls-files', '--error-unmatch',
  `workers/page-studio-management/wrangler.${environment}.jsonc`,
  'workers/page-studio-management/src/index.ts'
]
const config = (environment: string) => ({
  name: `xeroflow-page-studio-management-${environment}`,
  account_id: 'a5b299b3ad15c1b5b895dc66f9357b17',
  main: 'src/index.ts',
  compatibility_date: '2026-07-15',
  compatibility_flags: ['nodejs_compat'],
  workers_dev: false,
  preview_urls: false,
  routes: [],
  triggers: { crons: [] },
  vars: { PAGE_STUDIO_RELEASE_ENVIRONMENT: environment,
    ...(environment === 'production'
      ? {
          PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID: 'a5b299b3ad15c1b5b895dc66f9357b17',
          PAGE_STUDIO_CLOUDFLARE_ZONE_ID: '8e38cbf3910d291dd218710296661073'
        }
      : {}) },
  ...(environment === 'production' ? { services: [{ binding: 'PAGE_STUDIO_CLIENT_STAGING', service: 'xeroflow-page-studio-client-staging' }] } : {}),
  observability: { enabled: true, head_sampling_rate: 0.1 },
  r2_buckets: [{ binding: 'PAGE_STUDIO_CHECKPOINTS', bucket_name: `xeroflow-page-studio-checkpoints${environment === 'staging' ? '-staging' : ''}` }],
  hyperdrive: [{ binding: 'HYPERDRIVE_FRESH', id: environment === 'staging' ? '3865ea5568234fc7b0e9e3e595a30286' : '90228af3e2cc461bbc09accc3b47bd9f' }]
})

describe('private management deployment admission', () => {
  let state: { source: string, main: string, remote: string, status: string }
  let failures: Map<string, Error>
  let deploymentFailure: Error | undefined
  const gitCalls = () => mocks.exec.mock.calls.filter(([command]) => command === 'git').map(([, args]) => args)
  const wranglerCalls = () => mocks.exec.mock.calls.filter(([command]) => command !== 'git')

  beforeEach(() => {
    mocks.exec.mockReset()
    mocks.read.mockReset()
    state = { source: head, main: head, remote: 'https://github.com/adme-dev/dashboard.git', status: '' }
    failures = new Map()
    deploymentFailure = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.read.mockImplementation((path, encoding) => {
      expect(encoding).toBe('utf8')
      const environment = path === configFile('staging') ? 'staging' : 'production'
      expect(path).toBe(configFile(environment))
      return JSON.stringify(config(environment))
    })
    mocks.exec.mockImplementation((command, args, options) => {
      expect(options.cwd).toBe(root)
      if (command !== 'git') {
        expect(command).toBe(process.execPath)
        expect(args[0]).toBe(`${root}node_modules/wrangler/bin/wrangler.js`)
        if (deploymentFailure) throw deploymentFailure
        return Buffer.from('synthetic Wrangler success')
      }
      expect(options.encoding).toBe('utf8')
      const key = args.join(' ')
      if (failures.has(key)) throw failures.get(key)
      if (key === 'rev-parse HEAD') return state.source
      if (key === 'rev-parse origin/main') return state.main
      if (key === 'remote get-url origin') return state.remote
      if (key === 'status --porcelain --untracked-files=all') return state.status
      if (key === 'fetch origin main' || key === 'merge-base --is-ancestor origin/main HEAD') return ''
      if (['staging', 'production'].some(environment => key === trackedFiles(environment).join(' '))) return ''
      throw new Error(`Unexpected mocked Git command: ${key}`)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    [], ['preview'], ['production', '--force'], ['staging', '--dry-run', '--force'],
    ['production', '--check-only', '--dry-run'], ['../production']
  ])('rejects malformed or ambiguous arguments before reading files or executing commands: %j', (args) => {
    expect(() => main(args)).toThrow()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.exec).not.toHaveBeenCalled()
  })

  it('rejects a wrong repository before fetch or deployment', () => {
    state.remote = 'https://github.com/adme-dev/other-dashboard.git'
    expect(() => main(['production'])).toThrow('Wrong source repository')
    expect(gitCalls()).toEqual([['rev-parse', 'HEAD'], ['remote', 'get-url', 'origin']])
    expect(wranglerCalls()).toEqual([])
  })

  it.each(['fetch origin main', 'merge-base --is-ancestor origin/main HEAD'])('propagates %s failure and never invokes Wrangler', (command) => {
    const failure = new Error(command === 'fetch origin main' ? 'fetch unavailable' : 'stale ancestry')
    failures.set(command, failure)
    expect(() => main(['production'])).toThrow(failure)
    expect(gitCalls().at(-1)?.join(' ')).toBe(command)
    expect(wranglerCalls()).toEqual([])
  })

  it('rejects a production commit ahead of current main even when ancestry succeeds', () => {
    state.main = 'b'.repeat(40)
    expect(() => main(['production'])).toThrow('Production must be exact current main')
    expect(gitCalls()).toContainEqual(['fetch', 'origin', 'main'])
    expect(gitCalls()).toContainEqual(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])
    expect(wranglerCalls()).toEqual([])
  })

  it.each([
    ' M workers/page-studio-management/src/index.ts',
    'M  .verification/tracked-evidence.json',
    '?? unrelated.txt',
    '?? .verification-lookalike/result.json',
    '?? workers/page-studio-management/src/index.ts',
    '?? workers/page-studio-management/wrangler.production.jsonc',
    '?? .verification/allowed.json\n M server/utils/auth.ts'
  ])('rejects dirty or untracked release source: %s', (status) => {
    state.status = status
    expect(() => main(['production'])).toThrow('Release source must be clean')
    expect(wranglerCalls()).toEqual([])
  })

  it.each(['src/index.ts', 'wrangler.production.jsonc'])('requires tracked %s even if status appears clean', (file) => {
    const failure = new Error(`untracked entry/config: ${file}`)
    failures.set(trackedFiles('production').join(' '), failure)
    expect(() => main(['production'])).toThrow(failure)
    expect(wranglerCalls()).toEqual([])
  })

  it.each(['production', 'staging'])('admits clean %s only after every Git guard and annotates the exact source', (environment) => {
    state.remote = 'git@github.com:adme-dev/dashboard.git'
    state.status = '?? .verification/local/result.json\n?? .verification/check.log\n'
    if (environment === 'staging') state.main = 'b'.repeat(40)
    main([environment])
    expect(gitCalls()).toEqual([
      ['rev-parse', 'HEAD'], ['remote', 'get-url', 'origin'], ['fetch', 'origin', 'main'],
      ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'],
      ...(environment === 'production' ? [['rev-parse', 'origin/main']] : []),
      ['status', '--porcelain', '--untracked-files=all'], trackedFiles(environment)
    ])
    expect(wranglerCalls()).toEqual([[
      process.execPath,
      [`${root}node_modules/wrangler/bin/wrangler.js`, 'deploy', '--config', configFile(environment), '--message', `Dashboard source ${head}`, '--tag', head],
      { cwd: root, stdio: 'inherit' }
    ]])
    expect(mocks.exec.mock.calls.at(-1)).toEqual(wranglerCalls()[0])
    expect(console.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ target: `xeroflow-page-studio-management-${environment}`, environment, source: head, mode: 'deploy' }))
  })

  it.each(['staging', 'production'])('permits local %s dry runs without fetching and always supplies --dry-run', (environment) => {
    state.status = ' M local-work.ts'
    state.remote = 'https://example.invalid/local-checkout'
    main([environment, '--dry-run'])
    expect(gitCalls()).toEqual([['rev-parse', 'HEAD']])
    expect(wranglerCalls()).toHaveLength(1)
    expect(wranglerCalls()[0]?.[1]).toEqual([
      `${root}node_modules/wrangler/bin/wrangler.js`, 'deploy', '--config', configFile(environment),
      '--message', `Dashboard source ${head}`, '--tag', head,
      '--dry-run', '--outdir', `${root}.verification/management-worker-${environment}`
    ])
  })

  it('performs configuration-only checks without fetching or invoking Wrangler', () => {
    state.status = ' M local-work.ts'
    main(['production', '--check-only'])
    expect(gitCalls()).toEqual([['rev-parse', 'HEAD']])
    expect(wranglerCalls()).toEqual([])
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"mode":"--check-only"'))
  })

  it.each([undefined, '--dry-run', '--check-only'])('rejects malformed source identity in %s mode', (mode) => {
    state.source = 'not-a-commit'
    expect(() => main(mode ? ['production', mode] : ['production'])).toThrow()
    expect(wranglerCalls()).toEqual([])
  })

  it.each([undefined, '--dry-run', '--check-only'])('validates configuration before Git/Wrangler in %s mode', (mode) => {
    mocks.read.mockReturnValue(JSON.stringify({ ...config('production'), workers_dev: true }))
    expect(() => main(mode ? ['production', mode] : ['production'])).toThrow()
    expect(mocks.exec).not.toHaveBeenCalled()
  })

  it('propagates Wrangler failure unchanged without retrying deployment', () => {
    deploymentFailure = new Error('Wrangler upload outcome unknown')
    expect(() => main(['production'])).toThrow(deploymentFailure)
    expect(wranglerCalls()).toHaveLength(1)
    expect(gitCalls().filter(args => args[0] === 'fetch')).toHaveLength(1)
  })
})
