import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import.ts'

// Merge independently verified HTML5 size exports into one editable design set.
// Run with Node's tsx loader, as with package-import.mjs.
const [designHash, name, output, ...inputs] = process.argv.slice(2)
if (!/^[\w-]{1,100}$/.test(designHash || '') || !name || !output || inputs.length < 2 || inputs.length > 20) {
  throw new Error('Usage: merge-packages.mjs <design hash> <design name> <output.json> <prepared-size-1.json> <prepared-size-2.json> [...]')
}
const packages = await Promise.all(inputs.map(async path => parseTheBriefPackage(JSON.parse(await readFile(path, 'utf8')))))
const [{ source }] = packages
if (packages.some(pkg => pkg.source.duration !== source.duration || pkg.source.loopCount !== source.loopCount || pkg.source.folder !== source.folder)) {
  throw new Error('Source sizes have different playback or folder metadata')
}
if (packages.some(pkg => pkg.warnings.some(w => /animation not converted|additional effects are not converted/.test(w)))) {
  throw new Error('Import held: a source size still has unsupported animation')
}
const canvasData = {}
const assets = new Map()
const fonts = new Map()
for (const pkg of packages) {
  for (const [key, board] of Object.entries(pkg.canvasData)) {
    if (Object.hasOwn(canvasData, key)) throw new Error(`Duplicate design size: ${key}`)
    canvasData[key] = board
  }
  for (const [collection, target] of [[pkg.assets, assets], [pkg.fonts, fonts]]) {
    for (const item of collection) {
      const existing = target.get(item.path)
      if (existing && existing.sha256 !== item.sha256) throw new Error(`Conflicting packaged asset: ${item.path}`)
      target.set(item.path, item)
    }
  }
}
const digest = createHash('sha256')
for (const value of [designHash, ...packages.map(pkg => pkg.source.sha256).sort()]) digest.update(`${value}\n`)
const merged = parseTheBriefPackage({
  kind: 'xeroflow-thebrief-import', version: 1, name,
  source: { ...source, designHash, sha256: digest.digest('hex') },
  canvasData, assets: [...assets.values()], fonts: [...fonts.values()],
  warnings: [...new Set(packages.flatMap(pkg => pkg.warnings))],
})
await writeFile(output, JSON.stringify(merged), { mode: 0o600 })
console.log(JSON.stringify({ output, sizes: Object.keys(merged.canvasData), assets: merged.assets.length, fonts: merged.fonts.length }))
