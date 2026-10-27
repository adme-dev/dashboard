import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FONT_FACE, FONT_PIN, fontRuntimeRoot, loadFontRuntime, executeFontContainer, assertSupportedText, sha256 } from '../../workers/banner-engine/fonts/runtime.mjs'
import { dockerCommand } from '../../workers/banner-engine/runtime/render-preview.mjs'

const root = resolve(fontRuntimeRoot, `proof-${new Date().toISOString().replaceAll(':', '-')}`)
await mkdir(root)
const preparedPath = resolve(fontRuntimeRoot, 'runtime-prepared.json')
const runtime = await loadFontRuntime('photocraft', preparedPath, { allowPrepared: true })
const vectorRuntime = await loadFontRuntime('vectorcraft', preparedPath, { allowPrepared: true })
const receipts = [], checks = {}
const sentinel = resolve(fontRuntimeRoot, 'downloads/LICENSE.md')
const save = async (name, value) => writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
// PNG export necessarily flattens; only this exact known diagnostic is allowed.
// Font substitution, missing glyphs and all other diagnostics reject the proof.
const commandResults = logs => logs.trim().split('\n').filter(line => line && !/^warning: \d+ layer\(s\) flattened; layers, masks and blend modes are not kept$/.test(line)).map((line) => {
  assert(line.startsWith('{'), `Unexpected native warning/output: ${line}`)
  const item = JSON.parse(line)
  assert(!item.error, 'Native command error')
  assert(!item.result?.warnings?.length && !item.result?.errors?.length, 'Native warning/error')
  return item
})
const resultOf = (receipt, command) => commandResults(receipt.logs).find(item => item.command === command)?.result
const commands = items => items.flatMap(([id, params]) => ['--cmd', id, '--params', JSON.stringify(params)])
async function run(name, command, output, inputPath = sentinel, engine = runtime) {
  const outputPath = output ? resolve(root, output) : undefined
  const receipt = await executeFontContainer(engine, { inputPath, command, collect: output ? `/output/${output}` : undefined, outputPath })
  assert.equal((await dockerCommand(['ps', '-a', '--filter', `name=^/${receipt.containerName}$`, '--format', '{{.Names}}'])).trim(), '')
  assert.equal(receipt.isolation.networkMode, 'none')
  assert.equal(receipt.isolation.readOnlyRootfs, true)
  assert.equal(receipt.isolation.user, '65532:65532')
  assert.equal(receipt.fontSha256, FONT_PIN.sha256)
  commandResults(receipt.logs)
  receipts.push({ name, command, ...receipt, cleanupVerified: true, output, outputSha256: outputPath ? sha256(await readFile(outputPath)) : undefined })
  await writeFile(resolve(root, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n')
  return receipt
}
const newCanvas = ['run', '--new', JSON.stringify({ width: 4096, height: 256, background: 'transparent', resolution: 72 })]
const textStyle = { font: FONT_FACE.family, weight: FONT_FACE.weight, size: 32, x: 20, y: 100, color: '#172A40' }
const text = 'COME CELEBRATE WITH US'
assertSupportedText({ fontFamily: FONT_FACE.family, fontWeight: 700, fontSize: 32 }, text, runtime.font)
const create = await run('exact-native-face', [...newCanvas, ...commands([['type.fonts', { family: FONT_FACE.family }], ['type.create', { ...textStyle, text }], ['type.info', {}]]), '--out', '/output/heading.pcraft'], 'heading.pcraft')
const faces = resultOf(create, 'type.fonts').faces
assert.deepEqual(faces.map(({ family, weight, italic, postscriptName }) => ({ family, weight, italic, postscriptName })), [FONT_FACE])
assert.deepEqual(faces[0].axes, [])
function checkInfo(info, expected) {
  assert.equal(info.text, expected)
  assert.equal(info.runs.length, 1)
  assert.equal(info.lines.length, 1)
  const style = info.runs[0].style
  assert.equal(style.font_family, FONT_FACE.family)
  assert.equal(style.weight, FONT_FACE.weight)
  assert.equal(style.postscript_name, FONT_FACE.postscriptName)
  assert.equal(style.faux_bold, false)
  assert.equal(style.faux_italic, false)
  assert.deepEqual(style.variations, [])
  assert(info.lines[0].x1 > 0 && info.lines[0].ascent > 0 && info.lines[0].descent > 0)
}
checkInfo(resultOf(create, 'type.info'), text)
checks.photoExactNativeFace = true
const reopen = await run('saved-native-reopen', ['run', '/input/document.pcraft', ...commands([['type.info', { layer: resultOf(create, 'type.create').layer }]])], undefined, resolve(root, 'heading.pcraft'))
checkInfo(resultOf(reopen, 'type.info'), text)
assert.deepEqual(resultOf(reopen, 'type.info'), resultOf(create, 'type.info'))
checks.photoSavedNativeFaceMetricsExact = true
await run('native-preview', ['convert', '/input/document.pcraft', '/output/heading.png'], 'heading.png', resolve(root, 'heading.pcraft'))

const specimen = runtime.font.coverage.map(code => String.fromCodePoint(code)).join('')
assertSupportedText({ fontFamily: FONT_FACE.family, fontWeight: 700, fontSize: 16 }, specimen, runtime.font)
const glyphProbe = await run('all-allowed-glyphs', [...newCanvas, ...commands([['type.create', { ...textStyle, text: specimen, size: 16 }], ['type.info', {}]]), '--out', '/output/glyphs.png'], 'glyphs.png')
checkInfo(resultOf(glyphProbe, 'type.info'), specimen)
assert.equal(runtime.font.coverage.length, 198)
checks.all198AllowedCharactersInPinnedCmapAndNativeRun = true
const metricProbe = await run('single-glyph-metrics', [...newCanvas, ...commands([['type.create', { ...textStyle, text: 'H', size: 100 }], ['type.info', {}]])])
const line = resultOf(metricProbe, 'type.info').lines[0]
assert(Math.abs(line.x1 - runtime.font.advances[72] / runtime.font.unitsPerEm * 100) < 0.0001)
assert(Math.abs(line.ascent - runtime.font.ascent / runtime.font.unitsPerEm * 100) < 0.0001)
assert(Math.abs(line.descent + runtime.font.descent / runtime.font.unitsPerEm * 100) < 0.0001)
checks.nativeGlyphAdvanceAscentDescentMatchPinnedFont = true
await save('metrics.json', { font: runtime.font, actualHeading: resultOf(create, 'type.info'), actualSingleGlyph: resultOf(metricProbe, 'type.info'), actualAllGlyphs: resultOf(glyphProbe, 'type.info') })

const vectorInput = resolve('output/editable-artwork-online-engine/linux/fixtures/vectorcraft.vectorcraft')
const vectorSourceHash = sha256(await readFile(vectorInput))
const vector = await run('vector-exact-face', ['run', '--in', '/input/document.vectorcraft', ...commands([['text.setStyle', { id: 2, font: FONT_FACE.family, style: 'Bold' }], ['text.setText', { id: 2, text }], ['text.fonts', {}], ['text.fontList', { family: FONT_FACE.family, style: 'Bold' }]]), '--export', '/output/vector-font.vectorcraft'], 'vector-font.vectorcraft', vectorInput, vectorRuntime)
// VectorCraft prints command result envelopes in a different shape; retain all
// JSON and verify the actual resolved font status, not just requested style.
await save('vector-results.json', commandResults(vector.logs))
assert(!vector.logs.includes('substitute') && !vector.logs.includes('missingGlyphs":["'), 'Vector font fallback')
const fontReport = commandResults(vector.logs).flatMap(item => item.result ?? item)
assert(fontReport.some(item => item.family === FONT_FACE.family && item.style === 'Bold' && item.status === 'exact' && item.missing === false && item.missingGlyphs === 0), 'Exact VectorCraft face not observed')
checks.vectorExactBoldFaceNoMissingGlyphs = true
assert.equal(sha256(await readFile(vectorInput)), vectorSourceHash)
checks.priorVectorSourceUnchanged = true

// Actual missing-font image is the old accepted image. The engine must never run.
async function rejectedImage(name, imageId) {
  let containerName, loggedBytes = 0, error
  try {
    await executeFontContainer({ ...runtime, imageId }, {
      inputPath: sentinel,
      command: ['--version'],
      onContainer: (value) => { containerName = value },
      onOutput: (chunk) => { loggedBytes += chunk.length }
    })
  } catch (failure) { error = failure }
  assert(error && error.code !== 'cleanup-failed', `${name} must reject with verified cleanup`)
  assert(/^banner-engine-[a-f0-9-]+$/.test(containerName), 'Missing owned container identity')
  if (name === 'missing-font') {
    assert(error.message.includes(`${FONT_PIN.containerPath}: No such file or directory`), 'Failure did not reach missing-font verification')
  } else {
    assert(error.message.includes('Image font checksum mismatch'), 'Failure did not reach font checksum verification')
  }
  assert.equal(loggedBytes, 0)
  assert.equal((await dockerCommand(['ps', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}'])).trim(), '')
  receipts.push({ name, imageId, containerName, error: error.message, loggedBytes, cleanupVerified: true })
  await writeFile(resolve(root, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n')
}
await rejectedImage('missing-font', 'sha256:1fbdad626b0f743bfcd4fd308342b7feeb877473579da2ca52d0e97cda9597f8')
checks.missingFontRejectsBeforeEngineAndCleans = true
const negativeRoot = resolve(root, 'tampered-image')
await mkdir(negativeRoot)
await writeFile(resolve(negativeRoot, 'Dockerfile'), 'FROM xeroflow-banner-engine:linux-fonts-v1\nUSER 0\nRUN chmod 0644 /usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf && printf tampered > /usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf && chmod 0444 /usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf\nUSER 65532:65532\n')
assert.equal((await dockerCommand(['image', 'inspect', '--format', '{{.Id}}', 'xeroflow-banner-engine:linux-fonts-v1'])).trim(), runtime.imageId)
await writeFile(resolve(negativeRoot, 'build.log'), await dockerCommand(['build', '--network=none', '--tag', 'xeroflow-banner-engine:linux-fonts-v1-tamper-proof', negativeRoot], { timeoutMs: 90000, maxLogBytes: 1048576 }))
const tamperedId = (await dockerCommand(['image', 'inspect', '--format', '{{.Id}}', 'xeroflow-banner-engine:linux-fonts-v1-tamper-proof'])).trim()
await rejectedImage('tampered-font', tamperedId)
checks.tamperedFontRejectsBeforeEngineAndCleans = true
for (const [changedLayer, changedText] of [[{ fontWeight: 400 }, text], [{ fontWeight: 900 }, text], [{ fontFamily: 'Arial' }, text], [{ fontStyle: 'italic' }, text], [{}, '😀'], [{}, '漢'], [{}, 'A\nB']]) {
  assert.throws(() => assertSupportedText({ fontFamily: FONT_FACE.family, fontWeight: 700, fontSize: 32, ...changedLayer }, changedText, runtime.font))
}
checks.unsupportedFamilyWeightStyleGlyphsReject = true
checks.everySuccessfulContainerNoNetworkReadOnlyNonrootAndRemoved = true
const acceptance = { schema: 'banner-linux-fonts-v1', imageId: runtime.imageId, font: FONT_PIN, checks, scope: 'Actual Linux exact native face and bounded glyph metrics; not full artwork, hosted or print acceptance' }
await save('acceptance.json', acceptance)
assert(Object.values(checks).every(value => value === true))
if (process.argv.includes('--verify-only')) {
  const accepted = await loadFontRuntime()
  assert.equal(accepted.imageId, runtime.imageId)
  console.log(JSON.stringify({ root, imageId: runtime.imageId, checks, acceptedManifestUnchanged: true }))
  process.exit(0)
}
const manifest = JSON.parse(await readFile(preparedPath, 'utf8'))
manifest.status = 'accepted'
for (const engine of ['photocraft', 'vectorcraft']) {
  const proof = { engine, version: manifest.engines[engine].version, executableSha256: manifest.engines[engine].executableSha256, imageId: runtime.imageId, font: FONT_PIN, acceptancePath: resolve(root, 'acceptance.json'), acceptanceSha256: sha256(await readFile(resolve(root, 'acceptance.json'))) }
  const bytes = JSON.stringify(proof, null, 2) + '\n'
  await writeFile(resolve(fontRuntimeRoot, `${engine}-capability-proof.json`), bytes, { flag: 'wx' })
  manifest.engines[engine].capabilityProofSha256 = sha256(bytes)
}
await writeFile(resolve(fontRuntimeRoot, 'runtime.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
await writeFile(resolve(fontRuntimeRoot, 'latest.json'), JSON.stringify({ root, imageId: runtime.imageId, checks }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ root, imageId: runtime.imageId, checks }))
