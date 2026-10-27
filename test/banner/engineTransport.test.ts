// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BannerEngineRequest } from '../../shared/bannerEngine'
import type { EngineAdapter } from '../../workers/banner-engine/runner/index'
import { runEngineWorkerOnce } from '../../workers/banner-engine/transport/index'

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const native = Buffer.from('private native document')
const token = 'service-secret-'.repeat(4)
const claimToken = 'a'.repeat(64)
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
let root: string
let request: BannerEngineRequest
let adapter: EngineAdapter
let actions: Record<string, unknown>[]
let handler: (action: Record<string, unknown>, init: RequestInit) => Promise<Response>
const transportFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
  expect(String(_url)).toBe('https://engine.example/api/internal/banner-engine')
  expect(init?.redirect).toBe('error')
  expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`)
  const action = JSON.parse(String(init?.body))
  actions.push(action)
  return handler(action, init!)
})
const config = () => ({ origin: 'https://engine.example', serviceToken: token,
  stagingRoot: join(root, 'staging'), workspaceRoot: join(root, 'attempts'), adapter,
  pollIntervalMs: 5, requestTimeoutMs: 200, abortGraceMs: 20, fetch: transportFetch })
beforeEach(async () => {
  root = await mkdtemp(join(await realpath(tmpdir()), 'banner-transport-'))
  actions = []
  transportFetch.mockClear()
  request = {
    version: 1, jobId: randomUUID(), attemptId: randomUUID(), projectId: randomUUID(), clientId: null,
    sourceRevision: 'rev-1', sourceHash: hash('saved source'), engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview',
    input: { id: randomUUID(), sha256: hash(native), bytes: native.length, mimeType: 'application/x-photocraft' },
    output: { mimeType: 'image/png', width: 2, height: 3 },
    limits: { maxInputBytes: 1024, maxOutputBytes: 4096, maxPixels: 100, timeoutMs: 2000, memoryMb: 256, cpuCount: 1, maxProcesses: 16, maxLogBytes: 128 },
    deadlineAt: new Date(Date.now() + 60000).toISOString()
  }
  adapter = { capability: { engine: request.engine, operation: request.operation, inputMimeType: request.input.mimeType,
    executableSha256: hash('engine'), capabilityProofSha256: hash('proof') },
  run: vi.fn(async ({ inputPath, outputPath }) => {
    expect(await readFile(inputPath)).toEqual(native)
    await writeFile(outputPath, PNG.sync.write(new PNG({ width: 2, height: 3 })))
  }) }
  handler = async (action) => {
    if (action.action === 'claim') return json({ request, claimToken })
    if (action.action === 'input') return json({ base64: native.toString('base64') })
    if (action.action === 'status') return json({ status: 'running' })
    return json({ status: action.action === 'complete' ? 'succeeded' : 'failed' })
  }
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('authenticated one-job engine transport', () => {
  it('pulls one job, verifies/stages input and uploads bound private PNG bytes', async () => {
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'succeeded', jobId: request.jobId })
    expect(adapter.run).toHaveBeenCalledTimes(1)
    const complete = actions.find(action => action.action === 'complete')!
    const output = Buffer.from(complete.outputBase64 as string, 'base64')
    expect(PNG.sync.read(output).width).toBe(2)
    expect(complete.result).toMatchObject({ input: request.input, evidence: { editableImport: false }, output: { sha256: hash(output) } })
    expect(actions.filter(action => action.action === 'claim')).toHaveLength(1)
    const directories = await readdir(join(root, 'staging'))
    const journal = await readFile(join(root, 'staging', directories[0]!, 'transport.json'), 'utf8')
    expect(journal).not.toContain(token)
    expect(journal).not.toContain(claimToken)
    expect(journal).not.toContain(native.toString())
  })
  it('returns idle without execution for an empty queue', async () => {
    handler = async () => json({ request: null })
    expect(await runEngineWorkerOnce(config())).toEqual({ status: 'idle' })
    expect(adapter.run).not.toHaveBeenCalled()
    expect(actions).toHaveLength(1)
  })
  it.each(['http://engine.example', 'https://user:pass@engine.example', 'https://engine.example/path', 'https://engine.example/?x=1', 'https://engine.example/#secret', 'http://127.0.0.1'])('rejects unsafe origin %s before authentication leaves the worker', async (origin) => {
    await expect(runEngineWorkerOnce({ ...config(), origin })).rejects.toThrow('Invalid worker configuration')
    expect(actions).toHaveLength(0)
  })
  it('permits explicit literal loopback HTTP for local proof only', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request) => json({ request: null }))
    expect(await runEngineWorkerOnce({ ...config(), origin: 'http://127.0.0.1:1234', allowLoopbackHttp: true, fetch })).toEqual({ status: 'idle' })
    expect(String(fetch.mock.calls[0]?.[0])).toBe('http://127.0.0.1:1234/api/internal/banner-engine')
  })
  it.each(['redirect', 'response-url', 'bad-json', 'unknown-field', 'wrong-pin', 'excess-limit'])('fails closed on %s claims without execution', async (kind) => {
    handler = async () => {
      if (kind === 'redirect') return new Response('', { status: 302, headers: { location: 'https://evil.example' } })
      if (kind === 'bad-json') return new Response('{', { headers: { 'content-type': 'application/json' } })
      if (kind === 'response-url') {
        const response = json({ request, claimToken })
        Object.defineProperty(response, 'url', { value: 'https://evil.example' })
        return response
      }
      if (kind === 'unknown-field') return json({ request, claimToken, url: 'https://evil.example' })
      if (kind === 'wrong-pin') return json({ request: { ...request, engine: { ...request.engine, version: '99.0.0' } }, claimToken })
      return json({ request: { ...request, limits: { ...request.limits, maxInputBytes: 16777217 } }, claimToken })
    }
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain' })
    expect(adapter.run).not.toHaveBeenCalled()
    expect(actions).toHaveLength(1)
  })
  it('bounds streamed bodies even when Content-Length lies', async () => {
    let cancelled = false
    handler = async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) },
      cancel() { cancelled = true }
    }), { headers: { 'content-type': 'application/json', 'content-length': '2' } })
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain' })
    expect(cancelled).toBe(true)
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('times out a stalled response body without executing', async () => {
    handler = async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } })
    expect(await runEngineWorkerOnce({ ...config(), requestTimeoutMs: 20 })).toMatchObject({ status: 'uncertain' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('accepts tiny input-response chunks with one bounded body allocation', async () => {
    const normal = handler
    handler = async (action, init) => {
      if (action.action !== 'input') return normal(action, init)
      const bytes = Buffer.from(JSON.stringify({ base64: native.toString('base64') }))
      let offset = 0
      return new Response(new ReadableStream({
        pull(controller) {
          if (offset < bytes.length) controller.enqueue(bytes.subarray(offset, ++offset))
          else controller.close()
        }
      }), { headers: { 'content-type': 'application/json' } })
    }
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'succeeded' })
    expect(adapter.run).toHaveBeenCalledTimes(1)
  })
  it.each([0, 1])('bounds endless %s-byte chunks without relying on the timeout task', async (size) => {
    let pulls = 0
    let cancelled = false
    const normal = handler
    handler = async (action, init) => {
      if (action.action !== 'input') return normal(action, init)
      return new Response(new ReadableStream({
        pull(controller) {
          pulls++
          controller.enqueue(new Uint8Array(size))
        },
        cancel() { cancelled = true }
      }), { headers: { 'content-type': 'application/json' } })
    }
    expect(await runEngineWorkerOnce({ ...config(), requestTimeoutMs: 1000 })).toMatchObject({ status: 'uncertain' })
    expect(pulls).toBeLessThanOrEqual(65538)
    expect(cancelled).toBe(true)
    expect(adapter.run).not.toHaveBeenCalled()
    expect(actions.some(action => action.action === 'complete')).toBe(false)
  })
  it.each(['hash', 'length', 'base64', 'url'])('rejects invalid input %s before execution', async (kind) => {
    const normal = handler
    handler = async (action, init) => action.action === 'input'
      ? json(kind === 'url'
          ? { base64: native.toString('base64'), url: 'https://evil.example' }
          : { base64: kind === 'base64' ? '!!!' : (kind === 'length' ? native.subarray(1) : Buffer.alloc(native.length)).toString('base64') })
      : normal(action, init)
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'failed', code: 'invalid-input' })
    expect(adapter.run).not.toHaveBeenCalled()
    expect(actions.some(action => action.action === 'complete')).toBe(false)
  })
  it.each(['cancelled', 'cancelling', 'uncertain', 'lost-status'])('aborts an active runner on %s and never uploads success', async (kind) => {
    let started = false
    let aborted = false
    adapter.run = vi.fn(({ signal }) => new Promise<void>((resolve) => {
      started = true
      signal.addEventListener('abort', () => {
        aborted = true
        resolve()
      }, { once: true })
    }))
    const normal = handler
    handler = async (action, init) => {
      if (action.action === 'status' && started) {
        if (kind === 'lost-status') throw new Error('private transport failure')
        return json({ status: kind })
      }
      return normal(action, init)
    }
    const outcome = await runEngineWorkerOnce(config())
    expect(outcome.status).toBe(['cancelled', 'cancelling'].includes(kind) ? 'failed' : 'uncertain')
    expect(aborted).toBe(true)
    expect(actions.some(action => action.action === 'complete')).toBe(false)
    expect(JSON.stringify(outcome)).not.toContain('private transport failure')
  })
  it('retains a replay hold after a lost completion acknowledgement', async () => {
    const normal = handler
    handler = async (action, init) => {
      if (action.action === 'complete') throw new Error('ack lost')
      return normal(action, init)
    }
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain' })
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain', code: 'duplicate-attempt' })
    expect(adapter.run).toHaveBeenCalledTimes(1)
    expect(actions.filter(action => action.action === 'complete')).toHaveLength(1)
  })
  it('does not repeat a lost claim request', async () => {
    handler = async () => {
      throw new Error('claim may have been accepted')
    }
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain' })
    expect(actions).toHaveLength(1)
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('holds a partially staged delivery before fetching input or executing', async () => {
    await mkdir(join(root, 'staging', hash(request.attemptId)), { recursive: true })
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain', code: 'duplicate-attempt' })
    expect(actions).toHaveLength(1)
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('serializes concurrent delivery without failing the running authority attempt', async () => {
    const outcomes = await Promise.all([runEngineWorkerOnce(config()), runEngineWorkerOnce(config())])
    expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['succeeded', 'uncertain'])
    expect(adapter.run).toHaveBeenCalledTimes(1)
    expect(actions.filter(action => action.action === 'fail')).toHaveLength(0)
  })
  it('rejects symlinked staging configuration before claiming', async () => {
    await mkdir(join(root, 'target'))
    await symlink(join(root, 'target'), join(root, 'staging'))
    await expect(runEngineWorkerOnce(config())).rejects.toThrow('Invalid worker configuration')
    expect(actions).toHaveLength(0)
  })
  it('refuses cancelled authority before downloading or executing', async () => {
    const normal = handler
    handler = async (action, init) => action.action === 'status' ? json({ status: 'cancelling' }) : normal(action, init)
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'failed', code: 'cancelled' })
    expect(actions.some(action => action.action === 'input')).toBe(false)
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('honors operator cancellation and reports confirmed adapter settlement', async () => {
    const controller = new AbortController()
    adapter.run = vi.fn(({ signal }) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
      controller.abort()
    }))
    expect(await runEngineWorkerOnce({ ...config(), signal: controller.signal })).toMatchObject({ status: 'failed', code: 'cancelled' })
    expect(actions.find(action => action.action === 'fail')).toMatchObject({ termination: 'adapter-settled' })
  })
  it('keeps a noncooperative execution uncertain when termination is unconfirmed', async () => {
    const controller = new AbortController()
    adapter.run = vi.fn(() => {
      controller.abort()
      return new Promise<void>(() => {})
    })
    expect(await runEngineWorkerOnce({ ...config(), signal: controller.signal })).toMatchObject({ status: 'uncertain', code: 'cancelled' })
    expect(actions.find(action => action.action === 'fail')).toMatchObject({ termination: 'unconfirmed' })
    expect(await runEngineWorkerOnce(config())).toMatchObject({ code: 'duplicate-attempt' })
    expect(adapter.run).toHaveBeenCalledTimes(1)
  })
  it('never reports local success when authority rejects completion', async () => {
    const normal = handler
    handler = async (action, init) => action.action === 'complete' ? json({ status: 'cancelled' }) : normal(action, init)
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain' })
    expect(actions.filter(action => action.action === 'complete')).toHaveLength(1)
    expect(actions.filter(action => action.action === 'fail')).toHaveLength(0)
  })
  it('aborts without retry when an input transfer exceeds 24 MiB', async () => {
    const normal = handler
    let emitted = 0
    handler = async (action, init) => action.action === 'input'
      ? new Response(new ReadableStream({
          pull(controller) {
            emitted++
            controller.enqueue(new Uint8Array(1024 * 1024))
          }
        }), { headers: { 'content-type': 'application/json' } })
      : normal(action, init)
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain' })
    expect(emitted).toBeGreaterThan(24)
    expect(adapter.run).not.toHaveBeenCalled()
    expect(actions.filter(action => action.action === 'input')).toHaveLength(1)
  })
  it('uses native HTTP redirect rejection without forwarding the service credential', async () => {
    const paths: string[] = []
    const server = createServer((incoming, response) => {
      paths.push(incoming.url!)
      expect(incoming.headers.authorization).toBe(`Bearer ${token}`)
      response.writeHead(307, { location: '/credential-trap' })
      response.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing listener')
      expect(await runEngineWorkerOnce({ ...config(), origin: `http://127.0.0.1:${address.port}`, allowLoopbackHttp: true, fetch: globalThis.fetch })).toMatchObject({ status: 'uncertain' })
      expect(paths).toEqual(['/api/internal/banner-engine'])
      expect(adapter.run).not.toHaveBeenCalled()
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
  it('reports deadline termination and never uploads a timed-out result', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    try {
      request.limits.timeoutMs = 80
      let markStarted!: () => void
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      adapter.run = vi.fn(({ signal }) => new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true })
        markStarted()
      }))
      const work = runEngineWorkerOnce(config())
      await started
      await vi.advanceTimersByTimeAsync(80)
      expect(await work).toMatchObject({ status: 'failed', code: 'deadline-exceeded' })
      expect(adapter.run).toHaveBeenCalledOnce()
      expect(actions.find(action => action.action === 'fail')).toMatchObject({ code: 'deadline-exceeded', termination: 'adapter-settled' })
      expect(actions.some(action => action.action === 'complete')).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it('does not retry a lost failure acknowledgement or re-execute its attempt', async () => {
    adapter.run = vi.fn(async () => {
      throw new Error('private adapter diagnostic')
    })
    const normal = handler
    handler = async (action, init) => {
      if (action.action === 'fail') throw new Error('ack lost')
      return normal(action, init)
    }
    expect(await runEngineWorkerOnce(config())).toMatchObject({ status: 'uncertain' })
    expect(await runEngineWorkerOnce(config())).toMatchObject({ code: 'duplicate-attempt' })
    expect(adapter.run).toHaveBeenCalledTimes(1)
    expect(actions.filter(action => action.action === 'fail')).toHaveLength(1)
  })
})
