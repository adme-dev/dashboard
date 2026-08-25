import { z } from 'zod'
import { QrStyleSchema } from '~~/shared/qr/style'
import { QR_UTM_MEDIUMS } from '~~/shared/qr/tracking'

const uuid = z.string().uuid()
export const CreateQrSchema = z.object({
  name: z.string().trim().min(1).max(120),
  clientId: uuid,
  folderId: uuid.nullable().optional(),
  destinationUrl: z.string().trim().min(1).max(2048),
  style: QrStyleSchema.default(() => QrStyleSchema.parse({})),
  utmEnabled: z.boolean().default(true),
  utmMedium: z.enum(QR_UTM_MEDIUMS).default('print')
}).strict()

export const UpdateQrSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  folderId: uuid.nullable().optional(),
  destinationUrl: z.string().trim().min(1).max(2048).optional(),
  style: QrStyleSchema.optional(),
  isActive: z.boolean().optional(),
  utmEnabled: z.boolean().optional(),
  utmMedium: z.enum(QR_UTM_MEDIUMS).optional()
}).strict()

export const FolderSchema = z.object({ clientId: uuid, name: z.string().trim().min(1).max(80) }).strict()
export const FolderUpdateSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict()
