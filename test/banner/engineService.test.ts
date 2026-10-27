// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { setTimeout as realDelay } from 'node:timers/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import type { EngineAdapter } from '../../workers/banner-engine/runner/index'
import type { BannerEngineRequest } from '../../shared/bannerEngine'
import {
  inspectEngineService,
  runEngineService
} from '../../workers/banner-engine/service/index'

let root: string
let identity: { device: number, inode: number }
let stop: AbortController
let claims: string[]
let handler: (
  action: Record<string, unknown>,
  init: RequestInit
) => Promise<Response>
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex')
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' }
  })
const token = 'private-service-token-'.repeat(3)
const native = 'private native source'
const claimToken = 'b'.repeat(64)
function adapter(id: 'photocraft' | 'vectorcraft'): EngineAdapter {
  return {
    capability: {
      engine: { id, version: id === 'photocraft' ? '0.16.0' : '0.17.0' },
      operation: 'render-preview',
      inputMimeType:
        id === 'photocraft'
          ? 'application/x-photocraft'
          : 'application/x-vectorcraft',
      executableSha256: hash('executable'),
      capabilityProofSha256: hash('proof')
    },
    async run() {
      throw new Error('Unexpected native execution')
    }
  }
}
const workers = () =>
  (['photocraft', 'vectorcraft'] as const).map(id => ({
    adapter: adapter(id),
    origin: 'https://engine.example',
    serviceToken: token,
    pollIntervalMs: 5,
    requestTimeoutMs: 50,
    abortGraceMs: 10,
    fetch: async (_url: unknown, init?: RequestInit) => {
      const action = JSON.parse(String(init?.body))
      if (action.action === 'claim') claims.push(action.engine.id)
      return handler(action, init!)
    }
  }))
