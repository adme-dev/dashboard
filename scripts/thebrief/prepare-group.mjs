import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { inspectArchive, readArchiveEntries } from './inspect-archive.mjs'
import { mergeTheBriefPackages } from './merge-packages.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import.ts'

export const MAX_THEBRIEF_ZIP_BYTES = 64 * 1024 * 1024
const MAX_PREPARED_BYTES = 128 * 1024 * 1024
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** Complete archive validation precedes extraction. Imported scripts are never run. */
export async function prepareTheBriefGroup(input, fileName = 'TheBrief.zip') {
  const bytes = Buffer.from(input)
  if (!bytes.length || bytes.length > MAX_THEBRIEF_ZIP_BYTES) throw new Error('Choose a TheBrief ZIP no larger than 64 MB')
  const outerLimits = { maxArchiveBytes: MAX_THEBRIEF_ZIP_BYTES, maxFileBytes: MAX_THEBRIEF_ZIP_BYTES, maxTotalBytes: 128 * 1024 * 1024, maxFiles: 1500, requireDefaultChildLimits: 1 }
  const inventory = inspectArchive(bytes, outerLimits)
  const entries = readArchiveEntries(bytes, outerLimits)
  const nested = entries.filter(entry => /\.zip$/i.test(entry.name))
  if (nested.length && nested.length !== entries.length) throw new Error('A group ZIP must contain only the individual HTML5 ZIPs')
  if (!nested.length) inspectArchive(bytes, { maxDepth: 0 })
  const sources = nested.length ? nested : [{ name: basename(fileName), data: bytes }]
  const groups = new Map()
  for (const entry of sources) {
    const match = /^(.*)-(\d+)x(\d+)-px\.zip$/i.exec(entry.name)
    const key = match?.[1] || entry.name.replace(/\.zip$/i, '')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  if (groups.size > 50) throw new Error('Choose a group with up to 50 designs')
  const deadline = Date.now() + 180000
  const directory = await mkdtemp(join(tmpdir(), 'thebrief-group-'))
  const packages = [], issues = []
  let preparedBytes = 0, index = 0
  try {
    for (const [key, sources] of groups) {
      const name = basename(key)
      try {
        if (Date.now() >= deadline) throw new Error('Group preparation timed out; choose a smaller ZIP')
        if (sources.length > 20) throw new Error('A design can contain up to 20 sizes')
        const sizes = []
        for (const source of sources) {
          if (Date.now() >= deadline) throw new Error('Group preparation timed out; choose a smaller ZIP')
          // A separate creative retains the standard expansion and path limits.
          inspectArchive(source.data, { maxDepth: 0 })
          const unpacked = readArchiveEntries(source.data)
          if (!unpacked.some(entry => entry.name === 'index.html') || unpacked.some(entry => /\.zip$/i.test(entry.name))) throw new Error('Each size needs one index.html at its ZIP root')
          const sourceRoot = join(directory, `size-${index++}`)
          await mkdir(sourceRoot, { mode: 0o700 })
          const archivePath = `${sourceRoot}.zip`, output = `${sourceRoot}.xeroflow.json`
          await writeFile(archivePath, source.data, { mode: 0o600 })
          for (const entry of unpacked) {
            const target = resolve(sourceRoot, entry.name)
            if (!target.startsWith(sourceRoot + '/')) throw new Error('Unsafe source path')
            await mkdir(dirname(target), { recursive: true, mode: 0o700 })
            await writeFile(target, entry.data, { mode: 0o600, flag: 'wx' })
          }
          try {
            await promisify(execFile)(process.execPath, ['--import', 'tsx', join(root, 'scripts/thebrief/package-import.mjs'), sourceRoot, archivePath, name, output, ''], {
              cwd: root, env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'scripts/thebrief/tsconfig.json') }, timeout: Math.max(1, Math.min(60000, deadline - Date.now())), maxBuffer: 1024 * 1024
            })
          } catch (cause) {
            const message = String(cause.stderr || '').match(/(?:Error|ZodError): ([^\n]+)/)?.[1]
            throw new Error(message || 'This size could not be converted; the design is held for review')
          }
          const pkg = parseTheBriefPackage(JSON.parse(await readFile(output, 'utf8')))
          const dimensions = /-(\d+)x(\d+)-px\.zip$/i.exec(source.name)
          if (dimensions && !Object.hasOwn(pkg.canvasData, `custom_${Number(dimensions[1])}x${Number(dimensions[2])}`)) throw new Error('The size filename differs from its artwork')
          sizes.push(pkg)
          await rm(sourceRoot, { recursive: true, force: true })
        }
        const sizeSources = sizes.map(pkg => ({ designHash: pkg.source.designHash, sha256: pkg.source.sha256 })).sort((a, b) => a.designHash.localeCompare(b.designHash))
        const identity = sizes.length === 1 ? sizeSources[0].designHash : `set_${hash(Buffer.from(sizeSources.map(source => source.designHash).join('\n'))).slice(0, 32)}`
        const merged = mergeTheBriefPackages(sizes, identity, name)
        merged.source.sizeSources = sizeSources
        merged.warnings.push('The source ZIP does not include its original creation date or TheBrief folder; confirm the destination and retain an undated draft when needed')
        const pkg = parseTheBriefPackage(merged)
        preparedBytes += Buffer.byteLength(JSON.stringify(pkg))
        if (preparedBytes > MAX_PREPARED_BYTES) throw new Error('Prepared group exceeds 128 MB; choose a smaller source group')
        packages.push(pkg)
      } catch (cause) {
        issues.push({ name, message: cause instanceof Error ? cause.message.slice(0, 500) : 'Design needs review', sizes: sources.length })
      }
    }
    if (preparedBytes > MAX_PREPARED_BYTES) throw new Error('Prepared group exceeds 128 MB; choose a smaller source group')
    return { sourceSha256: inventory.sha256, packages, issues }
  } finally { await rm(directory, { recursive: true, force: true }) }
}
