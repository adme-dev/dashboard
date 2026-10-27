import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { randomUUID, createHash } from 'node:crypto'
import { readFile, lstat, realpath, mkdir } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export const runtimeRoot = fileURLToPath(
  new URL(
    '../../../output/editable-artwork-online-engine/linux/',
    import.meta.url
  )
)
const definitions = Object.freeze({
  photocraft: {
    executableSha256:
      '486d0d83d6cdacec3ec76ff6e30e47d5d2c207ad15084631a61902df157e8c8d',
    version: '0.16.0',
    extension: 'pcraft',
    mime: 'application/x-photocraft'
  },
  vectorcraft: {
    executableSha256:
      'e4cd5c92613be1e0982346b2d2c3e0d5f7f249034c22da3cd61ae57201c0cd1e',
    version: '0.17.0',
    extension: 'vectorcraft',
    mime: 'application/x-vectorcraft'
  }
})
export class LinuxRuntimeError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

// No shell; control commands are bounded independently of the engine deadline.
export function dockerCommand(
  args,
  { onOutput = () => {}, maxLogBytes = 65536, timeoutMs = 15000 } = {}
) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    let bytes = 0
    let failure
    const timer = setTimeout(() => {
      failure = new LinuxRuntimeError(
        'resource-limit',
        'Docker command timed out'
      )
      child.kill('SIGKILL')
    }, timeoutMs)
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > maxLogBytes) {
          failure = new LinuxRuntimeError(
            'resource-limit',
            'Engine log limit exceeded'
          )
          child.kill('SIGKILL')
          return
        }
        chunks.push(chunk)
        try {
          onOutput(chunk)
        } catch (error) {
          failure = error
          child.kill('SIGKILL')
        }
      })
    child.on('error', (error) => {
      failure = error
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const output = Buffer.concat(chunks).toString('utf8')
      if (failure) reject(failure)
      else if (code !== 0)
        reject(
          new LinuxRuntimeError(
            code === 137 || code === 124 || code === 153
              ? 'resource-limit'
              : 'engine-failed',
            `Docker exited ${code}: ${output.slice(0, 2048)}`
          )
        )
      else resolvePromise(output)
    })
  })
}

