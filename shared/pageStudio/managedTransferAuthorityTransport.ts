// Worker-only finite transport catalogue. No authority is granted by parsing.
import { z } from 'zod'
import { collectionCanonical } from './collectionApi'
import { ManagedTransferExecutionReferenceSchema as Reference, ManagedTransferExecutionContextSchema as Context, ManagedTransferExecutionRequestSchema as Execution } from './managed-transfer-execution'
import { ManagedTransferSourceDraftsAuthorizationSchema as SourceDrafts } from './managed-transfer-source-drafts'
import { ManagedTransferDestinationCatalogueAuthorizationSchema as Catalogue } from './managed-transfer-destination-catalogue'
import { ManagedTransferDestinationExecutionAuthorizationSchema as Destination } from './managed-transfer-destination-execution'
import { ManagedTransferCopyAuthorizationSchema as Copy } from './managed-transfer-copy-authorization'
import { ManagedTransferFormsHistoryAuthorizationSchema as Forms } from './managed-transfer-forms-history'
import { ManagedTransferDestinationAuthoringAuthorizationSchema as Authoring } from './managed-transfer-destination-authoring'
import { ManagedTransferSourceRetentionAuthorizationSchema as Retention } from './managed-transfer-source-retention'

export const TRANSFER_AUTHORITY_ORIGIN = 'https://page-studio-management.internal'
export const TRANSFER_AUTHORITY_ERROR = 'Managed transfer authority unavailable'
const entry = (schema: z.ZodType, maximum: number, result = schema) => ({ schema, result, maximum })
// Large proof families retain their original canonical wrapper caps; the other
// bounded schema trees fit below 1MiB. No mutation/coordinator action is mapped.
export const TRANSFER_AUTHORITIES = {
  'execution/context': entry(Reference, 16384, Context),
  'execution/authorize': entry(Execution, 1048576),
  'source-drafts/authorize': entry(SourceDrafts, 65536),
  'destination-catalogue/authorize': entry(Catalogue, 1048576),
  'destination-execution/authorize': entry(Destination, 1048576),
  'copy-graph/authorize': entry(Copy, 16384),
  'forms-history/authorize': entry(Forms, 1048576),
  'destination-authoring/authorize': entry(Authoring, 300000),
  'source-retention/authorize': entry(Retention, 65536)
} as const
export type TransferAuthority = keyof typeof TRANSFER_AUTHORITIES
export const transferAuthorityPath = (key: TransferAuthority) => `/internal/page-studio/managed-transfers/${key}`
export function transferAuthorityKey(path: string): TransferAuthority | undefined {
  return (Object.keys(TRANSFER_AUTHORITIES) as TransferAuthority[]).find(key => transferAuthorityPath(key) === path)
}
export const transferAuthorityWire = (key: TransferAuthority) => z.object({ expectedEnvironment: z.literal('production'), input: TRANSFER_AUTHORITIES[key].schema }).strict()
export function matchingTransferAuthorityResult(key: TransferAuthority, input: unknown, value: unknown) {
  const parsed = TRANSFER_AUTHORITIES[key].result.parse(value)
  if (key === 'execution/context') {
    const reference = Reference.parse(input), context = Context.parse(parsed)
    if (context.operationId !== reference.operationId || context.intentDigest !== reference.intentDigest) throw new Error(TRANSFER_AUTHORITY_ERROR)
  } else if (collectionCanonical(parsed) !== collectionCanonical(input)) throw new Error(TRANSFER_AUTHORITY_ERROR)
  return parsed
}
