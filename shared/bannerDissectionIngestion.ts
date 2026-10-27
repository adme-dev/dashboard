import { z } from 'zod'

// Server-owned metadata. These schemas validate persisted shape, not source bytes.
const id = z.string().uuid().transform(value => value.toLowerCase())
const instant = z.string().refine(value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}, 'Expected canonical UTC timestamp')

export const dissectionSourceSchema = z.object({
  version: z.literal(1),
  mimeType: z.literal('image/png'),
  byteLength: z.number().int().min(1).max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
}).strict().refine(source => source.width * source.height <= 10_000_000, 'Source pixel budget exceeded')

export const dissectionOwnerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), userId: id }).strict(),
  z.object({ kind: z.literal('client'), userId: id, clientId: id }).strict(),
  z.object({ kind: z.literal('project'), userId: id, projectId: id, projectOwnerId: id, clientId: id.nullable() }).strict(),
])

export const dissectionPhysicalSchema = z.object({
  preset: z.literal('A4'), orientation: z.enum(['portrait', 'landscape']),
  unit: z.literal('mm'), widthMm: z.union([z.literal(210), z.literal(297)]),
  heightMm: z.union([z.literal(210), z.literal(297)]),
}).strict().refine(value => value.orientation === 'portrait'
  ? value.widthMm === 210 && value.heightMm === 297
  : value.widthMm === 297 && value.heightMm === 210, 'A4 orientation and dimensions differ')

export const dissectionIngestionSchema = z.object({
  version: z.literal(1), owner: dissectionOwnerSchema,
  physical: dissectionPhysicalSchema.nullable(), ingestedAt: instant,
  sessionsInvalidatedAt: instant.nullable(),
}).strict()

export type DissectionSource = z.infer<typeof dissectionSourceSchema>
export type DissectionOwner = z.infer<typeof dissectionOwnerSchema>
export type DissectionPhysical = z.infer<typeof dissectionPhysicalSchema>
export type DissectionIngestion = z.infer<typeof dissectionIngestionSchema>
