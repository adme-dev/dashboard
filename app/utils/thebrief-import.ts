import { z } from 'zod'
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
  id: z.number().int().positive(), type: z.enum(['bg', 'image', 'text', 'rect', 'button', 'audio']), name: z.string().max(250),
  linkId: z.string().max(80).regex(/^source:[a-z0-9:]+$/).optional(),
  x: number, y: number, w: number.positive(), h: number.positive(), zIndex: number, opacity: z.number().min(0).max(1),
  animIn: z.literal('none'), animOut: z.literal('none').optional(), animInDur: z.literal(0),
  startTime: z.number().min(0).max(300), endTime: z.number().positive().max(300),
  clipToPresence: z.boolean().optional(),
  slideId: z.string().max(100).regex(/^[a-zA-Z0-9:_-]+$/).optional(),
  textRuns: z.array(z.object({ text: z.string().max(10000), fontSize: number.positive().optional(), top: number.optional() }).strict()).max(100).optional(),
  borderWidth: number.nonnegative().max(100).optional(), borderColor: css.optional(), textColor: css.optional(),
  rotation: number.optional(), borderRadius: number.nonnegative().optional(), transformOrigin: z.object({ x: number, y: number }).optional(),
  mixBlendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']).optional(),
  text: z.string().max(10000).optional(), textTransform: z.enum(['uppercase', 'lowercase', 'capitalize', 'none']).optional(), fontFamily: z.string().max(150).regex(/^[\w ,.-]+$/).optional(),
  wordPop: z.object({ duration: z.number().positive().max(5), stagger: z.number().min(0).max(5), ease: z.string().regex(/^cubic-bezier\([\d.,\s-]+\)$/) }).strict().optional(),
  fontSize: number.positive().optional(), fontWeight: z.number().int().min(1).max(1000).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  lineBoxFontSize: number.positive().optional(), textAntialias: z.boolean().optional(), lineHeight: z.number().positive().max(10).optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify', 'start', 'end']).optional(), letterSpacing: css.optional(),
  color: css.optional(), bgColor: css.optional(), fillColor: css.optional(),
  textShadow: z.string().max(100).regex(/^-?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px (?:\d+(?:\.\d+)?px|0) #[0-9a-f]{3,6}$/i).optional(),
  textStroke: z.string().max(40).regex(/^\d+(?:\.\d+)?px #[0-9a-f]{6}$/i).optional(),
  src: local.optional(), fit: z.enum(['fill', 'contain', 'cover']).optional(),
  volume: z.number().min(0).max(1).optional(),
  visualFilter: z.string().max(500).refine(isSafeBannerImageFilter).optional(),
  muted: z.boolean().optional(),
  keyframes: z.object({ opacity: track.optional(), x: track.optional(), y: track.optional(), scaleX: track.optional(), scaleY: track.optional(), rotation: track.optional() }).optional()
}).strict()
const binary = z.object({ path: local, fileName: z.string().max(150).regex(/^[\w .-]+$/), sha256: sha, base64: z.string().max(28 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/), mimeType: z.string().max(100) })
const schema = z.object({
  kind: z.literal('xeroflow-thebrief-import'), version: z.literal(1), name: z.string().trim().min(1).max(200),
  source: z.object({ designHash: z.string().regex(/^[\w-]+$/).max(100), sha256: sha, folder: z.string().max(250), duration: z.number().positive().max(300), loopCount: z.number().int().min(0).max(1000) }),
  canvasData: z.record(z.string(), z.object({ layers: z.array(layer).min(1).max(200), bgColor: css.optional(), slides: z.array(z.object({ id: z.string().max(100).regex(/^[a-zA-Z0-9:_-]+$/), name: z.string().min(1).max(100), duration: z.number().finite().min(0.1).max(300) }).strict()).min(1).max(50).optional(), playback: z.object({ duration: z.number().positive().max(300), loopCount: z.number().int().min(0).max(1000) }).optional() })),
  warnings: z.array(z.string().max(1000)).max(250),
  assets: z.array(binary.extend({ mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg']) })).max(100),
  fonts: z.array(binary.extend({ family: z.string().min(1).max(100).regex(/^[\w .-]+$/), weight: z.number().int().min(1).max(1000), style: z.literal('normal'), format: z.enum(['truetype', 'opentype', 'woff', 'woff2']) })).max(32)
})
export type TheBriefPackage = z.infer<typeof schema>

export function parseTheBriefPackage(input: unknown): TheBriefPackage {
  const result = schema.parse(input)
  const boards = Object.entries(result.canvasData)
  if (!boards.length || boards.length > 20) throw new Error('Import requires 1–20 design sizes')
  for (const font of result.fonts) {
    const decodedSize = font.base64.length * 3 / 4 - (font.base64.endsWith('==') ? 2 : font.base64.endsWith('=') ? 1 : 0)
    if (decodedSize > 5 * 1024 * 1024) throw new Error('Font exceeds 5 MB upload limit')
    const extension = { truetype: 'ttf', opentype: 'otf', woff: 'woff', woff2: 'woff2' }[font.format]
    if (!font.fileName.toLowerCase().endsWith(`.${extension}`)) throw new Error('Font format does not match filename')
  }
  const binaries = [...result.assets, ...result.fonts]
  if (new Set(binaries.map(a => a.path)).size !== binaries.length) throw new Error('Duplicate asset path')
  if (binaries.reduce((size, a) => size + a.base64.length, 0) > 40 * 1024 * 1024) throw new Error('Package exceeds 40 MB limit')
  for (const [format, board] of boards) {
    if (board.playback && (board.playback.duration !== result.source.duration || board.playback.loopCount !== result.source.loopCount)) throw new Error('Playback differs from source timing')
    if (board.slides) {
      if (new Set(board.slides.map(slide => slide.id)).size !== board.slides.length) throw new Error('Duplicate slide identity')
      if (Math.abs(board.slides.reduce((sum, slide) => sum + slide.duration, 0) - result.source.duration) > 0.0001) throw new Error('Slide sequence differs from source timing')
    }
    const match = /^custom_([1-9]\d*)x([1-9]\d*)$/.exec(format)
    if (!match || match.slice(1).some(v => +v < 1 || +v > 4096)) throw new Error('Invalid import dimensions')
    if (new Set(board.layers.map(l => l.id)).size !== board.layers.length) throw new Error('Duplicate layer identity')
    const links = board.layers.map(l => l.linkId).filter(Boolean)
    if (new Set(links).size !== links.length) throw new Error('Duplicate linked content identity in one size')
    for (const item of board.layers) {
      if (item.slideId) {
        const index = board.slides?.findIndex(slide => slide.id === item.slideId) ?? -1
        if (index < 0) throw new Error('Artwork references a missing slide')
        const start = board.slides!.slice(0, index).reduce((sum, slide) => sum + slide.duration, 0)
        const end = start + board.slides![index]!.duration
        if (item.startTime < start - 0.0001 || item.endTime > end + 0.0001) throw new Error('Artwork crosses its slide boundary')
      }
      if (item.src && !result.assets.some(a => a.path === item.src)) throw new Error('Missing packaged asset')
      if (item.textRuns && item.textRuns.map(run => run.text).join('') !== item.text) throw new Error('Text runs differ from layer text')
      if (item.wordPop && (item.type !== 'text' || item.textRuns)) throw new Error('Word animation requires plain text')
      if (['image', 'audio'].includes(item.type) && !item.src) throw new Error('Image or audio layer is missing its asset')
      if (item.endTime <= item.startTime || item.endTime > result.source.duration) throw new Error('Invalid layer timing')
      for (const frames of Object.values(item.keyframes || {})) {
        if (frames?.some((f, i) => f.time > result.source.duration || (i > 0 && f.time < frames[i - 1]!.time))) throw new Error('Invalid animation timing')
      }
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

export function importTags(pkg: TheBriefPackage): string[] {
  return ['source:thebrief', `source-design:${pkg.source.designHash}`, `source-sha256:${pkg.source.sha256}`,
    `source-folder:${pkg.source.folder}`, `category:${pkg.source.folder.split('/').at(-1) || 'Imported'}`,
    `source-duration:${pkg.source.duration}`, `source-loops:${pkg.source.loopCount}`, 'import:needs-review']
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
