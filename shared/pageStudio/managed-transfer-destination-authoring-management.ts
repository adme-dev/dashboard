// Tiny Pages wire only. Full retained proof/schema validation belongs to Worker.
import { z } from 'zod'
import { managementResultSchema, ManagementStatusErrorSchema } from './managementResult'

const Value = z.unknown().refine(value => value !== undefined)
export const ManagedTransferDestinationAuthoringManagementRequestSchema = z.discriminatedUnion('action', [
  z.object({ expectedEnvironment: z.literal('production'), action: z.literal('authorize'), authorization: Value }).strict(),
  z.object({ expectedEnvironment: z.literal('production'), action: z.literal('read'), siteId: z.uuid() }).strict()
])
export const ManagedTransferDestinationAuthoringManagementResultSchema = managementResultSchema(Value, ManagementStatusErrorSchema)
