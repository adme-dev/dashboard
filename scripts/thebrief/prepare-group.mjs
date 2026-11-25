import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fork } from 'node:child_process'
import { inspectArchive, readArchiveEntries } from './inspect-archive.mjs'
import { reviewedGroupName } from './reviewed-group-names.mjs'
import { mergeTheBriefPackages } from './merge-packages.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import.ts'

export const MAX_THEBRIEF_ZIP_BYTES = 64 * 1024 * 1024
const MAX_PREPARED_BYTES = 128 * 1024 * 1024
const childName = /^(.*)-(\d+)x(\d+)-px(?:-([1-9]\d?)| \(([1-9]\d?)\))?\.zip$/i
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sizeWorkerPath = join(dirname(fileURLToPath(import.meta.url)), 'prepare-size-worker.mjs')

function createSizePreparer(fontCache) {
  let worker

  async function close() {
    const active = worker
    worker = undefined
    if (!active?.pid || active.exitCode !== null || active.signalCode !== null) return
    await new Promise(resolve => {
      active.once('exit', resolve)
      active.kill('SIGKILL')
    })
  }

  function prepare(archive, name, timeout) {
    if (!worker) {
      const started = worker = fork(sizeWorkerPath, [], {
        execArgv: [], serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, THEBRIEF_REQUEST_FONT_CACHE: fontCache }
      })
      // An idle worker can exit between sizes. An active layout also observes
      // the error or exit below and is held without affecting the rest of the ZIP.
      const forget = () => { if (worker === started) worker = undefined }
      started.on('error', forget)
      started.once('exit', forget)
    }
    const active = worker
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        if (settled) return false
        settled = true
        clearTimeout(timer)
        active.off('message', receive)
        active.off('error', fail)
        active.off('exit', exit)
        return true
      }
      const receive = ({ pkg, error }) => {
        if (!cleanup()) return
        if (error) reject(new Error(error))
        else resolve(pkg)
      }
      const fail = (error) => {
        if (!cleanup()) return
        close().then(() => reject(error), reject)
      }
      const exit = () => fail(new Error('ZIP preparation stopped before the layout was converted'))
      const timer = setTimeout(() => fail(new Error('ZIP preparation timed out before all sizes could be converted')), timeout)
      active.once('message', receive)
      active.once('error', fail)
      active.once('exit', exit)
      try {
        // A stored child ZIP can be a slice backed by the entire group.
        // Copy its own bytes so IPC never serializes neighbouring layouts.
        active.send({ archive: Uint8Array.from(archive), name }, error => {
          if (error) fail(error)
        })
      } catch (cause) { fail(cause) }
    })
  }

  return { prepare, close }
}

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
    const match = childName.exec(entry.name)
    const rawKey = match?.[1] || entry.name.replace(/\.zip$/i, '')
    const reviewed = match && reviewedGroupName(basename(rawKey), entry.data)
    const key = reviewed ? join(dirname(rawKey), reviewed) : rawKey
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  if (groups.size > 50) throw new Error('Choose a group with up to 50 designs')
  const deadline = Date.now() + 180000
  const directory = await mkdtemp(join(tmpdir(), 'thebrief-group-'))
  const packages = [], issues = []
  let preparedBytes = 0
  const fontCache = join(directory, 'fonts')
  const sizePreparer = createSizePreparer(fontCache)
  try {
    await mkdir(fontCache, { mode: 0o700 })
    for (const [key, sources] of groups) {
      const name = basename(key)
      try {
        if (Date.now() >= deadline) throw new Error('Group preparation timed out; choose a smaller ZIP')
        if (sources.length > 20) throw new Error('A design can contain up to 20 sizes')
        const sizes = []
        // TheBrief adds a numeric filename suffix when a second layout uses the same dimensions.
        const ordered = sources.toSorted((a, b) => Number(childName.exec(a.name)?.[4] || childName.exec(a.name)?.[5] || 0) - Number(childName.exec(b.name)?.[4] || childName.exec(b.name)?.[5] || 0))
        for (const source of ordered) {
          if (Date.now() >= deadline) throw new Error('Group preparation timed out; choose a smaller ZIP')
          const pkg = await sizePreparer.prepare(source.data, name, Math.max(1, Math.min(60000, deadline - Date.now())))
          const dimensions = childName.exec(source.name)
          if (dimensions && !Object.hasOwn(pkg.canvasData, `custom_${Number(dimensions[2])}x${Number(dimensions[3])}`)) throw new Error('The size filename differs from its artwork')
          sizes.push(pkg)
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
  } finally {
    await sizePreparer.close()
    await rm(directory, { recursive: true, force: true })
  }
}
