// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BannerEngineRequest } from '../../shared/bannerEngine'
import { EngineAdapterError, type EngineAdapter } from '../../workers/banner-engine/runner/index'
import { createLinuxEngineAdapter } from '../../workers/banner-engine/runtime/index'
import { runEngineWorkerOnce } from '../../workers/banner-engine/transport/index'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn }))

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const native = Buffer.from('private fixture native document')
const executableSha256 = '486d0d83d6cdacec3ec76ff6e30e47d5d2c207ad15084631a61902df157e8c8d'
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
let root: string
let request: BannerEngineRequest
let adapter: EngineAdapter
let actions: Record<string, unknown>[]
let controller: AbortController
let cleanup: 'verified' | 'remove-failed' | 'readback-failed' | 'still-present'
let cancelOnStart: boolean
let pauseCleanup: boolean
let releaseCleanup: (() => void) | undefined
let nativeSettled: Promise<void> | undefined

const configuration = () => ({
  origin: 'https://engine.example', serviceToken: 'service-secret-'.repeat(4),
  stagingRoot: join(root, 'staging'), workspaceRoot: join(root, 'attempts'),
  adapter, signal: controller.signal, pollIntervalMs: 5, abortGraceMs: 100,
  fetch: async (_url: string | URL | Request, init?: RequestInit) => {
    const action = JSON.parse(String(init?.body))
    actions.push(action)
    if (action.action === 'claim') return json({ request, claimToken: 'a'.repeat(64) })
    if (action.action === 'input') return json({ base64: native.toString('base64') })
    if (action.action === 'status') return json({ status: 'running' })
    // Even a server claiming a terminal outcome cannot override local uncertainty.
    return json({ status: controller.signal.aborted ? 'cancelled' : 'failed' })
  }
})
const receipt = async () => JSON.parse(await readFile(join(root, 'attempts', hash(request.attemptId), 'receipt.json'), 'utf8'))

beforeEach(async () => {
  root = await mkdtemp(join(await realpath(tmpdir()), 'banner-termination-'))
  controller = new AbortController()
  actions = []
  cleanup = 'remove-failed'
  cancelOnStart = false
  pauseCleanup = false
  releaseCleanup = undefined
  nativeSettled = undefined
  request = {
    version: 1, jobId: randomUUID(), attemptId: randomUUID(), projectId: randomUUID(), clientId: null,
    sourceRevision: 'rev-1', sourceHash: hash('saved source'), engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview',
    input: { id: randomUUID(), sha256: hash(native), bytes: native.length, mimeType: 'application/x-photocraft' },
    output: { mimeType: 'image/png', width: 2, height: 3 },
    limits: { maxInputBytes: 1024, maxOutputBytes: 4096, maxPixels: 100, timeoutMs: 2000, memoryMb: 256, cpuCount: 1, maxProcesses: 16, maxLogBytes: 128 },
    deadlineAt: new Date(Date.now() + 60000).toISOString()
  }
  // Synthetic accepted manifest only exercises loading/binding; it is not runtime proof.
  const manifestPath = join(root, 'runtime.json')
  const acceptancePath = join(root, 'acceptance.json')
  const imageId = `sha256:${'a'.repeat(64)}`
  await writeFile(acceptancePath, 'fixture acceptance')
  const proof = JSON.stringify({ imageId, executableSha256, engine: 'photocraft', version: '0.16.0', acceptancePath, acceptanceSha256: hash('fixture acceptance') })
  await writeFile(join(root, 'photocraft-capability-proof.json'), proof)
  await writeFile(manifestPath, JSON.stringify({ status: 'accepted', imageId,
    engines: { photocraft: { version: '0.16.0', executableSha256, capabilityProofSha256: hash(proof) } } }))
  adapter = await createLinuxEngineAdapter('photocraft', manifestPath)
  await mkdir(join(root, 'staging'))
  await mkdir(join(root, 'attempts'))

  let name = ''
  let removed = false
  spawn.mockReset()
  spawn.mockImplementation((command: string, args: string[]) => {
    if (command !== 'docker') throw new Error('Unexpected executable')
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn()
    })
    const finish = (code: number, output = '') => {
      child.stdout.end(output)
      child.stderr.end()
      child.emit('close', code)
    }
    queueMicrotask(() => {
      if (args[0] === 'create') {
        name = args[args.indexOf('--name') + 1]!
        finish(0, name)
      } else if (args[0] === 'start') {
        if (cancelOnStart) controller.abort()
        // Fail after creation; the real runtime must now verify container absence.
        finish(1, 'private Docker diagnostic')
      } else if (args[0] === 'rm') {
        removed = cleanup === 'verified' || cleanup === 'readback-failed'
        finish(cleanup === 'remove-failed' ? 1 : 0)
      } else if (args[0] === 'ps') {
        const complete = () => finish(cleanup === 'readback-failed' && removed ? 1 : 0, removed ? '' : name)
        if (pauseCleanup) {
          pauseCleanup = false
          releaseCleanup = complete
        } else complete()
      } else {
        finish(1, 'Unexpected Docker command')
      }
    })
    return child
  })
})

