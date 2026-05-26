import { z } from 'zod'

const OfficeRole = z.enum(['admin', 'member', 'guest'])
export const ZoneSlugSchema = z.string().trim().regex(/^[a-z0-9-]+$/).max(64)
export const ZoneNameSchema = z.string().trim().min(1).max(120)
export const ZoneTypeSchema = z.enum(['lobby', 'meeting', 'focus', 'theater', 'client_lounge', 'desk'])

export const ZoneAclSchema = z.object({
  allowed_roles: z.array(OfficeRole).optional(),
  allowed_clients: z.array(z.string().uuid()).optional(),
  public_lobby: z.boolean().optional()
}).transform((acl) => {
  const normalized: {
    allowed_roles?: Array<z.infer<typeof OfficeRole>>
    allowed_clients?: string[]
    public_lobby?: boolean
  } = {}
  if (acl.allowed_roles?.length) normalized.allowed_roles = [...new Set(acl.allowed_roles)]
  if (acl.allowed_clients?.length) normalized.allowed_clients = [...new Set(acl.allowed_clients)]
  if (acl.public_lobby === true) normalized.public_lobby = true
  return normalized
})

export const ZonePositionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive()
})

export const ZoneCapacitySchema = z.number().int().positive()
