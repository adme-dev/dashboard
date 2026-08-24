import { z } from 'zod'

const HEX = /^#[0-9a-fA-F]{6}$/
export const QR_PATTERNS = ['classic', 'rounded', 'thin', 'smooth', 'circles'] as const
export const QR_EYES = ['square', 'rounded', 'circle'] as const

export const QrLogoSchema = z.object({
  dataUri: z.string().regex(/^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/, 'logo must be a png/svg data URI').max(400_000),
  sizePct: z.number().min(10).max(25).default(20),
  padding: z.number().min(0).max(4).default(1),
})

export const QrStyleSchema = z.object({
  pattern: z.enum(QR_PATTERNS).default('classic'),
  eye: z.enum(QR_EYES).default('square'),
  fg: z.string().regex(HEX).default('#000000'),
  bg: z.string().regex(HEX).default('#ffffff'),
  eyeFg: z.string().regex(HEX).optional(),
  margin: z.number().int().min(0).max(8).default(2),
  logo: QrLogoSchema.optional(),
})

export type QrStyle = z.infer<typeof QrStyleSchema>
export type QrLogo = z.infer<typeof QrLogoSchema>
export const DEFAULT_STYLE: QrStyle = QrStyleSchema.parse({})
