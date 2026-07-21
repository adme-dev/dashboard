import { z } from 'zod'

const ObjectKeySchema = z.string().min(1).max(1024)
const EtagSchema = z.string().trim().min(1).max(255)
const MimeTypeSchema = z.string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/, 'Invalid MIME type')

export const R2ObjectCreateEventSchema = z.object({
  account: z.string().min(1).max(64),
  action: z.enum(['PutObject', 'CopyObject', 'CompleteMultipartUpload']),
  bucket: z.string().min(1).max(255),
  object: z.object({
    key: ObjectKeySchema,
    size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    eTag: EtagSchema
  }),
  eventTime: z.string().datetime({ offset: true })
})

export const SendScanQueueMessageSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().uuid()
}).strict()

const ScanResultBase = {
  schemaVersion: z.literal(1),
  jobId: z.string().uuid(),
  objectEtag: EtagSchema,
  provider: z.string().trim().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/),
  engineVersion: z.string().trim().min(1).max(100),
  signatureVersion: z.string().trim().min(1).max(100),
  detectedMimeType: MimeTypeSchema,
  activeContent: z.boolean(),
  scannedAt: z.string().datetime({ offset: true })
}

export const SendScanResultSchema = z.discriminatedUnion('verdict', [
  z.object({
    ...ScanResultBase,
    verdict: z.literal('clean'),
    reasonCode: z.literal('NONE')
  }).strict(),
  z.object({
    ...ScanResultBase,
    verdict: z.literal('detected'),
    reasonCode: z.enum(['MALWARE_DETECTED', 'CONTENT_TYPE_MISMATCH', 'ACTIVE_CONTENT_BLOCKED'])
  }).strict(),
  z.object({
    ...ScanResultBase,
    verdict: z.literal('error'),
    reasonCode: z.enum(['SCANNER_UNAVAILABLE', 'OBJECT_READ_FAILED', 'RESULT_INVALID'])
  }).strict(),
  z.object({
    ...ScanResultBase,
    verdict: z.literal('timeout'),
    reasonCode: z.literal('SCAN_TIMEOUT')
  }).strict()
])

export type R2ObjectCreateEvent = z.infer<typeof R2ObjectCreateEventSchema>
export type SendScanQueueMessage = z.infer<typeof SendScanQueueMessageSchema>
export type SendScanResult = z.infer<typeof SendScanResultSchema>
