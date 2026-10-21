import { z } from 'zod'
import { managementResultSchema, ManagementStatusErrorSchema } from './managementResult'

const Value = z.unknown().refine(value => value !== undefined)
export const ManagedTransferSourceRetentionManagementRequestSchema = z.object({ expectedEnvironment: z.literal('production'), authorization: Value }).strict()
export const ManagedTransferSourceRetentionManagementResultSchema = managementResultSchema(Value, ManagementStatusErrorSchema)
