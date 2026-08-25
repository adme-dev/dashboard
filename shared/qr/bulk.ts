import { z } from 'zod'
import { QrStyleSchema } from './style'
import { QrFrameSchema } from './frame'

/**
 * Bulk / variant codes: N codes from one definition, grouped under a campaign.
 * Name pattern tokens: {base} (the shared name), {variant} (the per-code label), {n} (1-based index).
 */
export const BULK_MAX_VARIANTS = 200
export const BULK_VARIANT_MAX_LEN = 60
export const DEFAULT_NAME_PATTERN = '{base} – {variant}'

const HEX_UTM = z.string().trim().max(64).nullable().optional()

export const BulkQrSchema = z.object({
  clientId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  /** Existing campaign to add to, or a new campaign name. One is required. */
  campaignId: z.string().uuid().nullable().optional(),
  campaignName: z.string().trim().min(1).max(120).optional(),
  baseName: z.string().trim().min(1).max(100),
  namePattern: z.string().trim().min(1).max(160).default(DEFAULT_NAME_PATTERN),
  variants: z.array(z.string().trim().min(1).max(BULK_VARIANT_MAX_LEN)).min(1).max(BULK_MAX_VARIANTS),
  destinationUrl: z.string().trim().min(1).max(2048),
  style: QrStyleSchema.default(() => QrStyleSchema.parse({})),
  frame: QrFrameSchema.default(() => QrFrameSchema.parse({})),
  utmEnabled: z.boolean().default(true),
  utmMedium: z.string().trim().max(32).default('print'),
  utmSource: HEX_UTM
}).strict().superRefine((v, ctx) => {
  if (!v.campaignId && !v.campaignName) ctx.addIssue({ code: 'custom', message: 'Give the campaign a name', path: ['campaignName'] })
  const seen = new Set<string>()
  for (const x of v.variants) {
    const k = x.toLowerCase()
    if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `Duplicate variant "${x}"`, path: ['variants'] })
    seen.add(k)
  }
})
export type BulkQrInput = z.infer<typeof BulkQrSchema>

/** Splits a pasted list (newlines, commas or semicolons) into trimmed, de-duplicated variants. */
export function parseVariantsInput(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/[\n,;]+/)) {
    const v = raw.trim().slice(0, BULK_VARIANT_MAX_LEN)
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
    if (out.length >= BULK_MAX_VARIANTS) break
  }
  return out
}

/** "1".."n", zero-padded to the width of n so names sort naturally. */
export function numberedVariants(count: number, prefix = ''): string[] {
  const n = Math.max(0, Math.min(BULK_MAX_VARIANTS, Math.floor(count)))
  const width = String(n).length
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(width, '0')}`)
}

export function expandName(pattern: string, base: string, variant: string, index: number): string {
  const name = pattern.replace(/\{base\}/g, base).replace(/\{variant\}/g, variant).replace(/\{n\}/g, String(index + 1)).trim()
  return (name || `${base} – ${variant}`).slice(0, 120)
}

export function expandNames(pattern: string, base: string, variants: string[]): string[] {
  return variants.map((v, i) => expandName(pattern, base, v, i))
}
