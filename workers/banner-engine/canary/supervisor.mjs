import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, mkdtemp, copyFile, chmod, rm, lstat, statfs } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INNER_IMAGE, ENGINES, FONT } from './pins.mjs'
import { newBootGate, validateCgroups, validateIsolation } from './policy.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

// Shell-free, explicit executable/argv. Never receives parameters from HTTP.
export function command(executable, args, { timeout = 15000, maxBytes = 65536 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out = [], err = []
    let size = 0, failure
    const timer = setTimeout(() => {
      failure = new Error('command deadline')
      child.kill('SIGKILL')
    }, timeout)
    for (const [stream, chunks] of [[child.stdout, out], [child.stderr, err]]) {
      stream.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          failure = new Error('command byte ceiling')
          child.kill('SIGKILL')
        } else chunks.push(chunk)
      })
    }
    child.on('error', (error) => {
      failure = error
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (failure) reject(failure)
      else if (code !== 0) reject(new Error(`command failed ${code}`))
      else resolvePromise({ stdout: Buffer.concat(out), stderr: Buffer.concat(err) })
    })
  })
}
const docker = async (args, options) => (await command('docker', args, options)).stdout
const text = async (args, options) => (await docker(args, options)).toString().trim()

export function createArgs(engine, input, name) {
  return ['create', '--pull=never', '--name', name, '--network', 'none', '--read-only',
    '--user', '65532:65532', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--cpus', '2', '--memory', '2048m', '--memory-swap', '2048m', '--pids-limit', '32',
    '--ulimit', 'fsize=8388608:8388608', '--ulimit', 'nofile=128:128', '--log-driver', 'none',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=1777',
    '--tmpfs', '/output:rw,noexec,nosuid,nodev,size=9437184,mode=1777',
    '--mount', `type=bind,src=${input},dst=/input/document.${ENGINES[engine].extension},readonly`,
    '--env', 'RAYON_NUM_THREADS=2', INNER_IMAGE,
    '/usr/bin/timeout', '--signal=KILL', '90s', '/bin/sleep', '100']
}

async function render(engine, bootId, scratch, notices) {
  const pin = ENGINES[engine]
  const input = join(scratch, pin.fixture)
  await copyFile(join(root, 'fixtures', pin.fixture), input)
  await chmod(input, 0o444)
  assert.equal(await fileHash(input), pin.fixtureSha256)
  const name = `banner-native-canary-${bootId}-${engine}`
  let receipt, error, removed = false
  try {
    await docker(createArgs(engine, input, name))
    await docker(['start', name])
    const inspect = JSON.parse(await text(['inspect', name]))[0]
    assert.equal(inspect.Image, INNER_IMAGE)
    const isolation = validateIsolation(inspect, input)
    const cgroups = {}
    for (const [key, file] of Object.entries({ memory: 'memory.max', swap: 'memory.swap.max', pids: 'pids.max', cpu: 'cpu.max' })) {
      cgroups[key] = await text(['exec', name, '/bin/cat', `/sys/fs/cgroup/${file}`])
    }
    validateCgroups(cgroups) // MUST pass before either native executable runs.
    const sha = async path => (await text(['exec', name, '/usr/bin/sha256sum', path])).split(/\s+/)[0]
    assert.equal(await sha(`/opt/banner-engine/${engine}-cli`), pin.executableSha256)
    assert.equal(await sha(FONT.path), FONT.sha256)
    assert.equal(await sha(FONT.licensePath), FONT.licenseSha256)
    for (const [path, hash] of Object.entries(notices)) {
      assert(path.startsWith('/usr/share/doc/banner-engine/') && !path.includes('..'))
      assert.equal(await sha(path), hash)
    }
    const cli = args => text(['exec', name, `/opt/banner-engine/${engine}-cli`, ...args], { timeout: 90000 })
    const version = await cli(['--version'])
    assert(version.includes(pin.version))
    const doc = `/input/document.${pin.extension}`
    const fontReport = await cli(engine === 'photocraft'
      ? ['run', doc, '--cmd', 'type.fonts', '--params', '{"family":"Source Sans 3"}']
      : ['run', '--in', doc, '--cmd', 'text.fonts', '--params', '{}'])
    assert(fontReport.includes('Source Sans 3'))
    assert(engine === 'photocraft' ? fontReport.includes('SourceSans3-Bold') : fontReport.includes('"exact"'))
    const nativeLog = await cli(['convert', doc, '/output/preview.png'])
    const png = await docker(['exec', name, '/bin/cat', '/output/preview.png'], { maxBytes: 8388608 })
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), pin.width)
    assert.equal(png.readUInt32BE(20), pin.height)
    assert.equal(digest(png), pin.pngSha256, 'native output differs from accepted synthetic PNG')
    assert.equal(await fileHash(input), pin.fixtureSha256)
    receipt = { engine, version, executableSha256: pin.executableSha256, imageId: inspect.Image,
      innerContainerId: inspect.Id, isolation, cgroups, font: { ...FONT, report: fontReport },
      notices, nativeLog, fixtureSha256: pin.fixtureSha256,
      output: { sha256: digest(png), bytes: png.length, width: pin.width, height: pin.height, transport: 'receipt-only-no-publication' } }
  } catch (failure) {
    error = failure
  } finally {
    const list = () => text(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'])
    if (await list() === name) {
      assert.equal(await text(['rm', '-f', name]), name)
      removed = true
    }
    assert.equal(await list(), '', 'inner cleanup unverified')
  }
  if (error) throw error
  assert(removed, 'positive removal receipt required')
  return { ...receipt, cleanup: { innerRemoved: true, name, deliveryFenced: true } }
}