afterEach(async () => {
  releaseCleanup?.()
  await nativeSettled
  await rm(root, { recursive: true, force: true })
})

describe('native adapter termination evidence through runner and transport', () => {
  it.each([
    ['remove-failed', false], ['readback-failed', false], ['still-present', false],
    ['remove-failed', true], ['readback-failed', true], ['still-present', true]
  ] as const)('holds %s cleanup with cancellation=%s as uncertain', async (failure, cancelled) => {
    cleanup = failure
    cancelOnStart = cancelled
    const outcome = await runEngineWorkerOnce(configuration())
    expect(outcome).toMatchObject({ status: 'uncertain', code: cancelled ? 'cancelled' : 'engine-failed' })
    expect(await receipt()).toMatchObject({ state: 'failed', termination: 'unconfirmed', automaticRetry: false })
    expect(actions.filter(action => action.action === 'fail')).toEqual([
      expect.objectContaining({ termination: 'unconfirmed', code: cancelled ? 'cancelled' : 'engine-failed' })
    ])
    expect(actions.some(action => action.action === 'complete')).toBe(false)
    const stored = JSON.stringify(await receipt())
    expect(stored).not.toMatch(/private Docker|private fixture|cleanup unverified/)
    expect(await runEngineWorkerOnce(configuration())).toMatchObject({ status: cancelled ? 'failed' : 'uncertain' })
    expect(spawn.mock.calls.filter(([, args]) => args[0] === 'create')).toHaveLength(1)
  })

  it.each([false, true])('accepts explicitly verified native cleanup with cancellation=%s', async (cancelled) => {
    cleanup = 'verified'
    cancelOnStart = cancelled
    expect(await runEngineWorkerOnce(configuration())).toMatchObject({ status: 'failed', code: cancelled ? 'cancelled' : 'engine-failed' })
    expect(await receipt()).toMatchObject({ termination: 'adapter-settled' })
    expect(actions.find(action => action.action === 'fail')).toMatchObject({ termination: 'adapter-settled' })
  })

  it.each(['unknown', 'unconfirmed'] as const)('does not turn an %s rejection during abort grace into termination proof', async (kind) => {
    adapter.run = ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        queueMicrotask(() => reject(kind === 'unknown' ? new Error('private diagnostic') : new EngineAdapterError('engine-failed')))
      }, { once: true })
      controller.abort()
    })
    expect(await runEngineWorkerOnce(configuration())).toMatchObject({ status: 'uncertain', code: 'cancelled' })
    expect(await receipt()).toMatchObject({ termination: 'unconfirmed' })
  })

  it('does not certify an arbitrary adapter rejection without cancellation', async () => {
    adapter.run = async () => {
      throw new Error('private diagnostic')
    }
    expect(await runEngineWorkerOnce(configuration())).toMatchObject({ status: 'uncertain', code: 'engine-failed' })
    expect(await receipt()).toMatchObject({ termination: 'unconfirmed' })
  })

  it.each(['verified', 'remove-failed'] as const)('keeps the uncertain receipt after %s cleanup settles beyond abort grace', async (lateCleanup) => {
    cleanup = lateCleanup
    cancelOnStart = true
    pauseCleanup = true
    const nativeRun = adapter.run
    adapter.run = (context) => {
      const running = nativeRun(context)
      nativeSettled = running.then(() => {}, () => {})
      return running
    }
    expect(await runEngineWorkerOnce({ ...configuration(), abortGraceMs: 1 })).toMatchObject({ status: 'uncertain', code: 'cancelled' })
    const before = await receipt()
    expect(before).toMatchObject({ termination: 'unconfirmed' })
    expect(releaseCleanup).toBeTypeOf('function')
    releaseCleanup!()
    releaseCleanup = undefined
    await nativeSettled
    expect(await receipt()).toEqual(before)
    expect(actions.filter(action => action.action === 'fail')).toHaveLength(1)
    expect(actions.some(action => action.action === 'complete')).toBe(false)
  })
})
