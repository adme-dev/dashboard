import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { resolveGoogleFonts } from './google-fonts.mjs'
import { convertTheBriefHtml } from './convert-html.mjs'
import { packSfntAsWoff } from './woff-font.mjs'
import { transformImage } from './image-transforms.mjs'
import { transformAudio, extractVideoSoundtrack } from './audio-transforms.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import.ts'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')

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

/** Assemble a layout from original bytes that the caller has already verified. */
export async function packageTheBriefSize({ sourceFile, sourceSha256, name, folder, createdDate, reviewed, fontCache }) {
  if (reviewed !== undefined && (!reviewed || reviewed.sha256 !== sourceSha256 || typeof reviewed.designHash !== 'string'
    || !reviewed.rowLines || typeof reviewed.rowLines !== 'object' || Array.isArray(reviewed.rowLines))) {
    throw new Error('Reviewed row counts do not match the source ZIP')
  }
  const candidate = await convertTheBriefHtml((await sourceFile('index.html')).toString('utf8'), { reviewedRowLines: reviewed?.rowLines, reviewedRowHeights: reviewed?.rowHeights })
  if (reviewed && reviewed.designHash !== candidate.source.designHash) throw new Error('Reviewed row counts do not match the source layout')
  if (candidate.warnings.some(warning => /animation not converted|additional effects are not converted/.test(warning))) throw new Error('Import held: source animation requires an adapter; no package was created')
  const external = await resolveGoogleFonts(candidate.externalFontStylesheets || [], fetch, fontCache)
  if (external.fonts.length) {
    candidate.warnings = candidate.warnings.filter(warning => !warning.startsWith('External font stylesheet requires review'))
    candidate.warnings.push('External Google fonts snapshotted with source URLs and checksums; original historical font version requires visual review')
  }
  const assets = []
  const sourceAssets = new Map()
  const fonts = []
  const packagedFamilies = new Map()
  const fontTransformations = []
  for (const board of Object.values(candidate.canvasData)) {
    for (const layer of board.layers) {
      if (!layer.src) continue
      const originalPath = layer.src
      const operations = (candidate.imageTransforms || []).filter(item => item.layerId === layer.id).map(item => ({ operation: item.operation }))
      const audioFade = (candidate.audioTransforms || []).find(item => item.layerId === layer.id)
      const assetKey = `${originalPath}:${layer.type}:${JSON.stringify(operations)}:${JSON.stringify(audioFade || null)}`
      let asset = sourceAssets.get(assetKey)
      if (!asset) {
        let bytes = await sourceFile(originalPath)
        const embeddedSoundtrack = layer.type === 'audio' && extname(originalPath).toLowerCase() === '.mp4'
        if (embeddedSoundtrack) {
          bytes = await extractVideoSoundtrack(bytes)
          candidate.warnings.push(`${basename(originalPath)}: embedded soundtrack extracted to an editable audio layer; original MP4 preserved`)
        }
        if (extname(originalPath).toLowerCase() === '.mp3' || embeddedSoundtrack) {
          if (layer.type !== 'audio') throw new Error('Audio is used by a non-audio layer')
          bytes = await transformAudio(bytes, audioFade)
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
          if (!(media.duration > 0)) throw new Error(`Video ${basename(originalPath)}: invalid file duration`)
          if (layer.mediaEnd > media.duration + 0.05) {
            const visible = layer.endTime - layer.startTime
            // The exported HTML video holds its final frame at EOF. A non-looping
            // clip rounded to tenths can therefore retain its full presence while
            // using the verified file end. Never shorten a looping clip's period.
            const roundedNonLoop = !layer.mediaLoop && layer.mediaEnd - media.duration <= 0.1
            if (!roundedNonLoop && visible > media.duration - (layer.mediaStart || 0) + 0.001) throw new Error(`Video ${basename(originalPath)}: source clip end ${layer.mediaEnd}s exceeds the ${media.duration}s file`)
            candidate.warnings.push(`${basename(originalPath)}: rounded source clip end ${layer.mediaEnd}s reconciled to verified file duration ${media.duration}s; authored presence retained with the final frame held at EOF`)
            layer.mediaEnd = media.duration
          }
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
          const pixelLimit = 4096 * 4096
          const intrinsic = await sharp(bytes, { density: 72, limitInputPixels: pixelLimit }).metadata()
          // Avoid oversampling large viewBoxes beyond the raster budget before resizing.
          const density = Math.min(192, Math.floor(72 * Math.sqrt(pixelLimit / (intrinsic.width * intrinsic.height))))
          bytes = await sharp(bytes, { density, limitInputPixels: pixelLimit }).resize({ width }).png().toBuffer()
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
  const textFaces = Object.values(candidate.canvasData).flatMap(board => board.layers.flatMap(layer => [layer, ...layer.textRuns || []]))
  const unresolvedInlineFaces = new Set(Object.values(candidate.canvasData).flatMap(board => board.layers.flatMap(layer => (layer.textRuns || []).filter(run => run.fontFamily))))
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
    const sourceIdentity = externalFamily ? hash(Buffer.from(externalFamily)) : sourceSha256
    const safeFamily = font.family.replaceAll('/', ' ')
    // Include the original name when normalising so A/B cannot replace A B.
    // All weights of the same source family still share one managed alias.
    const identity = safeFamily === font.family ? sourceIdentity : hash(Buffer.from(`${sourceIdentity}:${font.family}`))
    const faceKey = `${sha256}:${font.weight}:${font.style}`
    const existingFamily = packagedFamilies.get(faceKey)
    const family = existingFamily ?? `${safeFamily.slice(0, font.style === 'italic' ? 76 : 83)}${font.style === 'italic' ? ' Italic' : ''} XF ${identity.slice(0, 12)}`
    for (const face of textFaces) {
      if (face.fontFamily === font.family && (face.fontWeight || 400) === font.weight && (face.fontStyle || 'normal') === font.style) {
        face.fontFamily = family
        unresolvedInlineFaces.delete(face)
        // The stored face is already italic. The managed catalog serves each
        // alias as a normal face so the browser must not synthesize a second slant.
        face.fontStyle = 'normal'
      }
    }
    if (existingFamily) continue
    packagedFamilies.set(faceKey, family)
    fonts.push({ ...font, style: 'normal', format, path, family, fileName: `${sha256}${extname(path)}`, mimeType: { truetype: 'font/ttf', opentype: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[format], sha256, base64: bytes.toString('base64') })
  }
  if (unresolvedInlineFaces.size) {
    const [face] = unresolvedInlineFaces
    throw new Error(`Source inline font is missing: ${face.fontFamily} ${face.fontWeight} ${face.fontStyle}`)
  }
  const pkg = parseTheBriefPackage({ kind: 'xeroflow-thebrief-import', version: 1, name,
    source: { designHash: candidate.source.designHash, sha256: sourceSha256, folder, duration: candidate.source.duration, loopCount: candidate.source.loopCount, ...(createdDate ? { createdDate } : {}) },
    canvasData: candidate.canvasData, warnings: candidate.warnings, assets, fonts })
  return { pkg, fontReceipts: { sourceArchiveSha256: sourceSha256, retrievedAt: new Date().toISOString(), resources: external.receipts, transformations: fontTransformations } }
}
