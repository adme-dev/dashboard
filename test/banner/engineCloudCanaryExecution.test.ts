import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import { deploymentConfig } from '../../scripts/banner-studio/prepare-engine-cloud-canary.mjs'

// Production worker.ts compiled unmodified. Only `cloudflare:workers` base classes are
// stubbed; executeContainer/destroyContainer/run/alarm are the real implementations,
// driven through a fake platform Container + port transport. Nothing native launches.
const NAME = 'banner-native-canary-once-v1'
const PACKAGE = 'a'.repeat(64)
const IMAGE = `registry.cloudflare.com/${'b'.repeat(32)}/banner-engine-native-canary@sha256:${'c'.repeat(64)}`
const BOOT = '0f0e0d0c-0b0a-4908-8706-050403020100'
const ENTRYPOINT = ['/bin/sh', '-c',
  'set -eu; mountpoint -q /tmp || mount -t tmpfs none /tmp; mountpoint -q /tmp; export TMPDIR=/tmp; exec node /opt/canary/supervisor.mjs']
const stub = `export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env } }
export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env } }`

type Stored = {
  state: string
  consumedAt: number
  deadline: number
  packageSha256: string
  outerImage: string
  bootId?: string
  receipt?: unknown
  outerDestroyed?: boolean
}
type Canary = { run(...args: unknown[]): Promise<Stored>, status(): Promise<Stored | null>, alarm(): Promise<void> }
let NativeCanary: new (ctx: unknown, env: unknown) => Canary
let directory: string
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'banner-native-canary-exec-'))
  const bundle = await build({ entryPoints: [resolve('workers/banner-engine/canary/worker.ts')], bundle: true,
    format: 'esm', platform: 'neutral', write: false, plugins: [{ name: 'workers-stub', setup(b) {
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'cloudflare-workers', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }))
    } }] })
  const file = join(directory, 'worker.mjs')
  await writeFile(file, bundle.outputFiles[0]!.text)
  NativeCanary = (await import(/* @vite-ignore */ pathToFileURL(file).href)).NativeCanary
})
afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const passed = (bootId = BOOT, cleanup: Record<string, unknown> = { innerRemoved: true, scratchRemoved: true, deliveryFenced: true }) =>
  ({ schema: 'banner-native-canary-v1', status: 'passed', bootId, packageSha256: PACKAGE, cleanup })
const json = (value: unknown) => new Response(JSON.stringify(value))

type Options = {
  ready?: (attempt: number) => Response | Promise<Response>
  run?: () => Response | Promise<Response>
  destroyFails?: boolean
  alreadyRunning?: boolean
  noContainer?: boolean
  onReady?: (storage: Map<string, unknown>) => void
  onFirstSync?: () => void
}
function platform(options: Options = {}) {
  const log: string[] = []
  const storage = new Map<string, unknown>()
  const starts: unknown[] = []
  const posts: { url: string, init: RequestInit }[] = []
  let readyAttempts = 0
  let syncs = 0
  const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value)
  const tx = {
    get: async (key: string) => clone(storage.get(key)),
    put: async (key: string, value: Stored) => {
      log.push(`put:${value.state}${value.bootId ? ':boot' : ''}`)
      storage.set(key, clone(value))
    },
    setAlarm: async (at: number) => {
      log.push('setAlarm')
      storage.set('alarm', at)
    }
  }
  const container = {
    running: !!options.alreadyRunning,
    start(opts: unknown) {
      log.push('start')
      starts.push(structuredClone(opts))
      this.running = true
    },
    async setInactivityTimeout(ms: number) {
      log.push(`inactivity:${ms}`)
    },
    getTcpPort(port: number) {
      log.push(`port:${port}`)
      return { fetch: async (url: string, init: RequestInit = {}) => {
        if (url === 'http://canary/ready' && !init.method) {
          log.push('ready')
          const response = await (options.ready ?? (() => json({ bootId: BOOT, packageSha256: PACKAGE })))(readyAttempts++)
          options.onReady?.(storage)
          return response
        }
        log.push('post')
        posts.push({ url, init })
        return (options.run ?? (() => json(passed())))()
      } }
    },
    async destroy() {
      log.push('destroy')
      if (!options.destroyFails) this.running = false
    }
  }
  const ID = { equals: (other: unknown) => other === ID }
  const ctx = {
    id: ID,
    container: options.noContainer ? undefined : container,
    storage: { get: tx.get, transaction: async (fn: (t: typeof tx) => unknown) => fn(tx), sync: async () => {
      log.push('sync')
      if (syncs++ === 0) options.onFirstSync?.()
    } }
  }
  const env = { NATIVE_CANARY: { idFromName: (name: string) => name === NAME ? ID : {} },
    BANNER_NATIVE_CANARY_ENABLED: 'true', BANNER_NATIVE_CANARY_PACKAGE_SHA256: PACKAGE, BANNER_NATIVE_CANARY_OUTER_IMAGE: IMAGE }
  return { canary: new NativeCanary(ctx, env), log, storage, starts, posts, container, readyAttempts: () => readyAttempts }
}

