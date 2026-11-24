import { isBannerImageBackground } from '../../shared/bannerImageBackground.mjs'
import { z } from 'zod'
import { isBannerInlineTextColor, isBannerInlineTextGradient } from '../../shared/bannerTextColor.mjs'
import { isSafeBannerImageFilter } from '../../shared/bannerImageFilters.mjs'

const number = z.number().finite().min(-100000).max(100000)
const css = z.string().max(500).regex(/^[\w\s#(),.%+-]+$/)
const local = z.string().max(250).regex(/^\.\/[\w /.-]+$/).refine(v => !v.split('/').slice(1).some(p => p === '..' || p === '.' || !p))
const sha = z.string().regex(/^[a-f0-9]{64}$/)
const track = z.array(z.object({
  time: z.number().min(0).max(300), value: number,
  easing: z.string().max(100).regex(/^(linear|none|cubic-bezier\([\d.,\s-]+\))$/).optional()
})).min(2).max(500)
const layer = z.object({
  id: z.number().int().positive(), type: z.enum(['bg', 'image', 'video', 'text', 'rect', 'button', 'audio']), name: z.string().max(250),
  timelineGroup: z.object({
    id: z.string().max(140).regex(/^[a-zA-Z0-9:_-]+$/),
    name: z.string().trim().min(1).max(250)
  }).strict().optional(),
  linkId: z.string().max(80).regex(/^source:[a-z0-9:]+$/).optional(),
  x: number, y: number, w: number.positive(), h: number.positive(), zIndex: number, opacity: z.number().min(0).max(1),
  animIn: z.literal('none'), animOut: z.literal('none').optional(), animInDur: z.literal(0),
  startTime: z.number().min(0).max(300), endTime: z.number().positive().max(300),
  animInStart: z.number().min(0).max(300).optional(),
  clipToPresence: z.boolean().optional(),
  hidden: z.literal(true).optional(),
  sourceInactiveTiming: z.object({ start: z.number().min(0).max(300), loopEnd: z.number().positive().max(300) }).strict().optional(),
  slideId: z.string().max(100).regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  slideFade: z.object({ id: z.string().max(100).regex(/^[a-zA-Z0-9:_-]+$/), start: z.number().min(0).max(300), end: z.number().positive().max(300), duration: z.number().min(0).max(5), ease: z.string().regex(/^cubic-bezier\([\d.,\s-]+\)$/) }).strict().optional(),
  textRuns: z.array(z.object({ text: z.string().max(10000), fontSize: number.positive().optional(), top: number.optional(), color: z.string().refine(isBannerInlineTextColor).optional(), gradient: z.string().refine(isBannerInlineTextGradient).optional(), fontFamily: z.string().max(150).regex(/^[\w .-]+$/).optional(), fontWeight: z.number().int().min(1).max(1000).optional(), fontStyle: z.enum(['normal', 'italic']).optional() }).strict()).max(100).optional(),
  borderWidth: number.nonnegative().max(100).optional(), borderColor: css.optional(), textColor: css.optional(),
  textTilt: z.object({ perspective: number.min(1), width: number.positive().max(4096), height: number.positive().max(4096) }).strict().optional(),
  rotation: number.optional(), imageFlipPerspective: number.min(1).optional(), flipX: z.boolean().optional(), flipY: z.boolean().optional(), borderRadius: number.nonnegative().optional(), transformOrigin: z.object({ x: number, y: number }).optional(),
  mixBlendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']).optional(),
  text: z.string().max(10000).optional(), textTransform: z.enum(['uppercase', 'lowercase', 'capitalize', 'none']).optional(), fontFamily: z.string().max(150).regex(/^[\w ,.-]+$/).optional(),
  wordPop: z.object({ duration: z.number().positive().max(5), stagger: z.number().min(0).max(5), ease: z.string().regex(/^cubic-bezier\([\d.,\s-]+\)$/), variant: z.enum(['pop', 'blurLeft', 'blurUp', 'zoomOut', 'typewriter', 'fade']).optional(), unit: z.enum(['word', 'character']).optional(), delays: z.array(z.number().min(0).max(5)).max(500).optional(), offset: z.number().min(0).max(5).optional() }).strict().optional(),
  reveal: z.object({ type: z.enum(['softWipe', 'tvExpand']), duration: z.number().positive().max(5), ease: z.string().regex(/^cubic-bezier\([\d.,\s-]+\)$/) }).strict().optional(),
  fontSize: number.positive().optional(), fontWeight: z.number().int().min(1).max(1000).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  lineBoxFontSize: number.positive().optional(), textAntialias: z.boolean().optional(), lineHeight: z.number().positive().max(10).optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify', 'start', 'end']).optional(), letterSpacing: css.optional(),
  color: css.optional(), bgColor: css.optional(), fillColor: css.optional(), rectShape: z.literal('ellipse').optional(),
  textShadow: z.string().max(100).regex(/^-?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px (?:\d+(?:\.\d+)?px|0) (?:#[0-9a-f]{3,6}|rgba?\(\d{1,3},\d{1,3},\d{1,3}(?:,(?:0|1|0?\.\d+))?\))$/i).optional(),
  textPaintOrder: z.enum(['fill', 'stroke']).optional(),
  textStroke: z.string().max(40).regex(/^\d+(?:\.\d+)?px #[0-9a-f]{6}$/i).optional(),
  imageOuterFilter: z.string().max(500).refine(isSafeBannerImageFilter).optional(),
  imageBackground: z.object({ size: z.string().max(80), position: z.string().max(80), repeat: z.enum(['repeat', 'no-repeat']) }).strict().refine(isBannerImageBackground).optional(),
  src: local.optional(), fit: z.enum(['fill', 'contain', 'cover']).optional(),
  volume: z.number().min(0).max(1).optional(),
  visualFilter: z.string().max(500).refine(isSafeBannerImageFilter).optional(),
  muted: z.boolean().optional(),
  focalX: z.number().min(0).max(100).optional(), focalY: z.number().min(0).max(100).optional(),
  mediaMask: z.literal('fadeTop').optional(),
  videoCrop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1) }).strict()
    .refine(crop => crop.x + crop.w <= 1.000001 && crop.y + crop.h <= 1.000001, 'Video crop falls outside the source').optional(),
  mediaStart: z.number().min(0).max(300).optional(), mediaEnd: z.number().positive().max(300).optional(), mediaLoop: z.boolean().optional(),
  keyframes: z.object({ opacity: track.optional(), x: track.optional(), y: track.optional(), z: track.optional(), scaleX: track.optional(), scaleY: track.optional(), rotation: track.optional(), rotationX: track.optional(), originY: track.optional() }).optional()
}).strict()
const binary = z.object({ path: local, fileName: z.string().max(150).regex(/^[\w .-]+$/), sha256: sha, base64: z.string().max(32 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/), mimeType: z.string().max(100) })
export const theBriefSourceSchema = z.object({
  designHash: z.string().regex(/^[\w-]+$/).max(100),
  sha256: sha,
  folder: z.string().max(250),
  duration: z.number().positive().max(300),
  loopCount: z.number().int().min(0).max(1000),
  createdDate: z.iso.date().optional(),
  clientName: z.string().trim().min(1).max(200).optional(),
  layoutPlayback: z.record(z.string(), z.object({ duration: z.number().positive().max(300), loopCount: z.number().int().min(0).max(1000) }).strict()).optional(),
  sizeSources: z.array(z.object({ designHash: z.string().regex(/^[\w-]{1,100}$/), sha256: sha }).strict()).min(1).max(20).optional()
})
// The recovery GET encodes these SHA-256 receipts in the URL. Two hundred
// hashes plus encoded separators and query metadata fit the 16 KiB edge cap.
export const MAX_CREATIVE_PACKAGE_ASSETS = 200

const schema = z.object({
  kind: z.enum(['xeroflow-thebrief-import', 'xeroflow-reelmotion-import']), version: z.literal(1), name: z.string().trim().min(1).max(200),
  source: theBriefSourceSchema,
  reelmotion: z.object({ lastSpokenWordEndSec: z.number().finite().nonnegative(), endCardStartSec: z.number().finite().nonnegative(), headClashes: z.literal(0), faceSampleFps: z.number().finite().min(6).max(60) }).strict().optional(),
  canvasData: z.record(z.string(), z.object({ layers: z.array(layer).min(1).max(600), bgColor: css.optional(), slides: z.array(z.object({ id: z.string().max(100).regex(/^[a-zA-Z0-9:_-]+$/), name: z.string().min(1).max(100), duration: z.number().finite().min(0.1).max(300) }).strict()).min(1).max(50).optional(), playback: z.object({ duration: z.number().positive().max(300), loopCount: z.number().int().min(0).max(1000) }).optional() })),
  warnings: z.array(z.string().max(1000)).max(250),
  // Match the authenticated import-recovery endpoint's bounded receipt count.
  assets: z.array(binary.extend({ mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'video/mp4']) })).max(MAX_CREATIVE_PACKAGE_ASSETS),
  fonts: z.array(binary.extend({ family: z.string().min(1).max(100).regex(/^[\w .-]+$/), weight: z.number().int().min(1).max(1000), style: z.literal('normal'), format: z.enum(['truetype', 'opentype', 'woff', 'woff2']) })).max(32)
})
export type TheBriefPackage = z.infer<typeof schema>

