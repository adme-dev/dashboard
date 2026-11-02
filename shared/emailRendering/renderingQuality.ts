import { z } from 'zod'
import { publicEmailUrl } from './importedDocument'
import { FONT_FAMILY_MAP } from './fonts'

export const EmailThemeColor = z.string().regex(/^#[a-fA-F0-9]{6}$/)
export const EmailDarkModeFields = {
  darkMode: z.boolean().optional(),
  darkBackdropColor: EmailThemeColor.optional(),
  darkCanvasColor: EmailThemeColor.optional(),
  darkTextColor: EmailThemeColor.optional()
}
export const EmailOutlookButtonFields = {
  outlookVml: z.boolean().optional(),
  outlookWidth: z.number().int().min(32).max(960).optional()
}
export const EmailReverseStackingFields = { reverseStacking: z.boolean().optional() }
export const EmailDarkImageFields = {
  // Static asset reference, never recipient-controlled URL personalization.
  darkSrc: z.string().max(8192).refine(value => value === '' || (!/[{}]/.test(value) && publicEmailUrl(value))).optional()
}
const fieldsByType: Record<string, Record<string, z.ZodType>> = {
  EmailLayout: EmailDarkModeFields, Button: EmailOutlookButtonFields,
  Image: EmailDarkImageFields, ColumnsContainer: EmailReverseStackingFields
}
const PaddingLength = z.number().int().min(0).max(960).optional()
const OutlookStyle = z.object({
  padding: z.object({ top: PaddingLength, bottom: PaddingLength, left: PaddingLength, right: PaddingLength }).strict().nullable().optional(),
  fontSize: z.number().int().min(10).max(72).nullable().optional(),
  fontFamily: z.enum(Object.keys(FONT_FAMILY_MAP) as [string, ...string[]]).nullable().optional(),
  fontWeight: z.enum(['normal', 'bold', '400', '500', '600', '700']).nullable().optional(),
  textAlign: z.enum(['left', 'center', 'right']).nullable().optional(),
  backgroundColor: EmailThemeColor.nullable().optional()
}).passthrough()
const qualityKeys = new Set(Object.values(fieldsByType).flatMap(fields => Object.keys(fields)))

export function isEmailRenderingQualityProperty(key: string): boolean {
  return qualityKeys.has(key)
}

/** Only validate the new opt-in fields; old authored props retain their existing
 * contract. Reject misplaced known settings instead of interpreting truthy data. */
export function validRenderingQualityProps(type: string, props: Record<string, unknown>, style?: unknown): boolean {
  const selected = Object.fromEntries(Object.entries(props).filter(([key]) => qualityKeys.has(key)))
  if (!Object.keys(selected).length) return true
  if (!z.object(fieldsByType[type] ?? {}).strict().safeParse(selected).success) return false
  if (type === 'Image' && props.darkSrc) {
    if (typeof props.url !== 'string' || !publicEmailUrl(props.url)) return false
    if (props.linkHref && (typeof props.linkHref !== 'string' || !publicEmailUrl(props.linkHref, true))) return false
  }
  if (type === 'Button' && props.outlookVml === true) {
    if (!OutlookStyle.safeParse(style ?? {}).success) return false
    for (const key of ['buttonBackgroundColor', 'buttonTextColor']) {
      if (props[key] !== undefined && !EmailThemeColor.safeParse(props[key]).success) return false
    }
    if (props.fullWidth !== undefined && typeof props.fullWidth !== 'boolean') return false
    if (props.buttonStyle !== undefined && !['rounded', 'pill', 'rectangle', 'square'].includes(String(props.buttonStyle))) return false
    if (props.size !== undefined && !['x-small', 'small', 'medium', 'large'].includes(String(props.size))) return false
    if (props.text !== undefined && (typeof props.text !== 'string' || props.text.length > 8192)) return false
    if (props.url !== undefined && (typeof props.url !== 'string' || props.url.length > 8192 || !publicEmailUrl(props.url, true))) return false
  }
  if (type === 'ColumnsContainer' && props.reverseStacking === true) {
    if (!z.array(z.object({ childrenIds: z.array(z.string()).optional() }).passthrough()).min(1).max(3).safeParse(props.columns).success) return false
    if (props.columnsGap !== undefined && !z.number().int().min(0).max(96).safeParse(props.columnsGap).success) return false
    if (props.fixedWidths !== undefined && !z.array(z.number().int().min(1).max(960).nullable()).max(3).safeParse(props.fixedWidths).success) return false
  }
  return true
}

export function emailDarkPalette(props: Record<string, unknown>) {
  if (props.darkMode !== true) return null
  const color = (value: unknown, fallback: string) => EmailThemeColor.safeParse(value).success ? value as string : fallback
  return {
    backdrop: color(props.darkBackdropColor, '#111827'),
    canvas: color(props.darkCanvasColor, '#1f2937'),
    text: color(props.darkTextColor, '#f3f4f6')
  }
}
