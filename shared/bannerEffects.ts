import { z } from 'zod'

const hex = z.string().regex(/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i)
export const bannerTextDepthSchema = z.object({
  size: z.number().int().min(0).max(24),
  angle: z.number().min(-180).max(180),
  color: hex,
  bevel: z.number().min(0).max(3),
  lightAngle: z.number().min(-180).max(180),
  shadow: z.number().min(0).max(32),
  shadowOpacity: z.number().min(0).max(1)
}).strict()
export type BannerTextDepth = z.infer<typeof bannerTextDepthSchema>
export const DEFAULT_TEXT_DEPTH: BannerTextDepth = { size: 8, angle: 45, color: '#543515', bevel: 1, lightAngle: -45, shadow: 6, shadowOpacity: 0.4 }
export const bannerEffectStyleSchema = z.object({
  color: hex.optional(),
  textShadow: z.string().max(300).regex(/^[\da-fpxrgba#., ()-]*$/i).optional(),
  textStroke: z.string().max(40).regex(/^(?:[\d.]+px #[a-f\d]{6})?$/i).optional(),
  gradientColors: z.array(hex).max(6).optional(),
  textDepth: bannerTextDepthSchema.optional(),
  visualFilter: z.enum(['none', 'grayscale(1)', 'saturate(1.5)', 'brightness(1.2)', 'blur(2px)']).optional()
}).strict()
export type BannerEffectStyle = z.infer<typeof bannerEffectStyleSchema>
export const bannerEffectRecipeSchema = z.object({
  style: bannerEffectStyleSchema,
  prompt: z.string().trim().max(1400),
  modelId: z.literal('aigateway/recraft-offer-card'),
  referenceIds: z.array(z.string().uuid()).max(6),
  referenceProjectId: z.string().uuid().nullable(),
  artworkMode: z.enum(['keep-font', 'redraw']).optional()
}).strict()
export type BannerEffectRecipe = z.infer<typeof bannerEffectRecipeSchema>
export const EFFECT_PRESETS = [
  { id: 'clean', label: 'Clean', style: { color: '#ffffff', textShadow: '', textStroke: '', gradientColors: [], visualFilter: 'none' } },
  { id: 'neon', label: 'Neon', style: { color: '#ffffff', textShadow: '0px 0px 8px #22d3ee, 0px 0px 20px #22d3ee', textStroke: '', gradientColors: [] } },
  { id: 'emboss', label: 'Embossed', style: { color: '#e5e7eb', textShadow: '0px 2px 0px #111827, 0px -1px 0px #ffffff', textStroke: '', gradientColors: [] } },
  { id: 'chrome', label: 'Chrome', style: { color: '#ffffff', textShadow: '0px 2px 2px #111827', textStroke: '1px #94a3b8', gradientColors: ['#ffffff', '#64748b', '#ffffff', '#334155'] } },
  { id: 'warm', label: 'Flame colours', style: { color: '#ffffff', textShadow: '0px 0px 12px #f97316', textStroke: '', gradientColors: ['#fef08a', '#f97316', '#dc2626'] } }
] satisfies Array<{ id: string, label: string, style: BannerEffectStyle }>

export function effectStyleFromLayer(layer: Record<string, unknown>): BannerEffectStyle {
  return Object.fromEntries(Object.entries(bannerEffectStyleSchema.shape).flatMap(([key, schema]) => {
    const result = schema.safeParse(layer[key])
    return result.success && result.data !== undefined ? [[key, result.data]] : []
  })) as BannerEffectStyle
}

/** Shared by native previews and exported HTML; discard unsupported persisted CSS. */
export function bannerEffectCss(layer: Record<string, unknown>): string {
  const s = effectStyleFromLayer(layer)
  const texture = safeBannerTextTexture(layer.textTexture)
  const fill = texture ? `url('${texture}');background-size:cover;background-color:${s.color || '#ffffff'}` : s.gradientColors && s.gradientColors.length >= 2 ? `linear-gradient(to right,${s.gradientColors.join(',')})` : ''
  return `${s.textShadow && !texture ? `text-shadow:${s.textShadow};` : ''}${s.textStroke ? `-webkit-text-stroke:${s.textStroke};` : ''}${fill ? `background-image:${fill};background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent;` : ''}${s.visualFilter && s.visualFilter !== 'none' ? `filter:${s.visualFilter};` : ''}`
}

export function safeBannerTextTexture(value: unknown): string {
  return typeof value === 'string' && value.length <= 4000 && /^https:\/\/[^\s"'\\<>()]+$/.test(value) ? value : ''
}

/** Decorative copy behind the editable face; no raster font substitution. */
export function bannerTextDepthShadow(layer: Record<string, unknown>): string {
  const parsed = bannerTextDepthSchema.safeParse(layer.textDepth)
  if (!parsed.success) return ''
  const d = parsed.data
  const radians = (angle: number) => angle * Math.PI / 180
  const px = (n: number) => `${Math.round(n * 100) / 100}px`
  const shadow = (x: number, y: number, blur: number, color: string) => `${px(x)} ${px(y)} ${px(blur)} ${color}`
  const x = Math.cos(radians(d.angle)), y = Math.sin(radians(d.angle))
  const lx = Math.cos(radians(d.lightAngle)) * d.bevel, ly = Math.sin(radians(d.lightAngle)) * d.bevel
  const parts: string[] = []
  if (d.bevel) parts.push(shadow(lx, ly, 0, '#ffffff'), shadow(-lx, -ly, 0, '#111111'))
  for (let step = 1; step <= d.size; step++) parts.push(shadow(x * step, y * step, 0, d.color))
  if (d.shadow && d.shadowOpacity) parts.push(shadow(x * (d.size + d.shadow), y * (d.size + d.shadow), d.shadow, `rgba(0,0,0,${d.shadowOpacity})`))
  return parts.join(',')
}

/** Receives already-escaped text/inline runs from the renderers. */
export function bannerTextMarkup(content: string, layer: Record<string, unknown>): string {
  const shadow = bannerTextBackdropShadow(layer)
  if (!shadow && !safeBannerTextTexture(layer.textTexture)) return content
  const s = effectStyleFromLayer(layer)
  return `<div style="position:relative;">${shadow ? `<div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;color:${s.textDepth?.color || s.color || '#ffffff'};text-shadow:${shadow};">${content}</div>` : ''}<div style="position:relative;${bannerEffectCss(layer).replace(/&/g, '&amp;')}">${content}</div></div>`
}

export function bannerTextBackdropShadow(layer: Record<string, unknown>): string {
  return [bannerTextDepthShadow(layer), safeBannerTextTexture(layer.textTexture) ? effectStyleFromLayer(layer).textShadow : ''].filter(Boolean).join(',')
}
