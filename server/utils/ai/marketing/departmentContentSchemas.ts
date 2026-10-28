// Dependency-free (zod + the zod-only Search Authority contracts): safe for policy/projection imports.
import { z } from 'zod'
import { contentAssetInputSchema, contentVersionInputSchema } from '~~/server/utils/searchAuthority/contentContracts'

export const DEPARTMENT_CONTENT_READ_NAMES = ['marketing_list_content_assets', 'marketing_get_content_asset'] as const
export const DEPARTMENT_CONTENT_WRITE_NAMES = [
  'marketing_create_content_asset', 'marketing_create_content_version', 'marketing_submit_content_version',
  'marketing_review_content_version', 'marketing_publish_content_version'
] as const
export type DepartmentContentToolName = typeof DEPARTMENT_CONTENT_READ_NAMES[number] | typeof DEPARTMENT_CONTENT_WRITE_NAMES[number]

const uuid = z.string().uuid()
const contentHash = z.string().regex(/^[0-9a-f]{64}$/, 'Use the contentHash returned by marketing_get_content_asset')
const exactVersion = { clientId: uuid, assetId: uuid, versionId: uuid, expectedContentHash: contentHash }

export const departmentContentContracts = {
  marketing_list_content_assets: z.strictObject({
    clientId: uuid,
    status: z.enum(['draft', 'in_review', 'approved', 'rejected', 'published', 'archived']).optional(),
    afterId: uuid.optional(),
    limit: z.number().int().min(1).max(100).default(50)
  }),
  marketing_get_content_asset: z.strictObject({ clientId: uuid, assetId: uuid }),
  marketing_create_content_asset: contentAssetInputSchema.extend({
    clientId: uuid,
    siteId: uuid,
    acknowledgement: z.literal('RECORD_PROVIDED_SOURCE_INTERVIEW')
  }).strict(),
  marketing_create_content_version: contentVersionInputSchema.extend({
    clientId: uuid,
    assetId: uuid,
    /** Current version you read (null when the asset has none yet); a changed asset is rejected. */
    expectedCurrentVersionId: uuid.nullable(),
    acknowledgement: z.literal('CREATE_CONTENT_DRAFT_VERSION')
  }).strict(),
  marketing_submit_content_version: z.strictObject({ ...exactVersion, acknowledgement: z.literal('SUBMIT_CONTENT_FOR_REVIEW') }),
  marketing_review_content_version: z.strictObject({
    ...exactVersion,
    decision: z.enum(['approve', 'reject']),
    rationale: z.string().trim().min(5).max(2000),
    acknowledgement: z.literal('RECORD_INDEPENDENT_CONTENT_DECISION')
  }),
  marketing_publish_content_version: z.strictObject({ ...exactVersion, acknowledgement: z.literal('PUBLISH_APPROVED_CONTENT') })
} satisfies Record<DepartmentContentToolName, z.ZodTypeAny>
