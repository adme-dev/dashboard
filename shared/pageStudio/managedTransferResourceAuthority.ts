import { z } from 'zod'
import { ContentAttachmentRequestSchema } from './content-attachment'

export const RESOURCE_AUTHORITY_PATH = '/internal/page-studio/managed-transfers/resources/authorize'
export const RESOURCE_AUTHORITY_URL = 'https://page-studio-management.internal/managed-transfer-resource-authority'
export const RESOURCE_AUTHORITY_ERROR = 'Managed transfer resource authority unavailable'
export const ResourceAuthorityRequest = z.object({
  expectedControlPlaneEnvironment: z.literal('production'),
  execution: z.object({ operationId: z.string().uuid(), intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    resourceRequest: ContentAttachmentRequestSchema.refine(value => value.scope.environment === 'production') }).strict()
}).strict()
