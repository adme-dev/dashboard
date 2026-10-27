import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { runEngineAttempt, bannerEngineOutputArtifactId } from '../../workers/banner-engine/runner/index'
import { createLinuxEngineAdapter } from '../../workers/banner-engine/runtime/index'
import { validateBannerEngineResult } from '../../server/utils/banner/engineResult'
import type { BannerEngineRequest } from '../../shared/bannerEngine'

// Local real Linux execution, synthetic project authority. No API, DB or provider call.
const root = resolve('output/editable-artwork-online-engine')
const output = resolve(root, `integration-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const stagingRoot = resolve(output, 'staging')
const workspaceRoot = resolve(output, 'attempts')
await mkdir(stagingRoot, { recursive: true })
// Retain the exact trusted configuration/proof used by this integration run.
for (const file of ['runtime.json', 'photocraft-capability-proof.json', 'vectorcraft-capability-proof.json']) {
  await writeFile(resolve(output, file), await readFile(resolve(root, 'linux', file)), { flag: 'wx', mode: 0o400 })
}
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const report: { status: string, scope: string, engines: unknown[], failure?: string } = {
  status: 'running', scope: 'Real Linux render-preview; synthetic local project authority; no hosted import', engines: []
}
try {
  for (const [engine, extension, width, height] of [
    ['photocraft', 'pcraft', 256, 256], ['vectorcraft', 'vectorcraft', 640, 360]
  ] as const) {
    const adapter = await createLinuxEngineAdapter(engine, resolve(output, 'runtime.json'))
    const bytes = await readFile(resolve(root, `linux/fixtures/${engine}.${extension}`))
    const inputPath = resolve(stagingRoot, `${engine}.${extension}`)
    await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600 })
    const request: BannerEngineRequest = {
      version: 1, jobId: randomUUID(), attemptId: randomUUID(), projectId: randomUUID(), clientId: randomUUID(),
      sourceRevision: 'local-proof-1', sourceHash: hash('synthetic authoritative project state'),
      engine: adapter.capability.engine, operation: 'render-preview',
      input: { id: randomUUID(), sha256: hash(bytes), bytes: bytes.length, mimeType: adapter.capability.inputMimeType },
      output: { mimeType: 'image/png', width, height },
      limits: { maxInputBytes: 16 * 1024 * 1024, maxOutputBytes: 4 * 1024 * 1024, maxPixels: width * height,
        timeoutMs: 60000, memoryMb: 512, cpuCount: 2, maxProcesses: 32, maxLogBytes: 65536 },
      deadlineAt: new Date(Date.now() + 120000).toISOString()
    }
    // Reservation derived before execution, independently of returned receipt metadata.
    const outputAssetId = bannerEngineOutputArtifactId(request.attemptId)
    const configuration = { adapter, stagingRoot, workspaceRoot }
    const started = Date.now()
    const outcome = await runEngineAttempt({ request, inputPath }, configuration)
    assert.equal(outcome.status, 'succeeded', JSON.stringify(outcome))
    if (outcome.status !== 'succeeded') throw new Error('No output')
    const outputBytes = await readFile(outcome.outputPath)
    const context = {
      request, result: outcome.result, currentSource: {
        projectId: request.projectId, clientId: request.clientId, sourceRevision: request.sourceRevision, sourceHash: request.sourceHash
      }, inputAsset: { ...request.input, projectId: request.projectId, clientId: request.clientId },
      inputBytes: bytes, outputBytes, outputAssetId, capabilities: [adapter.capability], now: Date.now()
    }
    assert.equal(validateBannerEngineResult(context).result.output.sha256, hash(outputBytes))
    assert.throws(() => validateBannerEngineResult({ ...context, currentSource: { ...context.currentSource, sourceRevision: 'stale' } }))
    assert.throws(() => validateBannerEngineResult({ ...context, currentSource: { ...context.currentSource, clientId: randomUUID() } }))
    const tampered = Buffer.from(outputBytes)
    tampered[tampered.length - 1] ^= 1
    assert.throws(() => validateBannerEngineResult({ ...context, outputBytes: tampered }))
    assert.equal(hash(await readFile(inputPath)), request.input.sha256)
    const duplicate = await runEngineAttempt({ request, inputPath }, configuration)
    assert.deepEqual(duplicate, { status: 'failed', code: 'duplicate-attempt' })
    const invalidInput = await runEngineAttempt({ request: { ...request, attemptId: randomUUID(), input: { ...request.input, sha256: '0'.repeat(64) } }, inputPath }, configuration)
    assert.equal(invalidInput.status === 'failed' && invalidInput.code, 'invalid-input')
    const controller = new AbortController()
    controller.abort()
    const cancelled = await runEngineAttempt({ request: { ...request, attemptId: randomUUID() }, inputPath, signal: controller.signal }, configuration)
    assert.deepEqual(cancelled, { status: 'failed', code: 'cancelled' })
    const image = PNG.sync.read(outputBytes)
    let transparent = 0, partialAlpha = 0, opaque = 0
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] === 0) transparent++
      else if (image.data[i] === 255) opaque++
      else partialAlpha++
    }
    report.engines.push({ engine, elapsedMs: Date.now() - started, result: outcome.result, outputPath: outcome.outputPath,
      alpha: { transparent, partialAlpha, opaque }, assertions: ['actual PNG accepted', 'stale revision rejected', 'wrong client rejected', 'altered output rejected', 'source unchanged', 'duplicate attempt rejected', 'altered input rejected', 'pre-cancelled attempt rejected'] })
    console.log(`${engine}: real render and acceptance checks passed`)
  }
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.failure = String(error)
  throw error
} finally {
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(report, null, 2))
  console.log(resolve(output, 'evidence.json'))
}
