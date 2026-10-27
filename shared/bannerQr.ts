import { z } from 'zod'

export const bannerQrRequestSchema = z
  .object({
    qrCodeId: z.string().uuid(),
    sourceRevision: z.string().datetime({ offset: true })
  })
  .strict()
export const bannerPlatformQrSchema = z
  .object({
    version: z.literal(1),
    qrCodeId: z.string().uuid(),
    clientId: z.string().uuid(),
    code: z.string().regex(/^[A-Za-z0-9_-]{3,128}$/),
    shortUrl: z.string().url(),
    name: z.string().min(1).max(120),
    renderedAt: z.string().datetime({ offset: true }),
    qrUpdatedAt: z.string().datetime({ offset: true }),
    assetId: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    quietZone: z.number().int().min(4).max(8),
    sourceQuietZone: z.number().int().min(0).max(8),
    warnings: z.array(z.string().max(500)).max(10)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.shortUrl !== `https://app.xeroflow.io/q/${value.code}`)
      context.addIssue({
        code: 'custom',
        path: ['shortUrl'],
        message: 'Platform QR URL must match its canonical code'
      })
  })
export const bannerQrResponseSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceRevision: z.string().datetime({ offset: true }),
    asset: z
      .object({
        id: z.string().uuid(),
        url: z.string().url(),
        mimeType: z.literal('image/svg+xml'),
        width: z.number().finite().positive().max(4096),
        height: z.number().finite().positive().max(4096),
        sha256: z.string().regex(/^[a-f0-9]{64}$/)
      })
      .strict(),
    platformQr: bannerPlatformQrSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.asset.id !== value.platformQr.assetId
      || value.asset.sha256 !== value.platformQr.sha256
    )
      context.addIssue({
        code: 'custom',
        path: ['platformQr'],
        message: 'QR metadata must identify the returned asset'
      })
  })
export type BannerPlatformQr = z.infer<typeof bannerPlatformQrSchema>
export type BannerQrResponse = z.infer<typeof bannerQrResponseSchema>
