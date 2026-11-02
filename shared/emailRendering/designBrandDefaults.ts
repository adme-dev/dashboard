import { z } from 'zod'
import { FONT_FAMILY_MAP } from './fonts'
import type { EmailDesignDocument } from './designContract'

const Color = z.string().regex(/^#[a-fA-F0-9]{6}$/)
const Font = z.enum(Object.keys(FONT_FAMILY_MAP) as [string, ...string[]])
export const EmailBrandDefaultsSchema = z.object({
  primaryColor: Color,
  fontFamily: Font,
  contentWidth: z.number().int().min(320).max(960),
  fontFallback: z.boolean(),
  requestedFont: z.string().max(120).nullable()
}).strict()
export const EmailBrandSnapshotSchema = z.object({
  kitId: z.string().uuid(), versionId: z.string().uuid(), version: z.number().int().positive(),
  name: z.string().min(1).max(255), defaults: EmailBrandDefaultsSchema
}).strict()
export type EmailBrandSnapshot = z.infer<typeof EmailBrandSnapshotSchema>

/** One email defaults owner. Brand font uploads are never fetched or embedded.
 * The chosen stack is a supported fallback, not a client font guarantee. */
export function emailBrandDefaults(kit: { colors?: unknown, fonts?: unknown }) {
  const colors = Array.isArray(kit.colors) ? kit.colors : []
  const fonts = Array.isArray(kit.fonts) ? kit.fonts : []
  const primary = colors.find(c => c && c.role === 'primary')?.hex ?? (typeof colors[0] === 'string' ? colors[0] : null)
  const requested = fonts.find(f => f?.role === 'body')?.family ?? fonts.find(f => f?.role === 'heading')?.family ?? fonts[0]?.family
  const requestedFont = typeof requested === 'string' ? requested.slice(0, 120) : null
  const aliases: Record<string, string> = { 'arial': 'MODERN_SANS', 'helvetica': 'MODERN_SANS', 'helvetica neue': 'MODERN_SANS', 'georgia': 'MODERN_SERIF', 'times new roman': 'BOOK_SERIF', 'courier new': 'MONOSPACE' }
  const family = requestedFont && (Object.hasOwn(FONT_FAMILY_MAP, requestedFont) ? requestedFont : aliases[requestedFont.toLowerCase()])
  return EmailBrandDefaultsSchema.parse({ primaryColor: Color.safeParse(primary).success ? primary : '#2563eb', fontFamily: family || 'MODERN_SANS', contentWidth: 600, requestedFont, fontFallback: !family })
}

/** Applied at creation only, never to copies, presets, linked instances or
 * existing authored blocks. Native/composer additions share these semantics. */
export function newEmailBlockDefaults(type: string, design: Pick<EmailDesignDocument, 'blocks' | 'source'>) {
  const root = design.blocks.root?.data.props ?? {}
  const brand = design.source.brand?.defaults
  const font = brand?.fontFamily ?? (Font.safeParse(root.fontFamily).success ? String(root.fontFamily) : undefined)
  const primary = Color.safeParse(root.primaryColor).success ? String(root.primaryColor) : brand?.primaryColor
  const style: Record<string, string> = {}
  const props: Record<string, string> = {}
  if (font && ['Heading', 'Text', 'Button'].includes(type)) style.fontFamily = font
  if (primary && type === 'Heading') style.color = primary
  if (primary && type === 'Button') props.buttonBackgroundColor = primary
  if (primary && type === 'Divider') props.lineColor = primary
  return { props, style }
}
