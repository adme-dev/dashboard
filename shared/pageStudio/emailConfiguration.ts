import { z } from 'zod'

const singleLine = (value: string) => Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
const email = z.string().max(254).email().refine(singleLine, 'Enter a single email address')
export const PageStudioEmailSettingsSchema = z.object({
  senderName: z.string().trim().min(1).max(120).refine(singleLine, 'Use a single-line sender name'),
  fromAddress: email,
  replyTo: email,
  notificationRecipient: email,
  inboundAddress: z.union([email, z.literal('')]),
  forwardingDestination: z.union([email, z.literal('')])
}).strict().refine(value => Boolean(value.inboundAddress) === Boolean(value.forwardingDestination), {
  message: 'Enter both the incoming address and forwarding destination, or leave both empty', path: ['forwardingDestination']
})
export const PageStudioEmailEditSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  settings: PageStudioEmailSettingsSchema
}).strict()
export const PageStudioEmailRecordSchema = z.object({
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  settings: PageStudioEmailSettingsSchema,
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid()
}).strict()
export const PageStudioEmailStoreSchema = z.object({
  staging: PageStudioEmailRecordSchema.optional(),
  production: PageStudioEmailRecordSchema.optional()
}).strict()
export type PageStudioEmailSettings = z.infer<typeof PageStudioEmailSettingsSchema>
export interface PageStudioEmailState {
  siteId: string
  environment: 'staging' | 'production'
  revision: number
  settings: PageStudioEmailSettings | null
  updatedAt: string | null
  canEdit: boolean
  readiness: {
    status: 'not_configured' | 'setup_required'
    sendingEnabled: false
    forwardingEnabled: false
    senderVerification: 'unverified'
    message: string
  }
}
