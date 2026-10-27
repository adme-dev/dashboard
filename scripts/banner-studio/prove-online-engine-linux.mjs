import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import {
  loadLinuxRuntime,
  executeLinuxContainer,
  dockerCommand,
  runtimeRoot
} from '../../workers/banner-engine/runtime/render-preview.mjs'

const root = resolve(
  runtimeRoot,
  `proof-${new Date().toISOString().replaceAll(':', '-')}`
)
await mkdir(root, { recursive: true })
const sha = data => createHash('sha256').update(data).digest('hex')
const receipts = []
const checks = {}
const originals = {
  photocraft: resolve(
    'output/editable-artwork-animation/crafting-apps/photocraft/fixture.pcraft'
  ),
  vectorcraft: resolve(
    'output/editable-artwork-animation/crafting-apps/vectorcraft/fixtures/native-before.vectorcraft'
  )
}
const inputs = {}
const beforeHashes = {}
for (const [engine, original] of Object.entries(originals)) {
  beforeHashes[engine] = sha(await readFile(original))
  inputs[engine] = resolve(
    root,
    engine === 'photocraft' ? 'source.pcraft' : 'source.vectorcraft'
  )
  await cp(original, inputs[engine])
}
async function run(
  engine,
  name,
  command,
  outputName,
  inputPath = inputs[engine]
) {
  const runtime = await loadLinuxRuntime(
    engine,
    resolve(runtimeRoot, 'runtime-prepared.json'),
    { allowPrepared: true }
  )
  const outputPath = outputName ? resolve(root, outputName) : undefined
  const receipt = await executeLinuxContainer(runtime, {
    inputPath,
    command,
    collect: outputName ? `/output/${outputName}` : undefined,
    outputPath
  })
  receipts.push({
    engine,
    name,
    command,
    ...receipt,
    output: outputName,
    sha256: outputPath ? sha(await readFile(outputPath)) : undefined,
    cleanupVerified: true
  })
  await writeFile(
    resolve(root, 'receipts.json'),
    JSON.stringify(receipts, null, 2) + '\n'
  )
  return outputPath
}
const photoNative = name => [
  'convert',
  '/input/document.pcraft',
  `/output/${name}`
]
const photoRun = (commands, output) => [
  'run',
  '/input/document.pcraft',
  ...commands.flatMap(([id, params]) => [
    '--cmd',
    id,
    '--params',
    JSON.stringify(params)
  ]),
  '--out',
  `/output/${output}`
]
const vectorRun = (commands, output) => [
  'run',
  '--in',
  '/input/document.vectorcraft',
  ...commands.flatMap(([id, params]) => [
    '--cmd',
    id,
    '--params',
    JSON.stringify(params)
  ]),
  '--export',
  `/output/${output}`
]
function photoManifest(path) {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        'import zipfile,json,sys; print(zipfile.ZipFile(sys.argv[1]).read("manifest.json").decode())',
        path
      ],
      { maxBuffer: 8 * 1024 * 1024 }
    ).toString()
  )
}
async function png(path) {
  return PNG.sync.read(await readFile(path))
}
const sample = (im, x, y) => [
  ...im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4)
]
for (const engine of Object.keys(inputs))
  await run(engine, 'version', ['--version'])