describe('native canary production execution path over fake platform transport', () => {
  it('persists consumption before launch, uses the trusted entrypoint, records boot before one POST, then destroys', async () => {
    const timeouts = vi.spyOn(AbortSignal, 'timeout')
    const p = platform()
    const result = await p.canary.run()
    expect(p.log).toEqual(['put:consumed', 'setAlarm', 'sync', 'start', 'inactivity:300000', 'port:8080', 'ready',
      'put:consumed:boot', 'sync', 'post', 'destroy', 'put:finished:boot'])
    expect(p.starts).toEqual([{ enableInternet: false, entrypoint: ENTRYPOINT }])
    expect(p.posts).toHaveLength(1)
    expect(p.posts[0]!.url).toBe('http://canary/run')
    expect(p.posts[0]!.init).toMatchObject({ method: 'POST', headers: { 'content-length': '0', 'x-canary-boot': BOOT } })
    expect(p.posts[0]!.init.body).toBeUndefined()
    expect(result).toMatchObject({ state: 'finished', bootId: BOOT, outerDestroyed: true, packageSha256: PACKAGE, outerImage: IMAGE })
    expect(result.receipt).toEqual(passed())
    expect(p.storage.get('alarm')).toBe(result.deadline)
    expect(result.deadline - result.consumedAt).toBe(300000)
    // Readiness probes are 2 s; the single POST is bounded 5 s inside the durable deadline.
    expect(timeouts.mock.calls[0]![0]).toBe(2000)
    const postTimeout = timeouts.mock.calls.at(-1)![0]
    expect(postTimeout).toBeGreaterThan(290000)
    expect(postTimeout).toBeLessThanOrEqual(295000)
    // A later call returns the record; nothing restarts.
    expect(await p.canary.run()).toEqual(result)
    expect(p.starts).toHaveLength(1)
  })

  it('launch literal is syntactically valid POSIX sh and execs the image entrypoint argv unchanged', () => {
    // Parse only (-n); nothing is executed or mounted locally.
    expect(spawnSync('/bin/sh', ['-n', '-c', ENTRYPOINT[2]!]).status).toBe(0)
    expect(ENTRYPOINT[2]!.endsWith('; exec node /opt/canary/supervisor.mjs')).toBe(true)
    expect(ENTRYPOINT[2]!.indexOf('mount -t tmpfs none /tmp')).toBeLessThan(ENTRYPOINT[2]!.lastIndexOf('mountpoint -q /tmp'))
  })

  it('retries readiness only, never the POST, and starts exactly once', async () => {
    const p = platform({ ready: attempt => attempt < 2 ? Promise.reject(new Error('not-listening')) : json({ bootId: BOOT, packageSha256: PACKAGE }) })
    expect((await p.canary.run()).state).toBe('finished')
    expect(p.readyAttempts()).toBe(3)
    expect(p.starts).toHaveLength(1)
    expect(p.posts).toHaveLength(1)
  })

  it('a never-ready VM (e.g. entrypoint /tmp mount failure) hits the readiness deadline, sends no POST and is destroyed', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    const p = platform({ ready: () => Promise.reject(new Error('exited')) })
    const pending = p.canary.run()
    await vi.advanceTimersByTimeAsync(46000)
    const result = await pending
    expect(result).toMatchObject({ state: 'uncertain', outerDestroyed: true })
    expect(result.bootId).toBeUndefined()
    expect(p.posts).toHaveLength(0)
    expect(p.log.at(-2)).toBe('destroy')
  })

  it.each([
    ['wrong boot', () => json({ bootId: 'not-a-boot', packageSha256: PACKAGE })],
    ['wrong package', () => json({ bootId: BOOT, packageSha256: 'd'.repeat(64) })],
    ['oversized readiness', () => json({ bootId: BOOT, packageSha256: PACKAGE, pad: 'x'.repeat(2048) })]
  ])('rejects %s before persisting a boot or sending work', async (_name, ready) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
    const p = platform({ ready })
    const pending = p.canary.run()
    await vi.advanceTimersByTimeAsync(46000)
    expect(await pending).toMatchObject({ state: 'uncertain', outerDestroyed: true })
    expect(p.posts).toHaveLength(0)
    expect(p.log).not.toContain('put:consumed:boot')
  })

  it.each([
    ['other boot', () => json(passed('11111111-1111-4111-8111-111111111111'))],
    ['failed status', () => json({ ...passed(), status: 'failed' })],
    ['unverified scratch cleanup', () => json(passed(BOOT, { innerRemoved: true, scratchRemoved: false, deliveryFenced: true }))],
    ['missing cleanup', () => json({ ...passed(), cleanup: undefined })],
    ['HTTP 409', () => new Response('{"status":"failed-or-consumed"}', { status: 409 })],
    ['receipt over 128 KiB', () => json({ ...passed(), pad: 'x'.repeat(131072) })],
    ['transport loss', () => Promise.reject(new Error('connection reset'))]
  ])('%s receipt stays spent and uncertain, without retry, and still destroys', async (_name, run) => {
    const p = platform({ run })
    const result = await p.canary.run()
    expect(result).toMatchObject({ state: 'uncertain', bootId: BOOT, outerDestroyed: true })
    expect(result.receipt).toBeUndefined()
    expect(p.posts).toHaveLength(1)
    expect(p.log.filter(event => event === 'destroy')).toHaveLength(1)
    expect((await p.canary.run()).state).toBe('uncertain')
    expect(p.starts).toHaveLength(1)
  })

  it('success with unverified destruction is uncertain, and the alarm retries termination only', async () => {
    const p = platform({ destroyFails: true })
    const result = await p.canary.run()
    expect(result).toMatchObject({ state: 'uncertain', outerDestroyed: false })
    expect(result.receipt).toEqual(passed())
    await expect(p.canary.alarm()).rejects.toThrow('canary-destroy-unverified')
    expect(await p.canary.status()).toMatchObject({ state: 'stopped', outerDestroyed: false })
    p.container.destroy = async () => {
      p.log.push('destroy')
      p.container.running = false
    }
    await p.canary.alarm()
    expect(await p.canary.status()).toMatchObject({ state: 'stopped', outerDestroyed: true })
    expect(p.starts).toHaveLength(1)
    expect(p.posts).toHaveLength(1)
  })

  it('an alarm that stops the record during readiness fences delivery: no boot, no POST', async () => {
    const p = platform({ onReady: storage => storage.set('permanent-consumption-v1', { ...(storage.get('permanent-consumption-v1') as object), state: 'stopped' }) })
    const result = await p.canary.run()
    expect(result.state).toBe('stopped')
    expect(p.posts).toHaveLength(0)
    expect(p.log).toContain('destroy')
  })

  it('a durable deadline that passes before launch prevents start but still spends and destroys', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Simulate a delayed isolate between the durable consumption sync and startup.
    const late = platform({ onFirstSync: () => vi.setSystemTime(Date.now() + 300001) })
    expect(await late.canary.run()).toMatchObject({ state: 'uncertain', outerDestroyed: true })
    expect(late.starts).toHaveLength(0)
    expect(late.log).toEqual(['put:consumed', 'setAlarm', 'sync', 'destroy', 'put:uncertain'])
  })

  it('an already-running VM is never reused or posted to, but is spent and destroyed', async () => {
    const busy = platform({ alreadyRunning: true })
    expect(await busy.canary.run()).toMatchObject({ state: 'uncertain', outerDestroyed: true })
    expect(busy.starts).toHaveLength(0)
    expect(busy.posts).toHaveLength(0)
    expect(busy.log).toContain('destroy')
  })

  it('a missing container binding is spent and uncertain, never started', async () => {
    const p = platform({ noContainer: true })
    expect(await p.canary.run()).toMatchObject({ state: 'uncertain', outerDestroyed: false })
  })
})

