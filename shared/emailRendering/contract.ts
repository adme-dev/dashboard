import { z } from 'zod'
import { ValidatedEmailTemplateSchema, type EmailTemplate } from '../pageStudio/emailTemplates'

export const EMAIL_RENDER_VERSION = 1 as const
export const RenderEnvironmentSchema = z.enum(['staging', 'production'])
export type RenderEnvironment = z.infer<typeof RenderEnvironmentSchema>
export const DocumentRenderOptionsSchema = z.object({ subjectLine: z.string().optional(), previewText: z.string().optional(), primaryColor: z.string().optional(), variables: z.record(z.string(), z.string()).optional() }).strict()
export type DocumentRenderOptions = z.infer<typeof DocumentRenderOptionsSchema>
export const CustomerPreviewContextSchema = z.object({
  siteName: z.string().max(8000), formName: z.string().max(8000),
  fields: z.array(z.object({ id: z.string().max(128), name: z.string().max(8000), type: z.string().max(128) }).strict()).max(500),
  images: z.record(z.string().uuid(), z.string().max(710_000)).optional()
}).strict()
export type CustomerPreviewContext = z.infer<typeof CustomerPreviewContextSchema>
export const CustomerEmailPreviewSchema = z.object({ subject: z.string().max(998), preheader: z.string().max(998), html: z.string(), sample: z.literal(true) }).strict()
export type CustomerEmailPreview = z.infer<typeof CustomerEmailPreviewSchema>
const common = { version: z.literal(1), expectedEnvironment: RenderEnvironmentSchema }
export const EmailRenderRequestSchema = z.discriminatedUnion('operation', [
  z.object({ ...common, operation: z.literal('document'), document: z.unknown(), options: DocumentRenderOptionsSchema }).strict(),
  z.object({ ...common, operation: z.literal('customer-preview'), template: ValidatedEmailTemplateSchema, context: CustomerPreviewContextSchema }).strict()
])
export type EmailRenderRequest = z.infer<typeof EmailRenderRequestSchema>
const response = { version: z.literal(1), environment: RenderEnvironmentSchema }
export const EmailRenderResponseSchema = z.union([
  z.object({ ...response, operation: z.literal('document'), ok: z.literal(true), value: z.object({ html: z.string() }).strict() }).strict(),
  z.object({ ...response, operation: z.literal('customer-preview'), ok: z.literal(true), value: CustomerEmailPreviewSchema }).strict(),
  z.object({ version: z.literal(1), environment: RenderEnvironmentSchema.nullable(), operation: z.enum(['document', 'customer-preview']).nullable(), ok: z.literal(false), error: z.object({ code: z.enum(['INVALID_INPUT', 'LIMIT_EXCEEDED', 'UNAVAILABLE']) }).strict() }).strict()
])
export type EmailRenderResponse = z.infer<typeof EmailRenderResponseSchema>
export interface EmailRendererClient {
  renderDocument(document: unknown, options?: DocumentRenderOptions): Promise<string>
  renderCustomerPreview(template: EmailTemplate, context: CustomerPreviewContext): Promise<CustomerEmailPreview>
}
