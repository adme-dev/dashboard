import assert from 'node:assert/strict'
import { readFile, realpath, lstat, mkdir } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BannerProject } from '../../app/types/banner-studio'
import { exportLinuxProject, editLinuxWording, proposeLinuxReturn, type LinuxSidecar } from '../../workers/banner-engine/native/photocraft'

async function ownedPath(value: string, exists = true) {
  assert(value && !value.includes('\0') && !value.includes('://'), 'Expected an explicit owned local path')
  const root = await realpath(resolve('output')), path = resolve(value)
  const resolved = exists ? await realpath(path) : join(await realpath(dirname(path)), basename(path))
  const rel = relative(root, resolved)
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Paths must remain under workspace output/')
  if (exists) {
    const stat = await lstat(path)
    assert(stat.isFile() && !stat.isSymbolicLink(), 'Expected a regular owned file')
  }
  return resolved
}

async function json(path: string) {
  assert((await lstat(path)).size <= 64 * 1024 * 1024, 'JSON exceeds bridge budget')
  const bytes = await readFile(path)
  assert(bytes.length <= 64 * 1024 * 1024, 'JSON grew beyond bridge budget')
  return JSON.parse(bytes.toString('utf8'))
}

async function main() {
  const [command, ...argv] = process.argv.slice(2)
  if (!['export', 'edit', 'import'].includes(command || '')) {
    console.log('Linux PhotoCraft text-only bridge; accepted exact-font image required.\nexport --project output/project.json --board key --width 256 --height 256 --revision 1 --out output/new-export\nedit --project output/project.json --revision 1 --sidecar output/export/document-sidecar.json --sidecar-sha256 TRUSTED_EXPORT_DIGEST --native output/export/document.pcraft --layer 125 --text "COME CELEBRATE WITH US" --out output/new-edit\nimport --project output/project.json --revision 1 --sidecar output/export/document-sidecar.json --sidecar-sha256 TRUSTED_EXPORT_DIGEST --native output/edit/document.pcraft --out output/new-return\nEach output directory must be new. Return creates a proposal only; host owns reviewed single-transaction apply.')
    if (command && command !== '--help') process.exitCode = 1
    return
  }
  const allowed = new Set(command === 'export' ? ['project', 'board', 'width', 'height', 'revision', 'out'] : ['project', 'revision', 'sidecar', 'sidecar-sha256', 'native', 'out', ...(command === 'edit' ? ['layer', 'text'] : [])])
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2)
    assert(argv[i]?.startsWith('--') && key && allowed.has(key) && !Object.hasOwn(args, key) && argv[i + 1], 'Unknown, duplicate or missing argument')
    args[key] = argv[i + 1]!
  }
  for (const key of allowed) assert(args[key], `Missing --${key}`)
  const revision = Number(args.revision)
  assert(Number.isSafeInteger(revision) && revision >= 0, 'Invalid revision')
  const project = await json(await ownedPath(args.project!)) as BannerProject
  const root = await ownedPath(args.out!, false)
  if (command === 'export') {
    await mkdir(root, { mode: 0o700 })
    const result = await exportLinuxProject({ project, key: args.board!, dimensions: { width: Number(args.width), height: Number(args.height) }, revision, root })
    console.log(JSON.stringify({ root, sidecarHash: result.sidecarHash, sourceHash: result.sidecar.sourceHash, mapped: result.mappings.length, nativePath: result.nativePath }, null, 2))
  } else {
    assert(/^[a-f0-9]{64}$/.test(args['sidecar-sha256']!), 'Expected trusted export digest')
    const sidecar = await json(await ownedPath(args.sidecar!)) as LinuxSidecar
    const nativePath = await ownedPath(args.native!)
    const layerId = Number(args.layer)
    if (command === 'edit') assert(Number.isSafeInteger(layerId), 'Invalid selected layer')
    await mkdir(root, { mode: 0o700 })
    const options = { sidecar, expectedSidecarHash: args['sidecar-sha256']!, currentProject: project, currentRevision: revision, nativePath, root }
    const result = command === 'edit' ? await editLinuxWording({ ...options, layerId, text: args.text! }) : await proposeLinuxReturn(options)
    console.log(JSON.stringify({ root, changes: result.plan.changes, textFit: result.plan.textFit, requiresReview: true }, null, 2))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
