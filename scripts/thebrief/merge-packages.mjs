import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import.ts'

// Merge independently verified HTML5 size exports into one editable design set.
// Run with Node's tsx loader, as with package-import.mjs.
export function mergeTheBriefPackages(packages, designHash, name) {
if (packages.length < 1 || packages.length > 20 || !/^[\w-]{1,100}$/.test(designHash)) throw new Error('Invalid design set')
if (new Set(packages.map(pkg => pkg.source.designHash)).size !== packages.length) throw new Error('Duplicate source layout identity')
const [{ source }] = packages
if (packages.some(pkg => pkg.source.folder !== source.folder || pkg.source.createdDate !== source.createdDate)) {
  throw new Error('Source sizes have different folder or creation-date metadata')
}
if (packages.some(pkg => pkg.warnings.some(w => /animation not converted|additional effects are not converted/.test(w)))) {
  throw new Error('Import held: a source size still has unsupported animation')
}
const canvasData = {}
const layoutCounts = new Map()
const layoutPlayback = {}
const assets = new Map()
const fonts = new Map()
for (const pkg of packages) {
  const fontAliases = new Map()
  for (const font of pkg.fonts) {
    const identity = `${font.sha256}:${font.weight}:${font.style}`
    let canonical = fonts.get(identity)
    if (!canonical) {
      const aliasHash = createHash('sha256').update(identity).digest('hex')
      canonical = { ...font, path: `./fonts/${aliasHash}-${font.fileName}` }
      fonts.set(identity, canonical)
    }
    const face = `${font.family}:${font.weight}:${font.style}`
    const old = fontAliases.get(face)
    if (old && old !== canonical.family) throw new Error(`Ambiguous font alias: ${font.family}`)
    fontAliases.set(face, canonical.family)
  }
  for (const [key, board] of Object.entries(pkg.canvasData)) {
    const count = (layoutCounts.get(key) || 0) + 1
    layoutCounts.set(key, count)
    const layoutKey = count === 1 ? key : `${key}__v${count}`
    if (Object.hasOwn(canvasData, layoutKey)) throw new Error(`Duplicate design layout key: ${layoutKey}`)
    const expected = pkg.source.layoutPlayback?.[key] ?? pkg.source
    layoutPlayback[layoutKey] = { duration: expected.duration, loopCount: expected.loopCount }
    const alias = face => face.fontFamily ? fontAliases.get(`${face.fontFamily}:${face.fontWeight || 400}:${face.fontStyle || 'normal'}`) || face.fontFamily : face.fontFamily
    canvasData[layoutKey] = { ...board, layers: board.layers.map(layer => ({
      ...layer, fontFamily: alias(layer),
      ...(layer.textRuns ? { textRuns: layer.textRuns.map(run => ({ ...run, ...(run.fontFamily ? { fontFamily: alias(run) } : {}) })) } : {})
    })) }
  }
  for (const item of pkg.assets) {
    const existing = assets.get(item.path)
    if (existing && existing.sha256 !== item.sha256) throw new Error(`Conflicting packaged asset: ${item.path}`)
    assets.set(item.path, item)
  }
}
const digest = createHash('sha256')
for (const value of [designHash, ...packages.map(pkg => pkg.source.sha256).sort()]) digest.update(`${value}\n`)
const profiles = Object.values(layoutPlayback)
const duration = Math.max(...profiles.map(p => p.duration))
const loopCount = profiles.some(p => p.loopCount === 0) ? 0 : Math.max(...profiles.map(p => p.loopCount))
const varies = profiles.some(p => p.duration !== duration || p.loopCount !== loopCount)
if (varies) for (const [key, playback] of Object.entries(layoutPlayback)) canvasData[key].playback ??= playback
const merged = parseTheBriefPackage({
  kind: 'xeroflow-thebrief-import', version: 1, name,
  source: { ...source, designHash, sha256: digest.digest('hex'), duration, loopCount, layoutPlayback: varies ? layoutPlayback : undefined },
  canvasData, assets: [...assets.values()], fonts: [...fonts.values()],
  warnings: [...new Set(packages.flatMap(pkg => pkg.warnings))]
})
return merged
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [designHash, name, output, ...inputs] = process.argv.slice(2)
  if (!/^[\w-]{1,100}$/.test(designHash || '') || !name || !output || inputs.length < 2 || inputs.length > 20) throw new Error('Usage: merge-packages.mjs <design hash> <design name> <output.json> <prepared-size-1.json> <prepared-size-2.json> [...]')
  const packages = await Promise.all(inputs.map(async path => parseTheBriefPackage(JSON.parse(await readFile(path, 'utf8')))))
  const merged = mergeTheBriefPackages(packages, designHash, name)
  await writeFile(output, JSON.stringify(merged), { mode: 0o600 })
  console.log(JSON.stringify({ output, sizes: Object.keys(merged.canvasData), assets: merged.assets.length, fonts: merged.fonts.length }))
}
