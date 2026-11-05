import { z } from 'zod'
import { CodeContentBindingSchema } from './codeContent'
export const TemplatePreviewPointerSchema = z.object({
  kind: z.literal('template-preview'), versionId: z.string().uuid(),
  scope: z.object({ tenantId: z.string().min(1).max(200), clientId: z.string().uuid(), siteId: z.string().uuid() }).strict(),
  id: z.string().uuid(), checkpointId: z.string().min(1).max(128), digest: z.string().regex(/^[a-f0-9]{64}$/),
  codeContent: CodeContentBindingSchema.optional(), artifactPrefix: z.string().min(1).max(1024), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
export function templatePreviewHostname(versionId: string) { return `template-${z.string().uuid().parse(versionId).replaceAll('-', '').toLowerCase()}.xeroflow.io` }
