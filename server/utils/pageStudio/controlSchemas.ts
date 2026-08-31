import { z } from 'zod'

import { PageStudioHostnameSchema } from '~~/server/utils/pageStudio/delivery'

const ScopedId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const Digest = z.string().regex(/^[a-f0-9]{64}$/)

export const PageStudioControlIdSchema = ScopedId

export const PageStudioControlScopeSchema = z.object({
  clientId: z.string().uuid(),
  siteId: z.string().uuid(),
  tenantId: ScopedId
}).strict()

export const PageStudioCheckpointSchema = z.object({
  checkpointId: ScopedId,
  createdAt: z.string().datetime(),
  digest: Digest,
  etag: z.string().min(1).max(512),
  objectKey: z.string().min(1).max(1024),
  scope: PageStudioControlScopeSchema,
  userId: z.string().uuid()
}).strict()

export const PageStudioVersionRegistrationSchema = z.object({
  authorRole: z.enum(['agency', 'client']),
  checkpointId: ScopedId,
  digest: Digest,
  scope: PageStudioControlScopeSchema,
  summary: z.string().trim().min(1).max(500),
  userId: z.string().uuid()
}).strict()

export const PageStudioAuditEventSchema = z.object({
  action: z.enum([
    'workspace.created',
    'workspace.reconnected',
    'workspace.checkpointed',
    'workspace.previewed',
    'workspace.terminated',
    'session.revoked',
    'version.registered'
  ]),
  actorId: ScopedId,
  actorRole: z.enum(['agency', 'client', 'service']),
  occurredAt: z.string().datetime(),
  resourceId: ScopedId,
  resourceType: z.enum(['checkpoint', 'session', 'version', 'workspace']),
  scope: PageStudioControlScopeSchema
}).strict().superRefine((event, context) => {
  const expectedResource = {
    'workspace.created': 'workspace',
    'workspace.reconnected': 'workspace',
    'workspace.checkpointed': 'checkpoint',
    'workspace.previewed': 'workspace',
    'workspace.terminated': 'workspace',
    'session.revoked': 'session',
    'version.registered': 'version'
  } as const
  if (event.resourceType !== expectedResource[event.action]) {
    context.addIssue({
      code: 'custom',
      message: 'Audit action and resource type do not match',
      path: ['resourceType']
    })
  }
})

export const PageStudioIdempotencyKeySchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[\x21-\x7e]+$/)

export const PageStudioReleaseActivationSchema = z.object({
  actorId: ScopedId,
  buildId: ScopedId,
  environment: z.enum(['staging', 'production']),
  expectedActiveReleaseId: ScopedId.nullable(),
  hostname: PageStudioHostnameSchema,
  scope: PageStudioControlScopeSchema
}).strict()
