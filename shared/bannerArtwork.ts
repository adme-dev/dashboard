import { z } from 'zod'

const base = {
  projectId: z.string().uuid(),
  sourceRevision: z.string().datetime({ offset: true }),
  formatKey: z.string().min(1).max(100)
}
export const generationRequestSchema = z
  .object({
    ...base,
    prompt: z.string().trim().min(1).max(6000),
    approvedCopy: z
      .array(
        z
          .string()
          .min(1)
          .max(2000)
          .refine(value => !!value.trim(), 'Approved copy cannot be blank')
      )
      .min(1)
      .max(30),
    referenceAssetIds: z.array(z.string().uuid()).max(8).default([]),
    referenceAssetId: z.string().uuid().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.referenceAssetIds.length && !value.referenceAssetId)
      context.addIssue({
        code: 'custom',
        path: ['referenceAssetIds'],
        message: 'At least one owned reference is required'
      })
  })
export const letteringRequestSchema = z
  .object({
    ...base,
    layerId: z.number().int().positive(),
    mode: z.enum(['native', 'raster']),
    wording: z.string().min(1).max(2000),
    instruction: z
      .string()
      .trim()
      .max(2000)
      .default('Preserve the lettering style.'),
    referenceAssetId: z.string().uuid().optional(),
    sourceWording: z.string().min(1).max(2000).optional(),
    isolationConfirmed: z.boolean().optional()
  })
  .strict()
const color = z.string().regex(/^#[0-9a-f]{6}$/i)
export const nativeArtworkStyleSchema = z
  .object({
    fontFamily: z.enum([
      'Arial',
      'Arial Black',
      'Impact',
      'Georgia',
      'Verdana',
      'Times New Roman',
      'Trebuchet MS',
      'Courier New'
    ]),
    fontSize: z.number().finite().min(6).max(1000),
    fontWeight: z.number().int().min(100).max(900),
    fontStyle: z.enum(['normal', 'italic']),
    color,
    textAlign: z.enum(['left', 'center', 'right']),
    lineHeight: z.number().min(0.5).max(3),
    letterSpacing: z.string().regex(/^-?(?:\d|\d\d)(?:\.\d{1,2})?px$/)
  })
  .strict()
export type ArtworkGenerationRequest = z.infer<typeof generationRequestSchema>
export type ArtworkLetteringRequest = z.infer<typeof letteringRequestSchema>
export type ArtworkNativeStyle = z.infer<typeof nativeArtworkStyleSchema>
export interface ArtworkEvidence {
  provider: string
  model: string
  requestId: string | null
  cost: null
}
export interface ArtworkAsset {
  id: string
  url: string
  width: number
  height: number
  sha256: string
}
export interface ArtworkProposal {
  proposalId: string
  projectId: string
  sourceRevision: string
  formatKey: string
  mode: 'generation' | 'native' | 'raster'
  layerId?: number
  wording?: string
  asset?: ArtworkAsset
  nativeStyle?: ArtworkNativeStyle
  evidence: ArtworkEvidence
  warnings: string[]
  verification: 'review-required'
  referenceAssetIds: string[]
  referenceHashes?: string[]
}
