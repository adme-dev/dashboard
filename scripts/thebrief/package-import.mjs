import { readFile, writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { resolve, sep, basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { resolveGoogleFonts } from './google-fonts.mjs'
import { convertTheBriefHtml } from './convert-html.mjs'
import { inspectArchive } from './inspect-archive.mjs'
import { packSfntAsWoff } from './woff-font.mjs'
import { transformImage } from './image-transforms.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import.ts'

// Offline preparation. The studio imports only validated native data and binary
// assets, never the original HTML/JavaScript. Preserve the original ZIP separately.
const [directory, archive, name, output, folder = 'Social Media Templates/Updates', createdDate] = process.argv.slice(2)
if (!directory || !archive || !name || !output) throw new Error('Usage: package-import.mjs <source directory> <source ZIP> <design name> <output.json> [source folder] [verified TheBrief created date YYYY-MM-DD]')
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
if (candidate.warnings.some(warning => /animation not converted|additional effects are not converted/.test(warning))) throw new Error('Import held: source animation requires an adapter; no package was created')
const external = await resolveGoogleFonts(candidate.externalFontStylesheets || [])
if (external.fonts.length) {
  candidate.warnings = candidate.warnings.filter(warning => !warning.startsWith('External font stylesheet requires review'))
  candidate.warnings.push('External Google fonts snapshotted with source URLs and checksums; original historical font version requires visual review')
}
const assets = []
async function probeVideo(bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'thebrief-video-'))
  const file = join(dir, 'clip.mp4')
  try {
    await writeFile(file, bytes, { mode: 0o600 })
    const { stdout } = await promisify(execFile)('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', file], { timeout: 30000, maxBuffer: 1024 * 1024 })
    const probe = JSON.parse(stdout)
    return { codec: probe.streams?.[0]?.codec_name, width: Number(probe.streams?.[0]?.width), height: Number(probe.streams?.[0]?.height), duration: Number(probe.format?.duration) }
  } catch (cause) {
    throw new Error('Video preparation requires ffprobe to verify the clip', { cause })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
const sourceAssets = new Map()
const fonts = []
const fontTransformations = []
for (const board of Object.values(candidate.canvasData)) {
  for (const layer of board.layers) {
    if (!layer.src) continue
    const originalPath = layer.src
    const operations = (candidate.imageTransforms || []).filter(item => item.layerId === layer.id).map(item => ({ operation: item.operation }))
    const assetKey = `${originalPath}:${JSON.stringify(operations)}`
    let asset = sourceAssets.get(assetKey)
    if (!asset) {
      let bytes = await sourceFile(originalPath)
      if (extname(originalPath).toLowerCase() === '.mp3') {
        if (layer.type !== 'audio') throw new Error('Audio is used by a non-audio layer')
        const sha256 = hash(bytes)
        asset = assets.find(item => item.sha256 === sha256)
        if (!asset) {
          asset = { originalPath, path: `./media/${sha256}.mp3`, fileName: `${sha256}.mp3`, mimeType: 'audio/mpeg', sha256, base64: bytes.toString('base64') }
          assets.push(asset)
        }
        sourceAssets.set(assetKey, asset)
        layer.src = asset.path
        continue
      }
      if (extname(originalPath).toLowerCase() === '.mp4') {
        // Original bytes are kept: no transcoding or flattening. ffprobe only reads
        // container metadata; the clip must be H.264 and cover the source clip end.
        if (layer.type !== 'video') throw new Error('Video is used by a non-video layer')
        if (bytes.subarray(4, 8).toString('latin1') !== 'ftyp') throw new Error('Video is not an MP4 file')
        const media = await probeVideo(bytes)
        if (media.codec !== 'h264') throw new Error(`Video ${basename(originalPath)}: ${media.codec || 'unknown'} codec requires an adapter`)
        if (!(media.duration > 0) || layer.mediaEnd > media.duration + 0.05) throw new Error(`Video ${basename(originalPath)}: source clip end ${layer.mediaEnd}s exceeds the ${media.duration}s file`)
        const frame = (candidate.videoFrames || []).find(item => item.layerId === layer.id)
        if (frame && !(media.width > 0 && media.height > 0 && Math.abs(media.width / media.height - frame.aspect) / frame.aspect <= 0.01)) throw new Error(`Video ${basename(originalPath)}: file aspect does not match its source framing`)
        const sha256 = hash(bytes)
        asset = assets.find(item => item.sha256 === sha256)
        if (!asset) {
          asset = { originalPath, path: `./media/${sha256}.mp4`, fileName: `${sha256}.mp4`, mimeType: 'video/mp4', sha256, base64: bytes.toString('base64') }
          assets.push(asset)
        }
        sourceAssets.set(assetKey, asset)
        layer.src = asset.path
        continue
      }
      if (extname(originalPath).toLowerCase() === '.svg') {
        const svg = bytes.toString('utf8')
        if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|@import|(?:href\s*=\s*["'](?!#|data:))|url\(\s*["']?(?!#)/i.test(svg)) throw new Error('SVG contains unsupported external or active content')
        const width = Math.min(4096, Math.max(1, Math.ceil(layer.w * 2)))
        bytes = await sharp(bytes, { density: 192, limitInputPixels: 4096 * 4096 }).resize({ width }).png().toBuffer()
        candidate.warnings.push(`${basename(originalPath)}: vector artwork stored as ${width}px PNG for supported asset delivery; original SVG retained in source ZIP`)
      } else {
        bytes = await sharp(bytes, { limitInputPixels: 4096 * 4096 }).png().toBuffer()
      }
      bytes = await transformImage(bytes, operations)
      const sha256 = hash(bytes)
      asset = assets.find(item => item.sha256 === sha256)
      if (!asset) {
        asset = { originalPath, path: `./media/${sha256}.png`, fileName: `${sha256}.png`, mimeType: 'image/png', sha256, base64: bytes.toString('base64') }
        assets.push(asset)
      }
      sourceAssets.set(assetKey, asset)
    }
    layer.src = asset.path
  }
}
for (const font of [...(candidate.fonts || []), ...external.fonts]) {
  if (!['normal', 'italic'].includes(font.style)) throw new Error('Oblique font imports need a compatible font adapter')
  let bytes = font.bytes || await sourceFile(font.path)
  let format = font.format
  let path = font.path
  if (bytes.length > 5 * 1024 * 1024 && ['truetype', 'opentype'].includes(format)) {
    const original = bytes
    bytes = packSfntAsWoff(original)
    format = 'woff'
    path = `${path.slice(0, -extname(path).length)}.woff`
    fontTransformations.push({ sourcePath: font.path, sourceSha256: hash(original), sourceBytes: original.length, outputSha256: hash(bytes), outputBytes: bytes.length, adapter: 'lossless-woff1-container', fullFontRoundTripVerified: true })
    candidate.warnings.push(`${font.family}: lossless WOFF compression verified against the full original font; all glyphs and tables retained`)
  }
  const sha256 = hash(bytes)
  // Distinct family identity prevents an import replacing an existing brand font.
  const externalFamily = external.receipts.filter(face => face.family === font.family).map(face => `${face.weight}:${face.sha256}`).sort().join('|')
  const sourceIdentity = externalFamily ? hash(Buffer.from(externalFamily)) : inspection.sha256
  const safeFamily = font.family.replaceAll('/', ' ')
  // Include the original name when normalising so A/B cannot replace A B.
  // All weights of the same source family still share one managed alias.
  const identity = safeFamily === font.family ? sourceIdentity : hash(Buffer.from(`${sourceIdentity}:${font.family}`))
  const family = `${safeFamily.slice(0, font.style === 'italic' ? 76 : 83)}${font.style === 'italic' ? ' Italic' : ''} XF ${identity.slice(0, 12)}`
  for (const board of Object.values(candidate.canvasData)) for (const layer of board.layers) {
    if (layer.fontFamily === font.family && (layer.fontWeight || 400) === font.weight && (layer.fontStyle || 'normal') === font.style) {
      layer.fontFamily = family
      // The stored face is already italic. The managed catalog serves each
      // alias as a normal face so the browser must not synthesize a second slant.
      layer.fontStyle = 'normal'
    }
  }
  fonts.push({ ...font, style: 'normal', format, path, family, fileName: `${sha256}${extname(path)}`, mimeType: { truetype: 'font/ttf', opentype: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[format], sha256, base64: bytes.toString('base64') })
}
const pkg = parseTheBriefPackage({ kind: 'xeroflow-thebrief-import', version: 1, name,
  source: { designHash: candidate.source.designHash, sha256: inspection.sha256, folder, duration: candidate.source.duration, loopCount: candidate.source.loopCount, ...(createdDate ? { createdDate } : {}) },
  canvasData: candidate.canvasData, warnings: candidate.warnings, assets, fonts })
await writeFile(output, JSON.stringify(pkg), { mode: 0o600 })
await writeFile(`${output}.font-receipts.json`, JSON.stringify({ sourceArchiveSha256: inspection.sha256, retrievedAt: new Date().toISOString(), resources: external.receipts, transformations: fontTransformations }, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ output, name, assets: assets.length, fonts: fonts.length, warnings: pkg.warnings }))
