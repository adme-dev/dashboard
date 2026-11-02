import { z } from 'zod'
import { DESIGN_LIMITS } from './designContract'
import { snapshotRenderInput } from './bounds'

const identity = { version: z.literal(1), operationId: z.string().uuid() }
const metadata = { name: z.string().trim().min(1).max(200), category: z.string().trim().min(1).max(120).nullable() }
const request = z.discriminatedUnion('command', [
  z
    .object({
      ...identity,
      ...metadata,
      command: z.literal('revise-template'),
      draftId: z.string().uuid(),
      expectedRevisionId: z.string().uuid(),
      templateId: z.string().uuid(),
      expectedTemplateRevisionId: z.string().uuid(),
      includedOverridePaths: z.array(z.string().min(1).max(512)).max(3000)
    })
    .strict(),
  z
    .object({
      ...identity,
      ...metadata,
      command: z.literal('publish-template'),
      draftId: z.string().uuid(),
      expectedRevisionId: z.string().uuid(),
      includedOverridePaths: z.array(z.string().min(1).max(512)).max(3000)
    })
    .strict(),
  z
    .object({
      ...identity,
      ...metadata,
      command: z.literal('copy-template-draft'),
      templateId: z.string().uuid(),
      revisionId: z.string().uuid(),
      expectedSourceHeadRevisionId: z.string().uuid(),
      clientId: z.string().uuid().nullable()
    })
    .strict()
])
export type DesignTemplateRequest = z.infer<typeof request>
export function parseDesignTemplateRequest(input: unknown) {
  return request.parse(snapshotRenderInput(input, DESIGN_LIMITS.documentBytes))
}
export interface DesignLibraryReceipt {
  documentId: string
  revisionId: string
  templateId?: string
  moduleId?: string
  published: boolean
}
