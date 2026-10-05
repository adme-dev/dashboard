import { readFile, writeFile, realpath } from 'node:fs/promises'
import { resolve, sep, basename, extname } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { convertTheBriefHtml } from './convert-html.mjs'
import { inspectArchive } from './inspect-archive.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import.ts'

// Offline preparation. The studio imports only validated native data and binary
// assets, never the original HTML/JavaScript. Preserve the original ZIP separately.
const [directory, archive, name, output, folder = 'Social Media Templates/Updates'] = process.argv.slice(2)
if (!directory || !archive || !name || !output) throw new Error('Usage: package-import.mjs <source directory> <source ZIP> <design name> <output.json> [source folder]')
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
const candidate = await convertTheBriefHtml((await sourceFile('index.html')).toString('utf8'))
const assets = []
const sourceAssets = new Map()
const fonts = []
for (const board of Object.values(candidate.canvasData)) {
  for (const layer of board.layers) {
    if (!layer.src) continue
    const originalPath = layer.src
    let asset = sourceAssets.get(originalPath)
    if (!asset) {
      let bytes = await sourceFile(originalPath)
      if (extname(originalPath).toLowerCase() === '.svg') {
        const svg = bytes.toString('utf8')
        if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|@import|(?:href\s*=\s*["'](?!#|data:))|url\(\s*["']?(?!#)/i.test(svg)) throw new Error('SVG contains unsupported external or active content')
        const width = Math.min(4096, Math.max(1, Math.ceil(layer.w * 2)))
        bytes = await sharp(bytes, { density: 192, limitInputPixels: 4096 * 4096 }).resize({ width }).png().toBuffer()
        candidate.warnings.push(`${basename(originalPath)}: vector artwork stored as ${width}px PNG for supported asset delivery; original SVG retained in source ZIP`)
      } else {
        bytes = await sharp(bytes, { limitInputPixels: 4096 * 4096 }).png().toBuffer()
      }
      const sha256 = hash(bytes)
      asset = assets.find(item => item.sha256 === sha256)
      if (!asset) {
        asset = { originalPath, path: `./media/${sha256}.png`, fileName: `${sha256}.png`, mimeType: 'image/png', sha256, base64: bytes.toString('base64') }
        assets.push(asset)
      }
      sourceAssets.set(originalPath, asset)
    }
    layer.src = asset.path
  }
}
for (const font of candidate.fonts || []) {
  if (font.style !== 'normal') throw new Error('Italic/oblique font imports need a compatible font adapter')
  const bytes = await sourceFile(font.path)
  const sha256 = hash(bytes)
  // Distinct family identity prevents an import replacing an existing brand font.
  const family = `${font.family.slice(0, 84)} XF ${inspection.sha256.slice(0, 12)}`
  for (const board of Object.values(candidate.canvasData)) for (const layer of board.layers) if (layer.fontFamily === font.family) layer.fontFamily = family
  fonts.push({ ...font, family, fileName: `${sha256}${extname(font.path)}`, mimeType: { truetype: 'font/ttf', opentype: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[font.format], sha256, base64: bytes.toString('base64') })
}
const pkg = parseTheBriefPackage({ kind: 'xeroflow-thebrief-import', version: 1, name,
  source: { designHash: candidate.source.designHash, sha256: inspection.sha256, folder, duration: candidate.source.duration, loopCount: candidate.source.loopCount },
  canvasData: candidate.canvasData, warnings: candidate.warnings, assets, fonts })
await writeFile(output, JSON.stringify(pkg), { mode: 0o600 })
console.log(JSON.stringify({ output, name, assets: assets.length, fonts: fonts.length, warnings: pkg.warnings }))
