import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir, readdir, lstat, statfs, copyFile, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ENGINES, INNER_IMAGE, DOCKER_BASE, NODE_BASE } from '../../workers/banner-engine/canary/pins.mjs'
import { command, fileHash } from '../../workers/banner-engine/canary/supervisor.mjs'

export const BUDGET = 900 * 1024 ** 2 // Strictly below 1 GiB; includes the exported inner image.
export const RESERVE = 3 * 1024 ** 3
export const canaryRoot = fileURLToPath(new URL('../../workers/banner-engine/canary/', import.meta.url))
const context = join(canaryRoot, '.artifacts/context')
const proof = resolve('output/editable-artwork-engine-amd64/proof-2026-10-27T07-57-06.250Z')
const sha = value => createHash('sha256').update(value).digest('hex')

export function checkDisk(available, required = BUDGET) {
  assert(Number.isSafeInteger(required) && required >= 0 && required <= BUDGET, 'artifact disk budget')
  assert(available >= required + RESERVE, '3 GiB disk reserve')
}

async function disk(path, required = BUDGET) {
  const fs = await statfs(path)
  const available = fs.bavail * fs.bsize
  checkDisk(available, required)
  return available
}

async function regularCopy(source, target, expected) {
  const stat = await lstat(source)
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size < 1024 * 1024, 'trusted source bounds')
  if (expected) assert.equal(await fileHash(source), expected, 'trusted source checksum')
  await copyFile(source, target)
  await chmod(target, 0o444)
}

async function exportInner(destination) {
  const child = spawn('docker', ['image', 'save', INNER_IMAGE], { stdio: ['ignore', 'pipe', 'pipe'] })
  let size = 0
  child.stderr.resume()
  const closed = new Promise((accept, reject) => {
    child.on('error', reject)
    child.on('close', code => code === 0 ? accept() : reject(new Error('inner image export failed')))
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 120000)
  const bounded = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length
    callback(size > 384 * 1024 ** 2 ? new Error('inner image export exceeds 384 MiB') : null, chunk)
  } })
  try {
    await Promise.all([closed, pipeline(child.stdout, bounded, createWriteStream(destination, { flags: 'wx', mode: 0o444 }))])
  } catch (error) {
    child.kill('SIGKILL')
    await closed.catch(() => {})
    throw error
  } finally { clearTimeout(timer) }
  return size
}

async function noticeManifest(directory, prefix = '') {
  const result = {}
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), stat = await lstat(path)
    assert(!stat.isSymbolicLink())
    if (stat.isDirectory()) Object.assign(result, await noticeManifest(path, `${prefix}${name}/`))
    else {
      assert(stat.isFile() && stat.size < 1024 * 1024)
      result[`/usr/share/doc/banner-engine/${prefix}${name}`] = await fileHash(path)
    }
  }
  return result
}

export async function prepare() {
  const freeBefore = await disk(canaryRoot)
  // Refuse a prior or partial context; never delete evidence or refresh a consumed canary.
  await mkdir(join(canaryRoot, '.artifacts'), { recursive: true })
  await mkdir(context)
  await mkdir(join(context, 'fixtures'))
  const qualification = await readFile(join(proof, 'qualification.json'))
  assert.equal(sha(qualification), '93ff068d8a96561e6e7b0c1c2e20116577e423def49a1439997fc207dcbecb84')
  const image = JSON.parse((await command('docker', ['image', 'inspect', INNER_IMAGE])).stdout.toString())[0]
  assert.equal(image.Id, INNER_IMAGE)
  assert.equal(image.Os, 'linux')
  assert.equal(image.Architecture, 'amd64')
  const files = {}
  for (const name of ['pins.mjs', 'policy.mjs', 'supervisor.mjs']) {
    await regularCopy(join(canaryRoot, name), join(context, name))
    files[name] = await fileHash(join(context, name))
  }
  await regularCopy(join(canaryRoot, 'Dockerfile'), join(context, 'Dockerfile'))
  for (const pin of Object.values(ENGINES)) {
    await regularCopy(join(proof, pin.fixture), join(context, 'fixtures', pin.fixture), pin.fixtureSha256)
    files[`fixtures/${pin.fixture}`] = pin.fixtureSha256
  }
  const archiveBytes = await exportInner(join(context, 'inner.tar'))
  files['inner.tar'] = await fileHash(join(context, 'inner.tar'))
  const notices = await noticeManifest(resolve('output/editable-artwork-engine-amd64/build/notices'))
  assert(Object.keys(notices).length >= 30, 'official notice inventory incomplete')
  const manifest = { schema: 'banner-native-canary-package-v1', innerImage: INNER_IMAGE,
    dockerBase: DOCKER_BASE, nodeBase: NODE_BASE, qualificationSha256: sha(qualification), files, notices }
  const manifestBytes = JSON.stringify(manifest, null, 2) + '\n'
  await writeFile(join(context, 'package.json'), manifestBytes, { flag: 'wx', mode: 0o444 })
  const freeAfter = await disk(canaryRoot, 0)
  const receipt = { schema: 'banner-native-canary-preparation-v1', packageSha256: sha(manifestBytes),
    innerImage: INNER_IMAGE, archiveBytes, archiveSha256: files['inner.tar'],
    dockerfileSha256: await fileHash(join(context, 'Dockerfile')), freeBefore, freeAfter,
    artifactBudgetBytes: BUDGET, reserveBytes: RESERVE,
    outerImageBuilt: false, hostedExecution: false, deploymentPerformed: false }
  await writeFile(join(canaryRoot, '.artifacts/preparation.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
  return receipt
}

// Root-only local configuration generation after an explicitly authorized push.
// This function performs no network, build, push, deployment, or activation.
// `directory` exists only so tests can target a scratch copy; the CLI uses canaryRoot.
export async function deploymentConfig(imageReference, { directory = canaryRoot } = {}) {
  assert(/^registry\.cloudflare\.com\/[a-f0-9]{32}\/banner-engine-native-canary@sha256:[a-f0-9]{64}$/.test(imageReference), 'dedicated digest-pinned registry image required')
  const manifest = await readFile(join(directory, '.artifacts/context/package.json'))
  const config = JSON.parse(await readFile(join(directory, 'wrangler.jsonc'), 'utf8'))
  config.main = '../worker.ts'
  delete config.$schema
  config.containers[0].image = imageReference
  delete config.containers[0].image_build_context
  // Admission is always off in generated output, whatever the template says. Root
  // enables it separately, by hand, only for the approved run.
  config.vars = { ...config.vars, BANNER_NATIVE_CANARY_ENABLED: 'false',
    BANNER_NATIVE_CANARY_PACKAGE_SHA256: sha(manifest), BANNER_NATIVE_CANARY_OUTER_IMAGE: imageReference }
  const bytes = JSON.stringify(config, null, 2) + '\n'
  assert.equal(JSON.parse(bytes).vars.BANNER_NATIVE_CANARY_ENABLED, 'false', 'generated admission must be disabled')
  const path = join(directory, '.artifacts/wrangler.release.json')
  await writeFile(path, bytes, { flag: 'wx' })
  return { path, enabled: false, image: imageReference }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (!args.length) console.log(JSON.stringify(await prepare(), null, 2))
  else if (args.length === 2 && args[0] === '--deployment-config') console.log(JSON.stringify(await deploymentConfig(args[1]), null, 2))
  else throw new Error('Expected no arguments, or --deployment-config <dedicated-registry-image@sha256:digest>')
}
