import { z } from 'zod'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
/** Small native callback. Full context is always re-resolved from retained rows. */
export const ManagedTransferCopyAuthorizationSchema = z.object({ operationId: z.uuid(), intentDigest: Digest,
  requestDigest: Digest, contextDigest: Digest, action: z.enum(['prepare', 'read', 'inspect']) }).strict()
