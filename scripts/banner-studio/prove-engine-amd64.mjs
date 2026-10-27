import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile, chmod, statfs } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { root, hashFile, sha256, executionEvidence } from './prove-engine-amd64-prepare.mjs'
import { RELEASES } from '../../workers/banner-engine/runtime/amd64/pins.mjs'
import { FONT_PIN, FONT_FACE, inspectPinnedFont } from '../../workers/banner-engine/fonts/runtime.mjs'
import { executeLinuxContainer, dockerCommand } from '../../workers/banner-engine/runtime/render-preview.mjs'

// Trusted synthetic qualification only. This is not a job adapter or claim loop.
const build = JSON.parse(await readFile(resolve(root, 'build.json'), 'utf8'))
const inspected = JSON.parse(await dockerCommand(['image', 'inspect', build.imageId]))[0]
assert.equal(inspected.Id, build.imageId)
assert.equal(inspected.Architecture, 'amd64')
assert.equal(inspected.Os, 'linux')
const daemon = JSON.parse(await dockerCommand(['info', '--format', '{{json .}}']))
const execution = executionEvidence(daemon.OSType, daemon.Architecture)
const proofRoot = resolve(root, `proof-${new Date().toISOString().replaceAll(':', '-')}`)
await mkdir(proofRoot, { mode: 0o700 })
const save = (file, value) => writeFile(resolve(proofRoot, file), JSON.stringify(value, null, 2) + '\n')
const receipts = [], checks = {}, originals = {}, inputs = {}
const sourceFiles = [
  'scripts/banner-studio/prove-engine-amd64.mjs',
  'scripts/banner-studio/prove-engine-amd64-prepare.mjs',
  'scripts/banner-studio/prove-engine-amd64-build.mjs',
  'workers/banner-engine/runtime/amd64/pins.mjs',
  'workers/banner-engine/runtime/amd64/Dockerfile',
  'workers/banner-engine/runtime/render-preview.mjs',
  'workers/banner-engine/fonts/runtime.mjs'
]
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, await hashFile(resolve(file))])))
for (const [engine, release] of Object.entries(RELEASES)) {
  assert.equal(build.engines[engine].executableSha256, release.executableSha256)
  const original = resolve(`output/editable-artwork-online-engine/linux/fixtures/${engine}.${release.extension}`)
  originals[original] = await hashFile(original)
  inputs[engine] = resolve(proofRoot, `${engine}.${release.extension}`)
  await copyFile(original, inputs[engine])
  await chmod(inputs[engine], 0o444)
}
const runtimes = Object.fromEntries(Object.entries(RELEASES).map(([engine, release]) => [engine, {
  engine, imageId: build.imageId,
  definition: { version: release.version, extension: release.extension },
  capability: { executableSha256: release.executableSha256 }
}]))
const commandResults = logs => logs.trim().split('\n').filter(line => line && !/^warning: \d+ layer\(s\) flattened; layers, masks and blend modes are not kept$/.test(line)).map((line) => {
  assert(line.startsWith('{'), `Unexpected native diagnostic: ${line}`)
  const item = JSON.parse(line)
  assert(!item.error && !item.result?.warnings?.length && !item.result?.errors?.length, 'Native error/warning')
  return item
})
const resultOf = (receipt, command) => commandResults(receipt.logs).find(item => item.command === command)?.result
const commands = items => items.flatMap(([id, params]) => ['--cmd', id, '--params', JSON.stringify(params)])
async function absent(name) {
  assert.equal((await dockerCommand(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'])).trim(), '', 'Owned container remains')
}
async function checkFont(name, expected = FONT_PIN.sha256) {
  const actual = (await dockerCommand(['exec', name, 'sha256sum', FONT_PIN.containerPath])).trim().split(/\s+/)[0]
  assert.equal(actual, expected, 'Image font checksum mismatch')
}
async function run(engine, name, command, output, input = inputs[engine], strictLogs = true) {
  let containerName
  const outputPath = output ? resolve(proofRoot, output) : undefined
  const receipt = await executeLinuxContainer(runtimes[engine], {
    inputPath: input, outputPath, command, collect: output ? `/output/${output}` : undefined,
    request: { limits: { cpuCount: 2, memoryMb: 2048, maxProcesses: 32, timeoutMs: 90000, maxOutputBytes: 8 * 1024 * 1024 } },
    onContainer: (value) => { containerName = value }, beforeExecute: checkFont
  })
  await absent(containerName)
  const isolation = receipt.isolation
  assert.equal(isolation.user, '65532:65532')
  assert.equal(isolation.networkMode, 'none')
  assert.equal(isolation.readOnlyRootfs, true)
  assert.equal(isolation.memoryBytes, 2048 * 1024 * 1024)
  assert.equal(isolation.memorySwapBytes, isolation.memoryBytes)
  assert.equal(isolation.nanoCpus, 2e9)
  assert.equal(isolation.pidsLimit, 32)
  assert.deepEqual(isolation.capDrop, ['ALL'])
  assert(isolation.securityOpt.some(value => value.startsWith('no-new-privileges')))
  assert.equal(isolation.mounts.length, 1)
  assert.equal(isolation.mounts[0].RW, false)
  assert.equal(isolation.mounts[0].Source, input)
  assert.equal(isolation.mounts[0].Destination, `/input/document.${RELEASES[engine].extension}`)
  for (const path of ['/tmp', '/output']) for (const option of ['noexec', 'nosuid', 'nodev', 'size=']) assert(isolation.tmpfs[path].includes(option))
  if (strictLogs) commandResults(receipt.logs)
  // Reopened synthetic outputs become immutable staged inputs. Docker Desktop
  // can mask UID differences; real Linux UID 65532 cannot read a host 0600 file.
  if (outputPath) await chmod(outputPath, 0o444)
  receipts.push({ engine, name, command, ...receipt, fontSha256: FONT_PIN.sha256, output, outputSha256: outputPath ? await hashFile(outputPath) : undefined, cleanupVerified: true })
  await save('receipts.json', receipts)
  return receipt
}
function pngMetrics(bytes) {
  assert(bytes.length <= 8 * 1024 * 1024)
  const image = PNG.sync.read(bytes)
  assert(image.width <= 4096 && image.height <= 4096)
  let transparent = 0, partialAlpha = 0, nontransparent = 0
  for (let p = 3; p < image.data.length; p += 4) {
    if (image.data[p] === 0) transparent++
    else {
      nontransparent++
      if (image.data[p] < 255) partialAlpha++
    }
  }
  assert(transparent > 0 && partialAlpha > 0 && nontransparent > 0, 'Expected transparent canvas and antialiased rendering')
  return { width: image.width, height: image.height, bytes: bytes.length, sha256: sha256(bytes), rgbaSha256: sha256(image.data), transparent, partialAlpha, nontransparent }
}

try {
  for (const engine of Object.keys(RELEASES)) {
    const version = await run(engine, 'version', ['--version'], undefined, inputs[engine], false)
    assert(version.logs.includes(RELEASES[engine].version))
  }
  checks.bothPinnedVersionsExecute = true
  const text = 'COME CELEBRATE WITH US'
  const textStyle = { font: FONT_FACE.family, weight: 700, size: 32, x: 20, y: 100, color: '#172A40' }
  const newCanvas = ['run', '--new', JSON.stringify({ width: 800, height: 256, background: 'transparent', resolution: 72 })]
  const create = await run('photocraft', 'font-native-create', [...newCanvas, ...commands([
    ['type.fonts', { family: FONT_FACE.family }], ['type.create', { ...textStyle, text }], ['type.info', {}]
  ]), '--out', '/output/heading.pcraft'], 'heading.pcraft')
  const faces = resultOf(create, 'type.fonts').faces
  assert.deepEqual(faces.map(({ family, weight, italic, postscriptName }) => ({ family, weight, italic, postscriptName })), [FONT_FACE])
  const info = resultOf(create, 'type.info')
  assert.equal(info.text, text)
  const style = info.runs[0].style
  assert.equal(style.font_family, FONT_FACE.family)
  assert.equal(style.postscript_name, FONT_FACE.postscriptName)
  assert.equal(style.weight, 700)
  assert.equal(style.faux_bold, false)
  assert.equal(style.faux_italic, false)
  const reopen = await run('photocraft', 'font-native-reopen', ['run', '/input/document.pcraft', ...commands([['type.info', { layer: resultOf(create, 'type.create').layer }]])], undefined, resolve(proofRoot, 'heading.pcraft'))
  assert.deepEqual(resultOf(reopen, 'type.info'), info)
  checks.photoExactFaceAndNativeReopen = true
  const font = inspectPinnedFont(await readFile(resolve(root, `build/fonts/${FONT_PIN.file}`)))
  const metric = await run('photocraft', 'font-H-metrics', [...newCanvas, ...commands([['type.create', { ...textStyle, text: 'H', size: 100 }], ['type.info', {}]])])
  const line = resultOf(metric, 'type.info').lines[0]
  assert(Math.abs(line.x1 - font.advances[72] / font.unitsPerEm * 100) < 0.0001)
  assert(Math.abs(line.ascent - font.ascent / font.unitsPerEm * 100) < 0.0001)
  assert(Math.abs(line.descent + font.descent / font.unitsPerEm * 100) < 0.0001)
  checks.photoMetricsMatchPinnedFont = true
  const vector = await run('vectorcraft', 'font-native-edit', ['run', '--in', '/input/document.vectorcraft', ...commands([
    ['text.setStyle', { id: 2, font: FONT_FACE.family, style: 'Bold' }], ['text.setText', { id: 2, text }], ['text.fonts', {}], ['text.fontList', { family: FONT_FACE.family, style: 'Bold' }]
  ]), '--export', '/output/vector-font.vectorcraft'], 'vector-font.vectorcraft')
  const reports = commandResults(vector.logs).flatMap(item => item.result ?? item)
  assert(reports.some(item => item.family === FONT_FACE.family && item.style === 'Bold' && item.status === 'exact' && item.missing === false && item.missingGlyphs === 0))
  assert(!vector.logs.includes('substitute'))
  checks.vectorExactFaceNoMissingGlyphs = true
  const pngs = {}
  for (const [engine, native] of [['photocraft', 'heading.pcraft'], ['vectorcraft', 'vector-font.vectorcraft']]) {
    const input = resolve(proofRoot, native)
    await run(engine, 'preview', ['convert', `/input/document.${RELEASES[engine].extension}`, `/output/${engine}.png`], `${engine}.png`, input)
    await run(engine, 'repeat-preview', ['convert', `/input/document.${RELEASES[engine].extension}`, `/output/${engine}-repeat.png`], `${engine}-repeat.png`, input)
    const first = pngMetrics(await readFile(resolve(proofRoot, `${engine}.png`)))
    const second = pngMetrics(await readFile(resolve(proofRoot, `${engine}-repeat.png`)))
    assert.equal(first.rgbaSha256, second.rgbaSha256)
    pngs[engine] = first
  }
  checks.bothRenderAlphaAndRepeatPixelsExact = true
  // Verify the two independent pre-execution pins actually stop engine launch.
  for (const mismatch of ['executable', 'font']) {
    let containerName, outputBytes = 0
    const runtime = mismatch === 'executable' ? { ...runtimes.photocraft, capability: { executableSha256: '0'.repeat(64) } } : runtimes.photocraft
    let failure
    try {
      await executeLinuxContainer(runtime, {
        inputPath: inputs.photocraft, command: ['--version'],
        onContainer: (value) => { containerName = value },
        onOutput: (chunk) => { outputBytes += chunk.length },
        beforeExecute: mismatch === 'font' ? name => checkFont(name, '0'.repeat(64)) : checkFont
      })
    } catch (error) { failure = error }
    assert(failure && failure.code !== 'cleanup-failed')
    assert(failure.message.includes(mismatch === 'font' ? 'Image font checksum mismatch' : 'Image executable checksum mismatch'))
    assert.equal(outputBytes, 0)
    await absent(containerName)
    receipts.push({ name: `wrong-${mismatch}-pin`, containerName, rejectedBeforeEngine: true, cleanupVerified: true })
  }
  checks.wrongExecutableAndFontRejectBeforeEngine = true
  for (const [path, digest] of Object.entries(originals)) assert.equal(await hashFile(path), digest)
  for (const [path, digest] of Object.entries(sourceHashes)) assert.equal(await hashFile(resolve(path)), digest, 'Qualification source changed during proof')
  checks.originalsUnchanged = true
  checks.sourcesUnchanged = true
  checks.everyOwnedContainerAbsent = true
  await save('receipts.json', receipts)
  const disk = await statfs(root)
  const evidence = {
    schema: 'banner-engine-amd64-qualification-v1', qualificationStatus: 'passed', ...execution,
    imageId: build.imageId, imageBytes: inspected.Size, engines: RELEASES, font: FONT_PIN,
    daemon: { os: daemon.OSType, architecture: daemon.Architecture, version: daemon.ServerVersion },
    checks, pngs, sourceHashes, originalHashes: originals, diskFreeAfter: disk.bavail * disk.bsize,
    scope: 'Synthetic native Craft CLI/font/PNG/isolation/cleanup on the recorded daemon; no hosted acceptance, durable remote authority, native import fidelity or production capability registration'
  }
  await save('qualification.json', evidence)
  await writeFile(resolve(root, 'latest.json'), JSON.stringify({ path: proofRoot, qualificationSha256: await hashFile(resolve(proofRoot, 'qualification.json')) }, null, 2) + '\n')
  console.log(JSON.stringify({ proofRoot, ...execution, imageId: build.imageId, checks, pngs }))
} catch (error) {
  await save('failure.json', { message: error.message, ...execution, receipts, sourceHashes })
  throw error
}
