import { open } from 'node:fs/promises'
import { inspectArchive } from './inspect-archive.mjs'

const path = process.argv[2]
const designSet = process.argv[3] === '--design-set'
const maxArchiveBytes = (designSet ? 64 : 20) * 1024 * 1024
if (!path || (process.argv.length !== 3 && !(process.argv.length === 4 && designSet))) {
  console.error('Usage: node scripts/thebrief/inspect.mjs /path/to/banner.zip [--design-set]')
  process.exitCode = 1
} else {
  let handle
  try {
    handle = await open(path, 'r')
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > maxArchiveBytes) throw new Error(`Choose a regular ZIP file no larger than ${maxArchiveBytes / 1024 / 1024} MB`)
    const bytes = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!read.bytesRead) break
      offset += read.bytesRead
    }
    if (offset !== stat.size) throw new Error('File changed during inspection; try again')
    const report = inspectArchive(bytes.subarray(0, offset), designSet ? { maxArchiveBytes, maxFileBytes: 20 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024, maxFiles: 1500, requireDefaultChildLimits: 1 } : {})
    if (designSet && (!report.files.length || report.files.some(file => !file.path.includes('!/') && !/\.zip$/i.test(file.path)))) throw new Error('Design-set inspection requires an outer container of child ZIPs only')
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    console.error(`Inspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exitCode = 1
  } finally {
    await handle?.close()
  }
}