describe('release configuration generator', () => {
  it('forces admission false even when the template enables it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'banner-native-canary-config-'))
    try {
      const template = JSON.parse(await readFile(resolve('workers/banner-engine/canary/wrangler.jsonc'), 'utf8'))
      template.vars.BANNER_NATIVE_CANARY_ENABLED = 'true'
      await mkdir(join(root, '.artifacts/context'), { recursive: true })
      await writeFile(join(root, 'wrangler.jsonc'), JSON.stringify(template))
      const manifest = '{"schema":"test"}\n'
      await writeFile(join(root, '.artifacts/context/package.json'), manifest)
      const result = await deploymentConfig(IMAGE, { directory: root })
      expect(result).toEqual({ path: join(root, '.artifacts/wrangler.release.json'), enabled: false, image: IMAGE })
      const generated = JSON.parse(await readFile(result.path, 'utf8'))
      expect(generated.vars).toEqual({ BANNER_NATIVE_CANARY_ENABLED: 'false', BANNER_NATIVE_CANARY_OUTER_IMAGE: IMAGE,
        BANNER_NATIVE_CANARY_PACKAGE_SHA256: createHash('sha256').update(manifest).digest('hex') })
      expect(generated.containers[0].image).toBe(IMAGE)
      expect(generated.containers[0]).not.toHaveProperty('image_build_context')
      expect(generated).not.toHaveProperty('$schema')
      expect(generated.main).toBe('../worker.ts')
      expect(generated.workers_dev).toBe(false)
      expect(generated.preview_urls).toBe(false)
      // Exclusive write: never overwrites an existing release config.
      await expect(deploymentConfig(IMAGE, { directory: root })).rejects.toThrow()
      await expect(deploymentConfig(IMAGE.replace('@sha256:', ':'), { directory: root })).rejects.toThrow('digest-pinned')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