export function parseTheBriefPackage(input: unknown): TheBriefPackage {
  const result = schema.parse(input)
  const boards = Object.entries(result.canvasData)
  if (!boards.length || boards.length > 20) throw new Error('Import requires 1–20 design sizes')
  const layoutPlayback = result.source.layoutPlayback
  if (layoutPlayback) {
    const profiles = Object.values(layoutPlayback)
    if (result.kind !== 'xeroflow-thebrief-import' || profiles.length !== boards.length || boards.some(([format]) => !Object.hasOwn(layoutPlayback, format))) throw new Error('Playback receipts must match every TheBrief layout')
    const loops = profiles.some(p => p.loopCount === 0) ? 0 : Math.max(...profiles.map(p => p.loopCount))
    if (result.source.duration !== Math.max(...profiles.map(p => p.duration)) || result.source.loopCount !== loops) throw new Error('Group playback summary differs from source sizes')
  }
  if (result.kind === 'xeroflow-reelmotion-import') {
    const qa = result.reelmotion
    if (boards.length !== 1 || boards[0]![0] !== 'custom_1080x1920' || result.source.duration > 90 || result.source.loopCount !== 0) throw new Error('ReelMotion requires one 1080×1920 board up to 90 seconds')
    if (!boards[0]![1].playback) throw new Error('ReelMotion requires explicit playback timing')
    if (!qa || qa.lastSpokenWordEndSec + 0.1 > qa.endCardStartSec || result.source.duration - qa.endCardStartSec < 2.8 - 0.001) throw new Error('ReelMotion requires head QA and an end card after the final spoken word')
  } else if (boards.some(([, board]) => board.layers.length > 200)) throw new Error('TheBrief imports support up to 200 layers per size')
  for (const font of result.fonts) {
    const decodedSize = font.base64.length * 3 / 4 - (font.base64.endsWith('==') ? 2 : font.base64.endsWith('=') ? 1 : 0)
    if (decodedSize > 5 * 1024 * 1024) throw new Error('Font exceeds 5 MB upload limit')
    const extension = { truetype: 'ttf', opentype: 'otf', woff: 'woff', woff2: 'woff2' }[font.format]
    if (!font.fileName.toLowerCase().endsWith(`.${extension}`)) throw new Error('Font format does not match filename')
  }
  for (const asset of result.assets) {
    const bytes = asset.base64.length * 3 / 4 - (asset.base64.endsWith('==') ? 2 : asset.base64.endsWith('=') ? 1 : 0)
    const limit = asset.mimeType === 'video/mp4' ? 24 : 21
    if (bytes > limit * 1024 * 1024) throw new Error(`Packaged asset exceeds ${limit} MB limit`)
  }
  const binaries = [...result.assets, ...result.fonts]
  if (new Set(binaries.map(a => a.path)).size !== binaries.length) throw new Error('Duplicate asset path')
  const packageLimit = result.assets.some(asset => asset.mimeType === 'video/mp4') ? 80 : 40
  if (binaries.reduce((size, a) => size + a.base64.length, 0) > packageLimit * 1024 * 1024) throw new Error(`Package exceeds ${packageLimit} MB limit`)
  for (const [format, board] of boards) {
    const expectedPlayback = layoutPlayback?.[format] ?? result.source
    const duration = expectedPlayback.duration
    if (layoutPlayback && !board.playback) throw new Error('Layout playback receipt requires explicit artboard timing')
    if (board.playback && (board.playback.duration !== duration || board.playback.loopCount !== expectedPlayback.loopCount)) throw new Error('Playback differs from source timing')
    if (board.slides) {
      if (new Set(board.slides.map(slide => slide.id)).size !== board.slides.length) throw new Error('Duplicate slide identity')
      if (Math.abs(board.slides.reduce((sum, slide) => sum + slide.duration, 0) - duration) > 0.0001) throw new Error('Slide sequence differs from source timing')
    }
    const match = /^custom_([1-9]\d*)x([1-9]\d*)(?:__v(?:[2-9]|1\d|20))?$/.exec(format)
    if (!match || match.slice(1).some(v => +v < 1 || +v > 4096)) throw new Error('Invalid import dimensions')
    if (new Set(board.layers.map(l => l.id)).size !== board.layers.length) throw new Error('Duplicate layer identity')
    const links = board.layers.map(l => l.linkId).filter(Boolean)
    if (new Set(links).size !== links.length) throw new Error('Duplicate linked content identity in one size')
    for (const item of board.layers) {
      if (item.sourceInactiveTiming || item.hidden) {
        if (!item.hidden || !item.sourceInactiveTiming || !['image', 'text', 'rect', 'button'].includes(item.type)
          || board.slides?.length !== 1 || item.sourceInactiveTiming.loopEnd !== duration
          || item.sourceInactiveTiming.start < duration || item.startTime !== 0 || item.endTime !== duration) throw new Error('Invalid inactive source layer')
      }
      if (item.slideId) {
        const index = board.slides?.findIndex(slide => slide.id === item.slideId) ?? -1
        if (index < 0) throw new Error('Artwork references a missing slide')
        const start = board.slides!.slice(0, index).reduce((sum, slide) => sum + slide.duration, 0)
        const end = start + board.slides![index]!.duration
        const fade = item.slideFade
        if (fade && (fade.id !== item.slideId || Math.abs(fade.start - start) > 0.0001 || fade.end < end || fade.end > duration || fade.duration > end - start)) throw new Error('Invalid source slide fade')
        if (item.startTime < start - 0.0001 || item.endTime > (fade?.end ?? end) + 0.0001) throw new Error('Artwork crosses its slide boundary')
      }
      if (item.slideFade && !item.slideId) throw new Error('Slide fade requires scene ownership')
      if (item.src && !result.assets.some(a => a.path === item.src)) throw new Error('Missing packaged asset')
      if (item.textRuns && item.textRuns.map(run => run.text).join('') !== item.text) throw new Error('Text runs differ from layer text')
      if (item.textTilt || item.keyframes?.originY) {
        if (item.type !== 'text' || !item.textTilt || !item.keyframes?.originY || !item.keyframes.rotationX
          || item.imageFlipPerspective || item.wordPop || item.reveal || item.keyframes.z || item.keyframes.rotation
          || item.textTilt.width !== item.w || item.keyframes.rotationX.some(frame => Math.abs(frame.value) > 90)) throw new Error('Invalid TheBrief 3D text entrance')
      }
      if (item.imageFlipPerspective || (!item.textTilt && item.keyframes?.rotationX) || item.keyframes?.z) {
        if (item.type !== 'image' || !item.imageFlipPerspective || !(item.keyframes?.rotationX || item.keyframes?.z)
          || (item.keyframes.rotationX && item.keyframes.z)
          || item.keyframes.rotationX?.some(frame => Math.abs(frame.value) > 90)
          || item.keyframes.z?.some(frame => frame.value > 0)) throw new Error('Invalid TheBrief 3D image flip')
      }
      if (item.reveal && item.type !== 'rect' && item.type !== 'button') throw new Error('Reveal requires editable shape geometry')
      if (item.wordPop && item.type !== 'text') throw new Error('Word animation requires text')
      if (['image', 'audio', 'video'].includes(item.type) && !item.src) throw new Error('Image, audio or video layer is missing its asset')
      const mime = item.src ? result.assets.find(a => a.path === item.src)?.mimeType : undefined
      if ((item.type === 'video') !== (mime === 'video/mp4')) throw new Error('Video layers must reference MP4 assets, and only video layers may')
      if (item.type !== 'video' && (item.flipX !== undefined || item.flipY !== undefined)) throw new Error('Imported mirroring requires a video layer')
      if (item.type !== 'video' && item.mediaMask) throw new Error('Video mask requires a video layer')
      if (item.imageOuterFilter && (item.type !== 'image' || !item.borderRadius)) throw new Error('Outer image filter requires a masked image layer')
      if (item.type !== 'image' && item.imageBackground) throw new Error('Image background requires an image layer')
      if (item.type !== 'video' && item.videoCrop) throw new Error('Video crop requires a video layer')
      if (item.type !== 'video' && (item.mediaStart !== undefined || item.mediaEnd !== undefined || item.mediaLoop !== undefined)) throw new Error('Media clock is only valid on video layers')
      if (item.mediaEnd !== undefined && item.mediaEnd <= (item.mediaStart ?? 0)) throw new Error('Invalid video clip timing')
      if (item.rectShape && (item.type !== 'rect' || item.borderRadius !== undefined)) throw new Error('Ellipse shape is only valid on rectangle layers without a corner radius')
      if (item.endTime <= item.startTime || item.endTime > duration) throw new Error('Invalid layer timing')
      for (const frames of Object.values(item.keyframes || {})) {
        if (frames?.some((f, i) => f.time > duration || (i > 0 && f.time < frames[i - 1]!.time))) throw new Error('Invalid animation timing')
      }
    }
    const fades = new Map<string, string>()
    for (const item of board.layers) if (item.slideFade) {
      const value = JSON.stringify(item.slideFade)
      if (fades.has(item.slideFade.id) && fades.get(item.slideFade.id) !== value) throw new Error('Scene layers have conflicting fades')
      fades.set(item.slideFade.id, value)
    }
  }
  return result
}