const photoPreview = await run(
  'photocraft',
  'preview',
  photoNative('photo.png'),
  'photo.png'
)
const photoResave = await run(
  'photocraft',
  'native-resave',
  photoNative('resaved.pcraft'),
  'resaved.pcraft'
)
const photoReopen = await run(
  'photocraft',
  'native-reopen-preview',
  photoNative('reopened.png'),
  'reopened.png',
  photoResave
)
const photoEdited = await run(
  'photocraft',
  'edit-native-text',
  photoRun(
    [['type.edit', { layer: 3, text: 'LINUX NATIVE TYPE' }]],
    'edited.pcraft'
  ),
  'edited.pcraft'
)
const photoEditedPng = await run(
  'photocraft',
  'edited-preview',
  photoNative('edited.png'),
  'edited.png',
  photoEdited
)
const photoUndo = await run(
  'photocraft',
  'text-undo',
  photoRun(
    [
      ['type.edit', { layer: 3, text: 'LINUX NATIVE TYPE' }],
      ['edit.undo', {}]
    ],
    'undone.png'
  ),
  'undone.png'
)
const photoVectorOff = await run(
  'photocraft',
  'independent-vector-mask',
  photoRun(
    [['layer.vectorMask.enabled', { layer: 2, enabled: false }]],
    'vector-disabled.png'
  ),
  'vector-disabled.png'
)
const photoPixelOff = await run(
  'photocraft',
  'independent-pixel-mask',
  photoRun(
    [['layer.layerMask.enabled', { layer: 2, enabled: false }]],
    'pixel-disabled.png'
  ),
  'pixel-disabled.png'
)
const source = photoManifest(inputs.photocraft)
const saved = photoManifest(photoResave)
const edited = photoManifest(photoEdited)
assert.deepEqual(saved.document.layers, source.document.layers)
checks.photoNativeLayersExact = true
assert.equal(edited.document.layers[1].content.kind, 'text')
assert.equal(edited.document.layers[1].content.text, 'LINUX NATIVE TYPE')
checks.photoEditedNativeText = true
assert.deepEqual(edited.document.layers[0], source.document.layers[0])
checks.photoUnselectedRasterAndMasksExact = true
const photo = await png(photoPreview)
const photoSamples = [
  [0, 0],
  [60, 160],
  [130, 160],
  [25, 160],
  [40, 160],
  [43, 160],
  [50, 160]
].map(([x, y]) => ({ x, y, rgba: sample(photo, x, y) }))
assert.deepEqual(sample(photo, 0, 0), [0, 0, 0, 0])
assert.deepEqual(sample(photo, 60, 160), [240, 80, 40, 128])
assert.equal(sample(photo, 130, 160)[3], 0)
assert.deepEqual(
  sample(await png(photoVectorOff), 130, 160),
  [240, 80, 40, 128]
)
assert.equal(sample(await png(photoPixelOff), 40, 160)[3], 128)
checks.photoIndependentAlphaPixelVectorMasks = true
assert.deepEqual((await png(photoReopen)).data, photo.data)
assert.deepEqual((await png(photoUndo)).data, photo.data)
checks.photoLinuxNativeReopenAndUndoPixelExact = true
assert.notDeepEqual((await png(photoEditedPng)).data, photo.data)
checks.photoLinuxTextEditChangesPixels = true
const vectorPreview = await run(
  'vectorcraft',
  'preview',
  ['convert', '/input/document.vectorcraft', '/output/vector.png'],
  'vector.png'
)
const vectorSaved = await run(
  'vectorcraft',
  'native-resave',
  vectorRun([], 'resaved.vectorcraft'),
  'resaved.vectorcraft'
)
const vectorEdited = await run(
  'vectorcraft',
  'edit-native-text',
  vectorRun(
    [['text.setText', { id: 2, text: 'LINUX NATIVE TYPE' }]],
    'edited.vectorcraft'
  ),
  'edited.vectorcraft'
)
const vectorReopen = await run(
  'vectorcraft',
  'native-reopen-preview',
  ['convert', '/input/document.vectorcraft', '/output/vector-reopened.png'],
  'vector-reopened.png',
  vectorSaved
)
const vectorSource = JSON.parse(await readFile(inputs.vectorcraft, 'utf8'))
const vectorSavedDoc = JSON.parse(await readFile(vectorSaved, 'utf8'))
const vectorEditedDoc = JSON.parse(await readFile(vectorEdited, 'utf8'))
assert.deepEqual(vectorSavedDoc.document.layers, vectorSource.document.layers)
checks.vectorNativeLayersExact = true
const children = vectorEditedDoc.document.layers[0].kind.children
assert.equal(children[0].kind.type, 'text')
assert.equal(
  children[0].kind.runs.map(r => r.text).join(''),
  'LINUX NATIVE TYPE'
)
assert.deepEqual(
  children[0].kind.xf,
  vectorSource.document.layers[0].kind.children[0].kind.xf
)
checks.vectorEditedNativeTextAndTransform = true
assert.deepEqual(
  children.slice(1),
  vectorSource.document.layers[0].kind.children.slice(1)
)
checks.vectorUnselectedClipMaskExact = true
const vector = await png(vectorPreview)
const vectorSamples = [
  [60, 170],
  [100, 170],
  [350, 170],
  [400, 170],
  [510, 170],
  [600, 300]
].map(([x, y]) => ({ x, y, rgba: sample(vector, x, y) }))
assert.equal(sample(vector, 60, 170)[3], 0)
assert.equal(sample(vector, 100, 170)[3], 255)
assert.equal(sample(vector, 400, 170)[3], 128)
assert.equal(sample(vector, 510, 170)[3], 0)
checks.vectorClippingAndFractionalMask = true
assert.deepEqual((await png(vectorReopen)).data, vector.data)
checks.vectorLinuxNativeReopenPixelExact = true
for (const [engine, path] of Object.entries(originals))
  assert.equal(sha(await readFile(path)), beforeHashes[engine])
checks.originalsUnchanged = true
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
assert(
  !containers
    .split('\n')
    .some(name => receipts.some(receipt => receipt.containerName === name))
)
checks.ownedContainersRemoved = true
const acceptance = {
  createdAt: new Date().toISOString(),
  checks,
  photoSamples,
  vectorSamples,
  originals: beforeHashes,
  typography:
    'Arial absent in Linux; PhotoCraft original native cache is preserved. Editing text uses a fallback. VectorCraft warns Inter Bold resolves to Inter SemiBold. No requested-font fidelity claim.',
  scope:
    'Actual Linux ARM64 native CLI execution. Reopen/undo comparisons are Linux-to-Linux; earlier macOS evidence is fixture provenance only.',
  runtime: JSON.parse(
    await readFile(resolve(runtimeRoot, 'runtime-prepared.json'), 'utf8')
  ),
  artifacts: receipts
    .filter(r => r.output)
    .map(r => ({ path: r.output, sha256: r.sha256 })),
  cleanupVerified: true
}
await writeFile(
  resolve(root, 'acceptance.json'),
  JSON.stringify(acceptance, null, 2) + '\n'
)
const acceptedRuntime = {
  ...structuredClone(acceptance.runtime),
  status: 'accepted'
}
for (const [engine, entry] of Object.entries(acceptedRuntime.engines)) {
  const proof = {
    engine,
    version: entry.version,
    executableSha256: entry.executableSha256,
    imageId: acceptedRuntime.imageId,
    acceptanceSha256: sha(await readFile(resolve(root, 'acceptance.json'))),
    acceptancePath: resolve(root, 'acceptance.json'),
    checks
  }
  const proofBytes = JSON.stringify(proof, null, 2) + '\n'
  await writeFile(
    resolve(runtimeRoot, `${engine}-capability-proof.json`),
    proofBytes
  )
  entry.capabilityProofSha256 = sha(proofBytes)
}
await writeFile(
  resolve(runtimeRoot, 'runtime.json'),
  JSON.stringify(acceptedRuntime, null, 2) + '\n'
)
await writeFile(
  resolve(runtimeRoot, 'latest.json'),
  JSON.stringify(
    { root, acceptance: resolve(root, 'acceptance.json') },
    null,
    2
  ) + '\n'
)
console.log(JSON.stringify({ root, checks, photoSamples, vectorSamples }))