export async function runCanary(bootId) {
  const bytes = await readFile(join(root, 'package.json'))
  const manifest = JSON.parse(bytes)
  assert.equal(manifest.innerImage, INNER_IMAGE)
  for (const [path, hash] of Object.entries(manifest.files)) {
    assert(!path.includes('..') && !path.startsWith('/'))
    assert.equal(await fileHash(join(root, path)), hash, 'package checksum mismatch')
  }
  assert.equal(process.arch, 'x64')
  const uname = (await command('uname', ['-m'])).stdout.toString().trim()
  assert.equal(uname, 'x86_64')
  const free = await statfs('/var/lib/docker')
  assert(free.bavail * free.bsize >= 3 * 1024 ** 3 + 900 * 1024 ** 2, 'runtime disk reserve')
  // No TCP Docker socket, pulls, restart policy, host networking or supplied argv.
  const daemon = spawn('dockerd-entrypoint.sh', ['dockerd', '--host=unix:///var/run/docker.sock',
    '--iptables=false', '--ip6tables=false', '--ip-forward=false', '--bridge=none',
    '--exec-opt', 'native.cgroupdriver=cgroupfs', '--log-level=error'], { stdio: 'ignore' })
  let daemonFailure
  daemon.on('error', (error) => {
    daemonFailure = error
  })
  const scratch = await mkdtemp(join(tmpdir(), 'banner-native-canary-'))
  const started = Date.now()
  try {
    let info
    while (Date.now() - started < 45000) {
      if (daemonFailure) throw daemonFailure
      try {
        info = JSON.parse(await text(['info', '--format', '{{json .}}'], { timeout: 2000 }))
        break
      } catch { /* only daemon readiness probes may retry */ }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 200))
    }
    assert(info, 'dockerd readiness deadline')
    assert.equal(info.OSType, 'linux')
    assert(['x86_64', 'amd64'].includes(info.Architecture))
    assert.equal(info.CgroupVersion, '2')
    assert.equal(info.CgroupDriver, 'cgroupfs')
    for (const key of ['MemoryLimit', 'SwapLimit', 'PidsLimit', 'CpuCfsQuota', 'CpuCfsPeriod']) assert.equal(info[key], true, `daemon ${key}`)
    await docker(['load', '--input', join(root, 'inner.tar')], { timeout: 45000 })
    const image = JSON.parse(await text(['image', 'inspect', INNER_IMAGE]))[0]
    assert.equal(image.Id, INNER_IMAGE)
    assert.equal(image.Architecture, 'amd64')
    assert.equal(image.Os, 'linux')
    const receipts = []
    for (const engine of Object.keys(ENGINES)) receipts.push(await render(engine, bootId, scratch, manifest.notices))
    await rm(scratch, { recursive: true })
    await assert.rejects(lstat(scratch), { code: 'ENOENT' })
    return { schema: 'banner-native-canary-v1', status: 'passed', bootId, packageSha256: digest(bytes),
      runtime: { node: process.version, processArch: process.arch, uname, dockerVersion: info.ServerVersion,
        dockerArchitecture: info.Architecture, cgroupDriver: info.CgroupDriver, cgroupVersion: info.CgroupVersion },
      innerImage: INNER_IMAGE, receipts, elapsedMs: Date.now() - started,
      cleanup: { scratchRemoved: true, innerRemoved: true, deliveryFenced: true }, hostedAcceptance: 'requires-root-deployment-correlation' }
  } finally {
    daemon.kill('SIGTERM')
    await rm(scratch, { recursive: true, force: true })
  }
}

export function createCanaryServer({ bootId = randomUUID(), execute = runCanary, packageSha256 } = {}) {
  const gate = newBootGate(bootId)
  return createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/ready' && request.method === 'GET') {
      response.end(JSON.stringify({ bootId, packageSha256 }))
      return
    }
    if (request.url !== '/run' || request.method !== 'POST') {
      response.writeHead(404).end('{}')
      return
    }
    try {
      // Reject any framing capable of carrying work; controller sends Content-Length: 0.
      if (request.headers['content-length'] !== '0' || request.headers['transfer-encoding']) throw new Error('payload forbidden')
      gate.consume(request.headers['x-canary-boot'], 0)
      const receipt = await execute(bootId)
      const bytes = JSON.stringify(receipt)
      assert(Buffer.byteLength(bytes) <= 131072, 'receipt ceiling')
      response.end(bytes)
    } catch {
      // Fixed failure text; no paths, credentials, daemon logs or unexpected native data.
      response.writeHead(409).end('{"status":"failed-or-consumed"}')
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageSha256 = await fileHash(join(root, 'package.json'))
  const server = createCanaryServer({ packageSha256 })
  server.headersTimeout = 5000
  server.requestTimeout = 250000
  server.listen(8080, '0.0.0.0')
  // Entire PID 1 exits even when daemon or a request wedges. DO also destroys VM.
  const exit = () => process.exit(0)
  process.once('SIGTERM', exit)
  process.once('SIGINT', exit)
  setTimeout(exit, 300000)
}