const configuration = () => ({
  enabled: 'true',
  root,
  identity,
  workers: workers(),
  signal: stop.signal,
  idleMinMs: 1000,
  idleMaxMs: 4000,
  shutdownGraceMs: 1000
})
async function journal() {
  return JSON.parse(
    await readFile(join(root, 'admission', 'state.json'), 'utf8')
  )
}
async function waitUntil(check: () => boolean | Promise<boolean>) {
  for (let count = 0; count < 200; count++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Condition did not settle')
}
async function gateExists() {
  return (await readdir(root)).includes('admission')
}
function request(): BannerEngineRequest {
  return {
    version: 1,
    jobId: randomUUID(),
    attemptId: randomUUID(),
    projectId: randomUUID(),
    clientId: null,
    sourceRevision: '1',
    sourceHash: hash('source'),
    engine: { id: 'photocraft', version: '0.16.0' },
    operation: 'render-preview',
    input: {
      id: randomUUID(),
      bytes: Buffer.byteLength(native),
      sha256: hash(native),
      mimeType: 'application/x-photocraft'
    },
    output: { mimeType: 'image/png', width: 2, height: 2 },
    limits: {
      maxInputBytes: 1024,
      maxOutputBytes: 4096,
      maxPixels: 100,
      timeoutMs: 5000,
      memoryMb: 256,
      cpuCount: 1,
      maxProcesses: 16,
      maxLogBytes: 128
    },
    deadlineAt: new Date(Date.now() + 60000).toISOString()
  }
}
beforeEach(async () => {
  root = await mkdtemp(join(await realpath(tmpdir()), 'engine-service-'))
  await mkdir(join(root, 'staging'), { mode: 0o700 })
  await mkdir(join(root, 'attempts'), { mode: 0o700 })
  const info = await stat(root)
  identity = { device: info.dev, inode: info.ino }
  stop = new AbortController()
  claims = []
  handler = async () => json({ request: null })
})
afterEach(async () => {
  stop.abort()
  vi.useRealTimers()
  await rm(root, { recursive: true, force: true })
})

describe('bounded engine service', () => {
  it.each([undefined, 'false', 'TRUE'])(
    'is default off with enable value %s and touches no host or transport',
    async (enabled) => {
      expect(
        await runEngineService({
          ...configuration(),
          enabled,
          root: '/missing/private/service'
        })
      ).toEqual({ status: 'disabled' })
      expect(claims).toEqual([])
      expect(await readdir(root)).toEqual(['attempts', 'staging'])
    }
  )
  it('exclusively owns the global slot before claiming across concurrent service instances', async () => {
    let release!: () => void
    handler = async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return json({ request: null })
    }
    const running = runEngineService({
      ...configuration(),
      workers: workers().map(worker => ({
        ...worker,
        requestTimeoutMs: 5000
      }))
    })
    await waitUntil(() => claims.length === 1)
    expect(await runEngineService(configuration())).toEqual({
      status: 'held',
      reason: 'admission-exists'
    })
    expect(claims).toEqual(['photocraft'])
    stop.abort()
    release()
    await running
  })
  it('durably holds lost claim acknowledgement across restart without a second claim', async () => {
    handler = async () => {
      throw new Error('secret remote diagnostics')
    }
    expect(await runEngineService(configuration())).toEqual({
      status: 'held',
      reason: 'worker-uncertain'
    })
    expect(await journal()).toMatchObject({
      phase: 'held',
      reason: 'worker-uncertain',
      automaticRetry: false
    })
    expect(await runEngineService(configuration())).toEqual({
      status: 'held',
      reason: 'admission-exists'
    })
    expect(claims).toHaveLength(1)
    const state = await readFile(join(root, 'admission', 'state.json'), 'utf8')
    for (const secret of [
      token,
      claimToken,
      native,
      'secret remote diagnostics'
    ])
      expect(state).not.toContain(secret)
  })
  it.each(['empty', 'malformed', 'settled'])(
    'never reclaims an existing %s gate by guessing process death or cleanup',
    async (kind) => {
      await mkdir(join(root, 'admission'), { mode: 0o700 })
      if (kind !== 'empty')
        await writeFile(
          join(root, 'admission', 'state.json'),
          kind === 'malformed'
            ? '{'
            : JSON.stringify({ phase: 'stopped', pid: 99999999 })
        )
      expect(await runEngineService(configuration())).toEqual({
        status: 'held',
        reason: 'admission-exists'
      })
      expect(claims).toEqual([])
      expect(await gateExists()).toBe(true)
    }
  )
  it('alternates engines with bounded exponential idle backoff and wakes promptly on stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const running = runEngineService(configuration())
    // Filesystem promises remain real; fake only timers, then wait on claim callbacks.
    const settle = async (count: number) => {
      for (let n = 0; claims.length < count && n < 500; n++) await realDelay(2)
      expect(claims).toHaveLength(count)
      for (let n = 0; n < 500; n++) {
        if ((await journal()).phase === 'idle') {
          await realDelay(10)
          return
        }
        await realDelay(2)
      }
      throw new Error('Idle journal missing')
    }
    await settle(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(claims).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await settle(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(claims).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    await settle(3)
    await vi.advanceTimersByTimeAsync(4000)
    await settle(4)
    await vi.advanceTimersByTimeAsync(4000)
    await settle(5)
    stop.abort()
    expect(await running).toEqual({ status: 'stopped' })
    expect(claims).toEqual([
      'photocraft',
      'vectorcraft',
      'photocraft',
      'vectorcraft',
      'photocraft'
    ])
    expect(await gateExists()).toBe(false)
    expect((await readdir(join(root, 'history'))).length).toBe(1)
    stop = new AbortController()
    stop.abort()
    expect(await runEngineService(configuration())).toEqual({
      status: 'stopped'
    })
  })
  it('holds configuration failure before any transport and never persists credentials', async () => {
    const config = configuration()
    config.workers[1]!.origin = 'https://secret@example.com'
    expect(await runEngineService(config)).toEqual({
      status: 'held',
      reason: 'configuration-invalid'
    })
    expect(claims).toEqual([])
    expect(await runEngineService(configuration())).toEqual({
      status: 'held',
      reason: 'admission-exists'
    })
  })
  it('holds runtime initialization failure under admission before another process can start', async () => {
    let initialized = false
    expect(
      await runEngineService({
        ...configuration(),
        workers: async () => {
          initialized = true
          expect(await inspectEngineService({ root, identity })).toEqual({
            status: 'held',
            ready: false
          })
          throw new Error(token)
        }
      })
    ).toEqual({ status: 'held', reason: 'configuration-invalid' })
    expect(initialized).toBe(true)
    expect(await runEngineService(configuration())).toEqual({
      status: 'held',
      reason: 'admission-exists'
    })
    expect(claims).toEqual([])
  })
  it.each(['missing', 'permissions', 'identity', 'symlink'])(
    'refuses %s private root without creating replacement storage',
    async (kind) => {
      const config = configuration()
      if (kind === 'missing')
        await rm(join(root, 'staging'), { recursive: true })
      if (kind === 'permissions') await chmod(root, 0o755)
      if (kind === 'identity')
        config.identity = { ...identity, inode: identity.inode + 1 }
      if (kind === 'symlink') {
        await symlink(root, root + '-link')
        config.root = root + '-link'
      }
      try {
        expect(await runEngineService(config)).toEqual({
          status: 'configuration-error',
          reason: 'storage-unavailable'
        })
        expect(claims).toEqual([])
      } finally {
        if (kind === 'symlink') await rm(root + '-link')
      }
    }
  )
  it('reports only content-free admission readiness without claiming or parsing arbitrary state', async () => {
    expect(await inspectEngineService({ root, identity })).toEqual({
      status: 'available',
      ready: false
    })
    await mkdir(join(root, 'admission'), { mode: 0o700 })
    await writeFile(
      join(root, 'admission', 'state.json'),
      JSON.stringify({ phase: token, error: native })
    )
    expect(await inspectEngineService({ root, identity })).toEqual({
      status: 'held',
      ready: false
    })
    expect(claims).toEqual([])
  })
  it.each([true, false])(
    'aborts active native work on shutdown and retains unconfirmed cleanup (%s)',
    async (unconfirmed) => {
      const job = request()
      let started = false
      const config = configuration()
      config.workers[0]!.adapter.run = async ({ signal }) => {
        started = true
        await new Promise<void>((resolve) => {
          if (!unconfirmed)
            signal.addEventListener('abort', () => resolve(), { once: true })
        })
      }
      handler = async (action) => {
        if (action.action === 'claim')
          return json({ request: job, claimToken })
        if (action.action === 'input')
          return json({ base64: Buffer.from(native).toString('base64') })
        if (action.action === 'status') return json({ status: 'running' })
        if (action.action === 'fail')
          return json({
            status:
              action.termination === 'unconfirmed' ? 'uncertain' : 'cancelled'
          })
        throw new Error('Unexpected completion')
      }
      const running = runEngineService(config)
      await waitUntil(() => started)
      stop.abort()
      expect(await running).toEqual(
        unconfirmed
          ? { status: 'held', reason: 'worker-uncertain' }
          : { status: 'stopped' }
      )
      expect(claims).toHaveLength(1)
      expect(await gateExists()).toBe(unconfirmed)
      const staged = await readdir(join(root, 'staging'))
      expect(staged).toHaveLength(1)
      expect(
        await readFile(
          join(root, 'staging', staged[0]!, 'input.native'),
          'utf8'
        )
      ).toBe(native)
    }
  )
  it('retains admission when shutdown grace expires even if the worker later settles', async () => {
    const job = request()
    let settleAdapter: (() => void) | undefined
    const config = configuration()
    config.workers[0]!.abortGraceMs = 10000
    config.workers[0]!.adapter.run = async () => {
      await new Promise<void>((resolve) => {
        settleAdapter = resolve
      })
    }
    handler = async (action) => {
      if (action.action === 'claim') return json({ request: job, claimToken })
      if (action.action === 'input')
        return json({ base64: Buffer.from(native).toString('base64') })
      if (action.action === 'status') return json({ status: 'running' })
      if (action.action === 'fail') return json({ status: 'cancelled' })
      throw new Error('Unexpected completion')
    }
    const running = runEngineService(config)
    await waitUntil(() => !!settleAdapter)
    stop.abort()
    expect(await running).toEqual({
      status: 'held',
      reason: 'shutdown-unconfirmed'
    })
    settleAdapter!()
    const staged = (await readdir(join(root, 'staging')))[0]!
    await waitUntil(
      async () =>
        JSON.parse(
          await readFile(
            join(root, 'staging', staged, 'transport.json'),
            'utf8'
          )
        ).state === 'failed'
    )
    expect(await journal()).toMatchObject({
      phase: 'held',
      reason: 'shutdown-unconfirmed'
    })
    expect(await runEngineService(configuration())).toEqual({
      status: 'held',
      reason: 'admission-exists'
    })
    expect(claims).toHaveLength(1)
  })
  it.each([
    { idleMinMs: 0 },
    { idleMaxMs: 60001 },
    { shutdownGraceMs: 0 },
    { cycleBudgetMs: Infinity }
  ])(
    'rejects unbounded or busy-loop timing %j before any claim',
    async (timing) => {
      expect(await runEngineService({ ...configuration(), ...timing })).toEqual(
        { status: 'held', reason: 'configuration-invalid' }
      )
      expect(claims).toEqual([])
    }
  )
  it('holds rather than proceeding if a durable journal update fails', async () => {
    const saved = join(root, 'admission', 'active-evidence.json')
    handler = async () => {
      // A directory at the rename destination fails even under a root test UID.
      await rename(join(root, 'admission', 'state.json'), saved)
      await mkdir(join(root, 'admission', 'state.json'), { mode: 0o700 })
      return json({ request: null })
    }
    expect(await runEngineService(configuration())).toEqual({
      status: 'held',
      reason: 'journal-unavailable'
    })
    expect(claims).toHaveLength(1)
    expect(await gateExists()).toBe(true)
    expect(JSON.parse(await readFile(saved, 'utf8'))).toMatchObject({
      phase: 'active'
    })
  })
  it('runs queued work from both engines with at most one active native adapter', async () => {
    const config = configuration()
    const jobs = config.workers.map(worker => ({
      ...request(),
      engine: worker.adapter.capability.engine,
      input: {
        ...request().input,
        mimeType: worker.adapter.capability.inputMimeType
      }
    }))
    let active = 0,
      peak = 0,
      completions = 0
    for (const worker of config.workers) {
      worker.adapter.run = async ({ outputPath }) => {
        active++
        peak = Math.max(peak, active)
        try {
          await realDelay(20)
          await writeFile(
            outputPath,
            PNG.sync.write(new PNG({ width: 2, height: 2 }))
          )
        } finally {
          active--
        }
      }
    }
    handler = async (action) => {
      if (action.action === 'claim') {
        const engine = action.engine as { id: string }
        return json({
          request: jobs.find(job => job.engine.id === engine.id),
          claimToken
        })
      }
      if (action.action === 'input')
        return json({ base64: Buffer.from(native).toString('base64') })
      if (action.action === 'status') return json({ status: 'running' })
      if (action.action === 'complete') {
        completions++
        return json({ status: 'succeeded' })
      }
      throw new Error('Unexpected failure')
    }
    const running = runEngineService(config)
    for (let n = 0; n < 600; n++) {
      if (completions === 2 && (await journal()).phase === 'settled') break
      await realDelay(5)
    }
    stop.abort()
    expect(await running).toEqual({ status: 'stopped' })
    expect(completions).toBe(2)
    expect(peak).toBe(1)
    expect(active).toBe(0)
    expect(claims).toEqual(['photocraft', 'vectorcraft'])
    expect(await readdir(join(root, 'attempts'))).toHaveLength(2)
  })
})
