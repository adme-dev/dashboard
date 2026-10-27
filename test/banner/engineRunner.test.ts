import { createHash, randomUUID } from 'node:crypto'
import { chmod, link, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BannerEngineRequest } from '../../shared/bannerEngine'
import { bannerEngineOutputArtifactId, EngineAdapterError, runEngineAttempt, type EngineAdapter, type EngineAdapterContext } from '../../workers/banner-engine/runner/index'

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const native = Buffer.from('{"native":"fixture","customerSecret":"never logged"}')
const png = () => PNG.sync.write(new PNG({ width: 2, height: 3 }))
let root: string
let stagingRoot: string
let workspaceRoot: string
let inputPath: string
let request: BannerEngineRequest
let adapter: EngineAdapter
const config = () => ({ stagingRoot, workspaceRoot, adapter, abortGraceMs: 10 })
const run = (signal?: AbortSignal) => runEngineAttempt({ request, inputPath, signal }, config())
beforeEach(async () => {
  root = await mkdtemp(join(await realpath(tmpdir()), 'banner-runner-'))
  stagingRoot = join(root, 'staging')
  workspaceRoot = join(root, 'attempts')
  await mkdir(stagingRoot)
  await mkdir(workspaceRoot)
  inputPath = join(stagingRoot, 'source.photocraft')
  await writeFile(inputPath, native)
  request = {
    version: 1, jobId: randomUUID(), attemptId: randomUUID(), projectId: randomUUID(), clientId: randomUUID(),
    sourceRevision: 'rev-1', sourceHash: hash('source'), engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview',
    input: { id: randomUUID(), sha256: hash(native), bytes: native.length, mimeType: 'application/x-photocraft' },
    output: { mimeType: 'image/png', width: 2, height: 3 },
    limits: { maxInputBytes: 1024, maxOutputBytes: 4096, maxPixels: 100, timeoutMs: 2000, memoryMb: 256, cpuCount: 1, maxProcesses: 16, maxLogBytes: 128 },
    deadlineAt: new Date(Date.now() + 60000).toISOString()
  }
  adapter = {
    capability: { engine: request.engine, operation: request.operation, inputMimeType: request.input.mimeType, executableSha256: hash('engine'), capabilityProofSha256: hash('proof') },
    run: vi.fn(async ({ inputPath: staged, outputPath }: EngineAdapterContext) => {
      expect(await readFile(staged)).toEqual(native)
      expect(staged).not.toBe(inputPath)
      await writeFile(outputPath, png())
    })
  }
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
describe('isolated engine attempt runner', () => {
  it('validates actual output and binds immutable request identity with a durable secret-free receipt', async () => {
    const outcome = await run()
    expect(outcome.status).toBe('succeeded')
    if (outcome.status !== 'succeeded')
      throw new Error(outcome.code)
    expect(outcome.result).toMatchObject({ jobId: request.jobId, attemptId: request.attemptId, projectId: request.projectId, clientId: request.clientId, sourceRevision: request.sourceRevision, sourceHash: request.sourceHash, input: request.input, output: { sha256: hash(png()), bytes: png().length, width: 2, height: 3 }, evidence: { editableImport: false, executableSha256: hash('engine') } })
    expect(outcome.result.output.id).toBe(bannerEngineOutputArtifactId(request.attemptId))
    expect(await readFile(outcome.outputPath)).toEqual(png())
    const receipt = await readFile(outcome.receiptPath, 'utf8')
    expect(JSON.parse(receipt)).toMatchObject({ state: 'succeeded', automaticRetry: false })
    expect(receipt).not.toContain('customerSecret')
    expect(receipt).not.toContain(inputPath)
  })
  it('rejects concurrent and subsequent duplicate attempts without executing twice', async () => {
    const outcomes = await Promise.all([run(), run()])
    expect(outcomes.map(o => o.status).sort()).toEqual(['failed', 'succeeded'])
    expect(outcomes).toContainEqual(expect.objectContaining({ code: 'duplicate-attempt' }))
    expect(await run()).toMatchObject({ status: 'failed', code: 'duplicate-attempt' })
    expect(adapter.run).toHaveBeenCalledTimes(1)
  })
  it('holds an ambiguous pre-existing claim and never replays automatically', async () => {
    await mkdir(join(workspaceRoot, hash(request.attemptId)))
    expect(await run()).toMatchObject({ code: 'duplicate-attempt' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('does not let UUID letter case bypass the attempt hold or change the reserved asset', async () => {
    const reserved = bannerEngineOutputArtifactId(request.attemptId)
    expect(await run()).toMatchObject({ status: 'succeeded' })
    request.attemptId = request.attemptId.toUpperCase()
    expect(bannerEngineOutputArtifactId(request.attemptId)).toBe(reserved)
    expect(await run()).toMatchObject({ code: 'duplicate-attempt' })
    expect(adapter.run).toHaveBeenCalledTimes(1)
  })
  it.each(['hash', 'size', 'oversize'])('rejects input %s tampering', async (kind) => {
    await writeFile(inputPath, kind === 'oversize' ? Buffer.alloc(1025) : kind === 'size' ? native.subarray(1) : Buffer.alloc(native.length))
    expect(await run()).toMatchObject({ status: 'failed', code: 'invalid-input' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it.each(['file', 'directory', 'escape'])('rejects staged path %s attacks', async (kind) => {
    const outside = join(root, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'source'), native)
    if (kind === 'file') {
      await symlink(join(outside, 'source'), join(stagingRoot, 'link'))
      inputPath = join(stagingRoot, 'link')
    }
    if (kind === 'directory') {
      await symlink(outside, join(stagingRoot, 'link'))
      inputPath = join(stagingRoot, 'link', 'source')
    }
    if (kind === 'escape')
      inputPath = join(outside, 'source')
    expect(await run()).toMatchObject({ status: 'failed', code: 'invalid-input' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it.each(['command', 'url', 'outputPath'])('rejects untrusted job %s', async (key) => {
    expect(await runEngineAttempt({ request: { ...request, [key]: 'secret' }, inputPath }, config())).toMatchObject({ code: 'invalid-request' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('rejects unsupported engine pins and expired requests', async () => {
    request.engine = { ...request.engine, version: '99.0.0' }
    expect(await run()).toMatchObject({ code: 'unsupported-capability' })
    request.engine = adapter.capability.engine
    request.deadlineAt = new Date(Date.now() - 1).toISOString()
    expect(await run()).toMatchObject({ code: 'deadline-exceeded' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it.each(['oversize', 'non-png', 'wrong-dimensions', 'corrupt', 'trailer', 'symlink'])('rejects %s output', async (kind) => {
    adapter.run = vi.fn(async ({ outputPath }) => {
      if (kind === 'symlink') {
        await symlink(inputPath, outputPath)
        return
      }
      let bytes = png()
      if (kind === 'oversize')
        bytes = Buffer.alloc(4097)
      if (kind === 'non-png')
        bytes = Buffer.from('not png')
      if (kind === 'wrong-dimensions')
        bytes = PNG.sync.write(new PNG({ width: 3, height: 2 }))
      if (kind === 'corrupt')
        bytes[bytes.length - 1] ^= 1
      if (kind === 'trailer')
        bytes = Buffer.concat([bytes, Buffer.from('hidden')])
      await writeFile(outputPath, bytes)
    })
    expect(await run()).toMatchObject({ status: 'failed', code: 'invalid-output' })
  })
  it('cancels before execution', async () => {
    const controller = new AbortController()
    controller.abort('do not log this')
    expect(await run(controller.signal)).toMatchObject({ code: 'cancelled' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('fences late success after cancellation and preserves the failed receipt', async () => {
    const controller = new AbortController()
    let late!: () => Promise<void>
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    adapter.run = vi.fn(ctx => new Promise<void>((resolve) => {
      late = async () => {
        await writeFile(ctx.outputPath, png())
        resolve()
      }
      started()
    }))
    const execution = run(controller.signal)
    await ready
    controller.abort()
    const outcome = await execution
    expect(outcome).toMatchObject({ status: 'failed', code: 'cancelled' })
    await late()
    await new Promise(resolve => setImmediate(resolve))
    expect(JSON.parse(await readFile(outcome.receiptPath!, 'utf8'))).toMatchObject({ state: 'failed', code: 'cancelled', termination: 'unconfirmed' })
    expect(await run()).toMatchObject({ code: 'duplicate-attempt' })
  })
  it('times out a noncooperative adapter, aborts it and refuses retry', async () => {
    request.limits.timeoutMs = 250
    let signal!: AbortSignal
    adapter.run = vi.fn((ctx) => {
      signal = ctx.signal
      return new Promise<void>(() => {})
    })
    expect(await run()).toMatchObject({ code: 'deadline-exceeded' })
    expect(signal.aborted).toBe(true)
    expect(await run()).toMatchObject({ code: 'duplicate-attempt' })
  })
  it.each(['resource-limit', 'engine-failed'] as const)('records sanitized %s without exception or source secrets', async (code) => {
    adapter.run = vi.fn(async () => {
      throw new EngineAdapterError(code)
    })
    const outcome = await run()
    expect(outcome).toMatchObject({ status: 'failed', code })
    expect(JSON.parse(await readFile(outcome.receiptPath!, 'utf8'))).toMatchObject({ state: 'failed', code, automaticRetry: false })
  })
  it('caps log bytes, aborts the adapter and never persists log content', async () => {
    let aborted = false
    adapter.run = vi.fn(async (ctx) => {
      ctx.signal.addEventListener('abort', () => {
        aborted = true
      })
      ctx.onOutput('secret'.repeat(100))
      await writeFile(ctx.outputPath, png())
    })
    const outcome = await run()
    expect(outcome).toMatchObject({ code: 'output-limit' })
    expect(aborted).toBe(true)
    expect(await readFile(outcome.receiptPath!, 'utf8')).not.toContain('secret')
  })
  it('rejects symlinked workspace roots and hardlinked inputs', async () => {
    const alias = join(root, 'alias')
    await symlink(workspaceRoot, alias)
    expect(await runEngineAttempt({ request, inputPath }, { ...config(), workspaceRoot: alias })).toMatchObject({ code: 'workspace-failed' })
    await link(inputPath, join(stagingRoot, 'hardlink'))
    expect(await run()).toMatchObject({ code: 'invalid-input' })
    expect(adapter.run).not.toHaveBeenCalled()
  })
  it('rejects post-execution input mutation and preserves source binding', async () => {
    adapter.run = vi.fn(async (ctx) => {
      await chmod(ctx.inputPath, 0o600)
      await writeFile(ctx.inputPath, Buffer.alloc(native.length))
      await writeFile(ctx.outputPath, png())
    })
    expect(await run()).toMatchObject({ code: 'invalid-input' })
  })
  it('rejects output directory symlinks', async () => {
    const outside = join(root, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'preview.png'), png())
    adapter.run = vi.fn(async (ctx) => {
      const outputDirectory = join(ctx.workspacePath, 'output')
      await rm(outputDirectory, { recursive: true })
      await symlink(outside, outputDirectory)
    })
    expect(await run()).toMatchObject({ code: 'invalid-output' })
  })
  it('keeps unknown adapter errors and diagnostics out of receipts', async () => {
    adapter.run = vi.fn(async (ctx) => {
      ctx.onOutput('private content')
      throw new Error('credential=secret source=' + inputPath)
    })
    const outcome = await run()
    expect(outcome).toMatchObject({ code: 'engine-failed' })
    const receipt = await readFile(outcome.receiptPath!, 'utf8')
    expect(receipt).not.toMatch(/credential|secret|private content|source=/)
  })
  it('freezes request snapshot and isolates the published artifact from later adapter writes', async () => {
    let later!: () => Promise<void>
    const originalProject = request.projectId
    adapter.run = vi.fn(async (ctx) => {
      expect(Object.isFrozen(ctx.request)).toBe(true)
      expect(Object.isFrozen(ctx.request.limits)).toBe(true)
      request.projectId = randomUUID()
      later = () => writeFile(ctx.outputPath, 'changed later')
      await writeFile(ctx.outputPath, png())
    })
    const outcome = await run()
    if (outcome.status !== 'succeeded')
      throw new Error(outcome.code)
    expect(outcome.result.projectId).toBe(originalProject)
    await later()
    expect(await readFile(outcome.outputPath)).toEqual(png())
  })

  it('waits boundedly for cooperative adapter cleanup before recording cancellation', async () => {
    const controller = new AbortController()
    let cleaned = false
    adapter.run = vi.fn(ctx => new Promise<void>((resolve) => {
      ctx.signal.addEventListener('abort', () => {
        setTimeout(() => {
          cleaned = true
          resolve()
        }, 5)
      })
      controller.abort()
    }))
    const outcome = await runEngineAttempt({ request, inputPath, signal: controller.signal }, { ...config(), abortGraceMs: 100 })
    expect(outcome).toMatchObject({ code: 'cancelled' })
    expect(cleaned).toBe(true)
    expect(JSON.parse(await readFile(outcome.receiptPath!, 'utf8'))).toMatchObject({ termination: 'adapter-settled' })
  })
})
