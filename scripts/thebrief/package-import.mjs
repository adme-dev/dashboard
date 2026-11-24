import { readFile, writeFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { inspectArchive } from './inspect-archive.mjs'
import { packageTheBriefSize } from './package-size.mjs'

// Offline preparation. The studio imports only validated native data and binary
// assets, never the original HTML/JavaScript. Preserve the original ZIP separately.
const [directory, archive, name, output, folder = 'Social Media Templates/Updates', createdDate, reviewedRowsPath] = process.argv.slice(2)
if (!directory || !archive || !name || !output) throw new Error('Usage: package-import.mjs <source directory> <source ZIP> <design name> <output.json> [source folder] [verified TheBrief created date YYYY-MM-DD] [reviewed row counts JSON]')
const root = await realpath(directory)
const inspection = inspectArchive(await readFile(archive))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function sourceFile(path) {
  const file = await realpath(resolve(root, path))
  if (!file.startsWith(root + sep)) throw new Error('Asset outside source directory')
  const bytes = await readFile(file)
  const retained = inspection.files.find(item => item.path === path.replace(/^\.\//, '') || item.name === path.replace(/^\.\//, ''))
  // All used bytes must belong to the inspected archive, not a modified neighbour.
  if (!retained || retained.sha256 !== hash(bytes)) throw new Error(`Source differs from archive: ${path}`)
  return bytes
}
const reviewed = reviewedRowsPath ? JSON.parse(await readFile(reviewedRowsPath, 'utf8')) : undefined
const { pkg, fontReceipts } = await packageTheBriefSize({
  sourceFile, sourceSha256: inspection.sha256, name, folder, createdDate, reviewed,
  fontCache: process.env.THEBRIEF_REQUEST_FONT_CACHE
})
await writeFile(output, JSON.stringify(pkg), { mode: 0o600 })
await writeFile(`${output}.font-receipts.json`, JSON.stringify(fontReceipts, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ output, name, assets: pkg.assets.length, fonts: pkg.fonts.length, warnings: pkg.warnings }))