async function copyContainerOutput(name, source, target, maxBytes) {
  // Docker cp cannot read container tmpfs mounts. Stream bytes from the running
  // container, with an exclusive host destination and a hard byte ceiling.
  const child = spawn('docker', ['exec', name, '/bin/cat', source], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let count = 0
  let stderr = ''
  child.stderr.on('data', (data) => {
    stderr = (stderr + data).slice(0, 2048)
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
  const exited = new Promise((resolvePromise, reject) => {
    child.on('error', reject)
    child.on('close', code =>
      code === 0
        ? resolvePromise()
        : reject(
            new LinuxRuntimeError(
              'engine-failed',
              `Output collection failed: ${stderr}`
            )
          )
    )
  })
  const bounded = new Transform({
    transform(chunk, _encoding, callback) {
      count += chunk.length
      callback(
        count > maxBytes
          ? new LinuxRuntimeError(
              'resource-limit',
              'Output byte limit exceeded'
            )
          : null,
        chunk
      )
    }
  })
  try {
    await Promise.all([
      exited,
      pipeline(
        child.stdout,
        bounded,
        createWriteStream(target, { flags: 'wx', mode: 0o600 })
      )
    ])
  } catch (error) {
    child.kill('SIGKILL')
    await exited.catch(() => {})
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function loadLinuxRuntime(
  engine,
  manifestPath = resolve(runtimeRoot, 'runtime.json'),
  { allowPrepared = false } = {}
) {
  const definition = definitions[engine]
  if (!definition)
    throw new LinuxRuntimeError('engine-failed', 'Unsupported Linux engine')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const entry = manifest.engines?.[engine]
  if (
    !/^sha256:[a-f0-9]{64}$/.test(manifest.imageId)
    || entry?.version !== definition.version
    || entry.executableSha256 !== definition.executableSha256
    || !/^[a-f0-9]{64}$/.test(entry.capabilityProofSha256)
  ) {
    throw new LinuxRuntimeError(
      'engine-failed',
      'Invalid trusted Linux runtime manifest'
    )
  }
  if (
    manifest.status !== 'accepted'
    && !(allowPrepared && manifest.status === 'prepared')
  )
    throw new LinuxRuntimeError(
      'engine-failed',
      'Linux runtime has no accepted proof'
    )
  const proofFile
    = manifest.status === 'prepared'
      ? `${engine}-packaging-proof.json`
      : `${engine}-capability-proof.json`
  const proofBytes = await readFile(resolve(dirname(manifestPath), proofFile))
  const proof = JSON.parse(proofBytes.toString('utf8'))
  if (
    hash(proofBytes) !== entry.capabilityProofSha256
    || proof.imageId !== manifest.imageId
    || proof.executableSha256 !== entry.executableSha256
    || proof.engine !== engine
    || proof.version !== definition.version
  )
    throw new LinuxRuntimeError(
      'engine-failed',
      'Linux capability proof mismatch'
    )
  if (
    manifest.status === 'accepted'
    && hash(await readFile(proof.acceptancePath)) !== proof.acceptanceSha256
  )
    throw new LinuxRuntimeError(
      'engine-failed',
      'Linux acceptance artifact mismatch'
    )
  // The manifest is operator-owned configuration; image IDs address immutable local content.
  return {
    imageId: manifest.imageId,
    engine,
    definition,
    capability: {
      engine: { id: engine, version: definition.version },
      operation: 'render-preview',
      inputMimeType: definition.mime,
      executableSha256: entry.executableSha256,
      capabilityProofSha256: entry.capabilityProofSha256
    }
  }
}

export function boundedLimits(request = {}) {
  const limits = request.limits ?? {}
  const cap = (name, maximum) => {
    const value = limits[name] ?? maximum
    if (!Number.isSafeInteger(value) || value < 1)
      throw new LinuxRuntimeError('resource-limit', `Invalid ${name}`)
    return Math.min(value, maximum)
  }
  const result = {
    cpuCount: cap('cpuCount', 4),
    memoryMb: cap('memoryMb', 2048),
    maxProcesses: cap('maxProcesses', 64),
    timeoutMs: cap('timeoutMs', 90000),
    maxLogBytes: cap('maxLogBytes', 65536),
    maxOutputBytes: cap('maxOutputBytes', 64 * 1024 * 1024)
  }
  if (request.deadlineAt) {
    const remaining = Date.parse(request.deadlineAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new LinuxRuntimeError('resource-limit', 'Expired deadline')
    result.timeoutMs = Math.min(result.timeoutMs, remaining)
  }
  return result
}

export function containerArguments(runtime, inputPath, name, limits) {
  if (/[,\r\n]/.test(inputPath))
    throw new LinuxRuntimeError('engine-failed', 'Unsupported mount path')
  const input = `/input/document.${runtime.definition.extension}`
  return [
    'create',
    '--name',
    name,
    '--label',
    'io.xeroflow.banner-engine=linux-proof',
    '--network',
    'none',
    '--read-only',
    '--user',
    '65532:65532',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--cpus',
    String(limits.cpuCount),
    '--memory',
    `${limits.memoryMb}m`,
    '--memory-swap',
    `${limits.memoryMb}m`,
    '--pids-limit',
    String(limits.maxProcesses),
    '--ulimit',
    `fsize=${limits.maxOutputBytes}:${limits.maxOutputBytes}`,
    '--ulimit',
    'nofile=128:128',
    '--log-driver',
    'none',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=1777',
    '--tmpfs',
    `/output:rw,noexec,nosuid,nodev,size=${limits.maxOutputBytes + 1048576},mode=1777`,
    '--mount',
    `type=bind,src=${inputPath},dst=${input},readonly`,
    '--env',
    `RAYON_NUM_THREADS=${limits.cpuCount}`,
    runtime.imageId,
    '/usr/bin/timeout',
    '--signal=KILL',
    `${limits.timeoutMs / 1000}s`,
    '/bin/sleep',
    '100'
  ]
}

/** Internal trusted proof command hook is not exposed to the job adapter or CLI. */
export async function executeLinuxContainer(
  runtime,
  {
    inputPath,
    request,
    signal,
    onOutput,
    command,
    collect = '/output/preview.png',
    outputPath,
    onContainer,
    beforeExecute
  }
) {
  const limits = boundedLimits(request)
  const input = await realpath(inputPath)
  const stat = await lstat(inputPath)
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new LinuxRuntimeError(
      'engine-failed',
      'Input must be a regular file'
    )
  if (signal?.aborted)
    throw new LinuxRuntimeError(
      'engine-failed',
      'Cancelled before container creation'
    )
  const name = `banner-engine-${randomUUID()}`
  onContainer?.(name)
  let aborting
  let timer
  const abort = () => {
    aborting ??= dockerCommand(['rm', '-f', name]).catch(error => error)
  }
  signal?.addEventListener('abort', abort, { once: true })
  const started = Date.now()
  try {
    await dockerCommand(containerArguments(runtime, input, name, limits))
    if (signal?.aborted)
      throw new LinuxRuntimeError(
        'engine-failed',
        'Cancelled during container creation'
      )
    timer = setTimeout(abort, limits.timeoutMs)
    await dockerCommand(['start', name])
    const executableSha256 = (
      await dockerCommand([
        'exec',
        name,
        '/usr/bin/sha256sum',
        `/opt/banner-engine/${runtime.engine}-cli`
      ])
    )
      .trim()
      .split(/\s+/)[0]
    if (executableSha256 !== runtime.capability.executableSha256)
      throw new LinuxRuntimeError(
        'engine-failed',
        'Image executable checksum mismatch'
      )
    // Trusted local adapters may verify additional immutable image resources.
    // This callback is never populated from a public engine job or native document.
    await beforeExecute?.(name)
    const logs = await dockerCommand(
      [
        'exec',
        name,
        `/opt/banner-engine/${runtime.engine}-cli`,
        ...(command ?? [
          'convert',
          `/input/document.${runtime.definition.extension}`,
          '/output/preview.png'
        ])
      ],
      {
        onOutput,
        maxLogBytes: limits.maxLogBytes,
        timeoutMs: limits.timeoutMs + 10000
      }
    )
    if (aborting || signal?.aborted)
      throw new LinuxRuntimeError(
        'resource-limit',
        'Engine cancelled or timed out'
      )
    const inspection = JSON.parse(await dockerCommand(['inspect', name]))[0]
    const state = inspection.State
    const isolation = {
      user: inspection.Config.User,
      environment: inspection.Config.Env,
      mounts: inspection.Mounts,
      networkMode: inspection.HostConfig.NetworkMode,
      readOnlyRootfs: inspection.HostConfig.ReadonlyRootfs,
      memoryBytes: inspection.HostConfig.Memory,
      memorySwapBytes: inspection.HostConfig.MemorySwap,
      nanoCpus: inspection.HostConfig.NanoCpus,
      pidsLimit: inspection.HostConfig.PidsLimit,
      capDrop: inspection.HostConfig.CapDrop,
      securityOpt: inspection.HostConfig.SecurityOpt,
      tmpfs: inspection.HostConfig.Tmpfs,
      ulimits: inspection.HostConfig.Ulimits
    }
    if (state.OOMKilled || state.ExitCode === 137 || state.ExitCode === 124)
      throw new LinuxRuntimeError(
        'resource-limit',
        'Engine resource limit reached'
      )
    if (state.ExitCode !== 0)
      throw new LinuxRuntimeError('engine-failed', 'Engine returned a failure')
    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true })
      await copyContainerOutput(
        name,
        collect,
        outputPath,
        limits.maxOutputBytes
      )
      const output = await lstat(outputPath)
      if (
        !output.isFile()
        || output.isSymbolicLink()
        || output.size > limits.maxOutputBytes
        || output.size === 0
      )
        throw new LinuxRuntimeError(
          'resource-limit',
          'Invalid or oversized output'
        )
    }
    if (aborting || signal?.aborted)
      throw new LinuxRuntimeError(
        'engine-failed',
        'Cancelled during collection'
      )
    return {
      elapsedMs: Date.now() - started,
      limits,
      logs,
      state,
      isolation,
      executableSha256,
      containerName: name
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    if (aborting) await aborting
    await cleanupOwnedContainer(name)
  }
}

export async function cleanupOwnedContainer(name, command = dockerCommand) {
  if (!/^banner-engine-[a-f0-9-]+$/.test(name))
    throw new LinuxRuntimeError(
      'cleanup-failed',
      'Invalid owned container name'
    )
  try {
    // A failed create can still leave a container. Require positive list readback.
    const args = [
      'ps',
      '-a',
      '--filter',
      `name=^/${name}$`,
      '--format',
      '{{.Names}}'
    ]
    const present = (await command(args)).trim()
    if (present === name) await command(['rm', '-f', name])
    else if (present) throw new Error('Unexpected owned-container state')
    if ((await command(args)).trim())
      throw new Error('Owned container remains')
  } catch (error) {
    throw new LinuxRuntimeError(
      'cleanup-failed',
      `Owned container cleanup unverified: ${error.message}`
    )
  }
}

export async function renderLinuxPreview(runtime, context) {
  return executeLinuxContainer(runtime, context)
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2)
    const values = {}
    for (let i = 0; i < args.length; i += 2) {
      if (
        !['--engine', '--input', '--output'].includes(args[i])
        || !args[i + 1]
        || values[args[i]]
      )
        throw new Error('Expected --engine --input --output exactly once')
      values[args[i]] = args[i + 1]
    }
    if (Object.keys(values).length !== 3)
      throw new Error('Expected --engine --input --output')
    const controller = new AbortController()
    process.once('SIGTERM', () => controller.abort())
    process.once('SIGINT', () => controller.abort())
    const runtime = await loadLinuxRuntime(values['--engine'])
    const outputPath = resolve(values['--output'])
    const receipt = await renderLinuxPreview(runtime, {
      inputPath: resolve(values['--input']),
      outputPath,
      signal: controller.signal
    })
    const bytes = await readFile(outputPath)
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
      throw new Error('Output is not PNG')
    console.log(
      JSON.stringify({
        ...runtime.capability,
        output: basename(outputPath),
        sha256: hash(bytes),
        bytes: bytes.length,
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        elapsedMs: receipt.elapsedMs,
        logs: receipt.logs,
        cleanupVerified: true
      })
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
