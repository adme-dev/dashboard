import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  loadLinuxRuntime,
  executeLinuxContainer,
  dockerCommand,
  runtimeRoot
} from '../../workers/banner-engine/runtime/render-preview.mjs'

const runtime = await loadLinuxRuntime('photocraft')
const inputPath = resolve(runtimeRoot, 'fixtures/photocraft.pcraft')
const root = resolve(
  runtimeRoot,
  `safety-${new Date().toISOString().replaceAll(':', '-')}`
)
await mkdir(root, { recursive: true })
const checks = {}
const results = []
async function rejected(name, options, expected) {
  const started = Date.now()
  let caught
  let containerName
  try {
    await executeLinuxContainer(runtime, {
      inputPath,
      onContainer: (name) => {
        containerName = name
      },
      ...options
    })
  } catch (error) {
    caught = error
  }
  assert(caught, `${name} should fail`)
  assert.notEqual(caught.code, 'cleanup-failed')
  assert(containerName, `${name}: expected an owned container identity`)
  assert.equal(
    (
      await dockerCommand([
        'ps',
        '-a',
        '--filter',
        `name=^/${containerName}$`,
        '--format',
        '{{.Names}}'
      ])
    ).trim(),
    ''
  )
  if (expected) assert.equal(caught.code, expected)
  results.push({
    name,
    elapsedMs: Date.now() - started,
    code: caught.code,
    message: caught.message,
    containerName,
    cleanupAbsenceVerified: true
  })
  checks[name] = true
}
const expectedHash = runtime.capability.executableSha256
runtime.capability.executableSha256 = 'f'.repeat(64)
await rejected(
  'wrongImageExecutableHashFailsClosed',
  { command: ['--version'] },
  'engine-failed'
)
runtime.capability.executableSha256 = expectedHash
const controller = new AbortController()
await rejected('activeCancellationCleansUp', {
  command: ['--version'],
  signal: controller.signal,
  onOutput: () => controller.abort()
})
await rejected('deadlineCleansUp', {
  request: { limits: { timeoutMs: 1 } },
  command: ['--version']
})
await rejected(
  'logLimitCleansUp',
  { request: { limits: { maxLogBytes: 1 } }, command: ['--version'] },
  'resource-limit'
)
await rejected(
  'outputFsizeLimitCleansUp',
  {
    request: { limits: { maxOutputBytes: 100 } },
    outputPath: resolve(root, 'oversized.png')
  },
  'resource-limit'
)
const path = resolve(root, 'existing.png')
await writeFile(path, 'owned existing file')
await rejected('existingOutputNeverOverwritten', { outputPath: path })
assert.equal(await readFile(path, 'utf8'), 'owned existing file')
const evidence = await executeLinuxContainer(runtime, {
  inputPath,
  command: ['--version'],
  request: {
    limits: {
      cpuCount: 1,
      memoryMb: 256,
      maxProcesses: 16,
      timeoutMs: 5000,
      maxOutputBytes: 4096
    }
  }
})
assert.equal(evidence.isolation.networkMode, 'none')
assert.equal(evidence.isolation.readOnlyRootfs, true)
assert.equal(evidence.isolation.user, '65532:65532')
assert.equal(evidence.isolation.nanoCpus, 1e9)
assert.equal(evidence.isolation.memoryBytes, 256 * 1024 * 1024)
assert.equal(evidence.isolation.memorySwapBytes, 256 * 1024 * 1024)
assert.equal(evidence.isolation.pidsLimit, 16)
assert.equal(evidence.isolation.mounts.length, 1)
assert.equal(evidence.isolation.mounts[0].RW, false)
assert.equal(evidence.isolation.mounts[0].Source, inputPath)
assert.deepEqual(evidence.isolation.capDrop, ['ALL'])
assert(evidence.isolation.securityOpt.includes('no-new-privileges'))
assert.equal(
  evidence.isolation.tmpfs['/output'],
  'rw,noexec,nosuid,nodev,size=1052672,mode=1777'
)
checks.actualLowerRequestLimitsAndIsolation = true
const containers = (
  await dockerCommand([
    'ps',
    '-a',
    '--filter',
    'label=io.xeroflow.banner-engine=linux-proof',
    '--format',
    '{{.Names}}'
  ])
).trim()
results.push({ name: 'lowerCaps', ...evidence })
await writeFile(
  resolve(root, 'safety.json'),
  JSON.stringify(
    {
      checks,
      results,
      remainingLabelledContainersAtObservation: containers,
      scope:
        'Failures await their own container removal; concurrent integration containers may be present.'
    },
    null,
    2
  ) + '\n'
)
await writeFile(
  resolve(runtimeRoot, 'latest-safety.json'),
  JSON.stringify({ root, report: resolve(root, 'safety.json') }, null, 2)
  + '\n'
)
console.log(JSON.stringify({ root, checks }))
