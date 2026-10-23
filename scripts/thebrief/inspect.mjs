import { open } from 'node:fs/promises'
import { inspectArchive } from './inspect-archive.mjs'

const path = process.argv[2]
if (!path || process.argv.length !== 3) {
  console.error('Usage: node scripts/thebrief/inspect.mjs /path/to/banner.zip')
  process.exitCode = 1
} else {
  let handle
  try {
    handle = await open(path, 'r')
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('Choose a regular ZIP file no larger than 20 MB')
    const bytes = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!read.bytesRead) break
      offset += read.bytesRead
    }
    if (offset !== stat.size) throw new Error('File changed during inspection; try again')
    console.log(JSON.stringify(inspectArchive(bytes.subarray(0, offset)), null, 2))
  } catch (error) {
    console.error(`Inspection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    process.exitCode = 1
  } finally {
    await handle?.close()
  }
}