const normalise = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function suggestImportClient(title: string, clients: Array<{ id: string, name: string }>): string | null {
  // Strip only known creative suffixes; a prefix alone cannot establish ownership.
  const name = normalise(title).replace(/\s+(?:update template|update|template)$/, '')
  const matches = clients.filter(c => normalise(c.name) === name)
  return matches.length === 1 ? matches[0]!.id : null
}

// A package's client hint comes from the migration ledger. It only preselects an
// exactly named, accessible client; the operator still confirms ownership.
export function clientFromHint(hint: string | undefined, clients: Array<{ id: string, name: string }>): string | null {
  if (!hint) return null
  const matches = clients.filter(c => normalise(c.name) === normalise(hint))
  return matches.length === 1 ? matches[0]!.id : null
}

export function importTags(pkg: TheBriefPackage, createdDate = pkg.source.createdDate, { datePending = false } = {}): string[] {
  if (createdDate && !z.iso.date().safeParse(createdDate).success) throw new Error('Invalid TheBrief creation date')
  return [pkg.kind === 'xeroflow-reelmotion-import' ? 'source:reelmotion' : 'source:thebrief', `source-design:${pkg.source.designHash}`, `source-sha256:${pkg.source.sha256}`,
    ...(pkg.source.sizeSources || []).map(source => `source-size:${source.designHash}`),
    `source-folder:${pkg.source.folder}`, `category:${pkg.source.folder.split('/').at(-1) || 'Imported'}`,
    `source-duration:${pkg.source.duration}`, `source-loops:${pkg.source.loopCount}`,
    ...(createdDate ? [`source-created-date:${createdDate}`] : datePending ? ['import:created-date-pending'] : []), 'import:needs-review']
}

export async function packageFile(asset: { base64: string, sha256: string, fileName: string, mimeType: string }): Promise<File> {
  const bytes = Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0))
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
  if (hash !== asset.sha256) throw new Error(`Asset checksum mismatch: ${asset.fileName}`)
  return new File([bytes], asset.fileName, { type: asset.mimeType })
}

// JSONB can reorder object keys. Compare values, retaining meaningful array order.
export function sameImportedCanvas(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((v, i) => sameImportedCanvas(v, right[i]))
  const a = Object.keys(left), b = Object.keys(right)
  return a.length === b.length && a.every(key => Object.hasOwn(right, key) && sameImportedCanvas(left[key], right[key]))
}
