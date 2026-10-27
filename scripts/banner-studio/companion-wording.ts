/** Local operator adapter. JSON proposes wording; it never establishes browser authority. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import {
  COMPANION_REQUEST_MAX_BYTES,
  parseCompanionRequest,
  validateCompanionProposal
} from '../../shared/bannerCompanion'
import {
  canonicalBridgeJson,
  hashBridgeValue
} from '../../shared/bannerDocumentBridge'
import { resolveBannerFormat } from '../../shared/bannerFormats'
import {
  exportLinuxProject,
  editLinuxWording
} from '../../workers/banner-engine/native/photocraft'

const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')
const outputRoot = resolve('output')
const json = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600
  })

async function confined(path: string, existing: boolean) {
  assert(
    typeof path === 'string'
    && path.length > 0
    && !path.includes('\0')
    && !path.includes('://'),
    'Only local output paths are allowed'
  )
  const full = resolve(path),
    rel = relative(outputRoot, full)
  assert(
    rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    'Path must be inside this workspace output directory'
  )
  // Check every component, including the root; no symbolic parent is authority.
  const target = existing ? full : dirname(full)
  let current = outputRoot
  assert(
    (await lstat(current)).isDirectory()
    && !(await lstat(current)).isSymbolicLink(),
    'Output directory must not be a symbolic link'
  )
  for (const segment of relative(outputRoot, target)
    .split(sep)
    .filter(Boolean)) {
    current = resolve(current, segment)
    assert(
      !(await lstat(current)).isSymbolicLink(),
      'Symbolic links are not allowed'
    )
  }
  assert.equal(
    await realpath(target),
    target,
    'Path resolves outside the owned output tree'
  )
  return full
}

async function readRequest(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    assert(
      stat.isFile()
      && stat.size > 0
      && stat.size <= COMPANION_REQUEST_MAX_BYTES,
      'Request must be a regular file up to 64 MiB'
    )
    const bytes = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        offset,
        bytes.length - offset,
        offset
      )
      if (!bytesRead) break
      offset += bytesRead
    }
    assert.equal(offset, stat.size, 'Request size changed while reading')
    return bytes.subarray(0, offset)
  } finally {
    await file.close()
  }
}

export async function runCompanionWording(options: {
  request: string
  text: string
  out: string
}) {
  const owned = structuredClone(options)
  const requestPath = await confined(owned.request, true)
  const bytes = await readRequest(requestPath),
    request = parseCompanionRequest(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    )
  assert.equal(
    await hashBridgeValue(request.snapshot),
    request.sourceHash,
    'Request source hash does not match its snapshot'
  )
  const { snapshot: _snapshot, ...identity } = request
  const proposal = validateCompanionProposal(
    {
      ...identity,
      text: owned.text,
      engine: { name: 'PhotoCraft', version: '0.16.0', platform: 'linux' }
    },
    request
  )
  const format = resolveBannerFormat(request.boardKey)
  assert(
    format && format.w <= 4096 && format.h <= 4096,
    'Unsupported companion artboard dimensions'
  )
  const out = await confined(owned.out, false)
  // Exclusive root: a failed operation remains evidence and is never reused.
  await mkdir(out, { mode: 0o700 })
  await json(resolve(out, 'request-binding.json'), {
    requestId: request.requestId,
    sourceHash: request.sourceHash,
    requestBytesHash: digest(bytes),
    layerId: request.layerId
  })
  const exportRoot = resolve(out, 'export'),
    editRoot = resolve(out, 'edit')
  await mkdir(exportRoot, { mode: 0o700 })
  await mkdir(editRoot, { mode: 0o700 })
  const exported = await exportLinuxProject({
    root: exportRoot,
    project: request.snapshot,
    key: request.boardKey,
    revision: request.revision,
    dimensions: { width: format.w, height: format.h },
    layerIds: [request.layerId]
  })
  assert.deepEqual(
    exported.mappings.map(mapping => mapping.bannerId),
    [request.layerId],
    'Native export must contain exactly the selected heading'
  )
  assert.equal(
    exported.sidecar.sourceHash,
    request.sourceHash,
    'Native export source changed'
  )
  assert.equal(
    exported.sidecar.linuxBinding.font.sha256,
    request.fontHash,
    'Native font differs from requested font'
  )
  const result = await editLinuxWording({
    root: editRoot,
    sidecar: exported.sidecar,
    expectedSidecarHash: exported.sidecarHash,
    currentProject: request.snapshot,
    currentRevision: request.revision,
    nativePath: exported.nativePath,
    layerId: request.layerId,
    text: proposal.text
  })
  const expected = structuredClone(request.snapshot)
  const layer = expected.canvasData[request.boardKey]!.layers.find(
    item => item.id === request.layerId
  )!
  const before = layer.text
  layer.text = proposal.text
  assert.deepEqual(
    result.plan.changes,
    [{ layerId: request.layerId, before, after: proposal.text }],
    'Native return must change only the selected wording'
  )
  assert.equal(
    canonicalBridgeJson(result.plan.after),
    canonicalBridgeJson(expected),
    'Native return changed other artwork data'
  )
  await confined(requestPath, true)
  assert.equal(
    digest(await readRequest(requestPath)),
    digest(bytes),
    'Request input changed during native execution'
  )
  await json(resolve(out, 'proposal.json'), proposal)
  await json(resolve(out, 'receipt.json'), {
    requestId: request.requestId,
    sourceHash: request.sourceHash,
    fontHash: request.fontHash,
    proposalHash: await hashBridgeValue(proposal),
    nativePath: result.nativePath,
    nativeImage: exported.sidecar.linuxBinding.imageId,
    scope:
      'Local native execution; returned file is an untrusted wording proposal, not authenticated engine proof.'
  })
  return { proposal, proposalPath: resolve(out, 'proposal.json') }
}

export function parseCompanionArgs(args: string[]) {
  assert(
    args.length === 6,
    'Usage: companion-wording.ts --request output/request.json --text WORDING --out output/new-directory'
  )
  const values: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!
    assert(
      ['--request', '--text', '--out'].includes(key) && !(key in values),
      'Unknown or duplicate companion argument'
    )
    values[key] = args[i + 1]!
  }
  return {
    request: values['--request']!,
    text: values['--text']!,
    out: values['--out']!
  }
}
if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCompanionWording(parseCompanionArgs(process.argv.slice(2)))
    .then(result => console.log(result.proposalPath))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
