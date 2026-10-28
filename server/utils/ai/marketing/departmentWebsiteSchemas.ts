// Dependency-free (zod + the zod-only shared Page Studio document contract): safe for policy/projection imports.
import { z } from 'zod'
import { PageStudioDocumentSchema } from '~~/shared/pageStudio/document'

export const DEPARTMENT_WEBSITE_READ_NAMES = ['marketing_list_websites', 'marketing_get_website', 'marketing_get_website_draft'] as const
export const DEPARTMENT_WEBSITE_WRITE_NAMES = [
  'marketing_save_website_draft', 'marketing_submit_website_version', 'marketing_review_website_version',
  'marketing_build_website_candidate', 'marketing_publish_website_version'
] as const
export type DepartmentWebsiteToolName = typeof DEPARTMENT_WEBSITE_READ_NAMES[number] | typeof DEPARTMENT_WEBSITE_WRITE_NAMES[number]

/** The explicit native Page Studio grant each operation needs, in addition to marketing authority. */
export const DEPARTMENT_WEBSITE_GRANTS: Record<DepartmentWebsiteToolName, 'PAGE_STUDIO_VIEW' | 'PAGE_STUDIO_EDIT' | 'PAGE_STUDIO_APPROVE' | 'PAGE_STUDIO_PUBLISH'> = {
  marketing_list_websites: 'PAGE_STUDIO_VIEW',
  marketing_get_website: 'PAGE_STUDIO_VIEW',
  marketing_get_website_draft: 'PAGE_STUDIO_EDIT',
  marketing_save_website_draft: 'PAGE_STUDIO_EDIT',
  marketing_submit_website_version: 'PAGE_STUDIO_EDIT',
  marketing_review_website_version: 'PAGE_STUDIO_APPROVE',
  marketing_build_website_candidate: 'PAGE_STUDIO_PUBLISH',
  marketing_publish_website_version: 'PAGE_STUDIO_PUBLISH'
}

/** Operations that need the original agency login proven at OAuth consent (native Studio authority). */
export const DEPARTMENT_WEBSITE_LOGIN_BOUND_NAMES = ['marketing_submit_website_version', 'marketing_build_website_candidate', 'marketing_publish_website_version'] as const

const uuid = z.string().uuid()
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const checkpointId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
const environment = z.enum(['staging', 'production'])

export const departmentWebsiteContracts = {
  marketing_list_websites: z.strictObject({ clientId: uuid }),
  marketing_get_website: z.strictObject({ clientId: uuid, siteId: uuid }),
  marketing_get_website_draft: z.strictObject({ clientId: uuid, siteId: uuid }),
  marketing_save_website_draft: z.strictObject({
    clientId: uuid,
    siteId: uuid,
    /** Draft revision you read; a concurrent save is rejected. */
    expectedRevision: z.number().int().min(0),
    document: PageStudioDocumentSchema,
    acknowledgement: z.literal('SAVE_WEBSITE_DRAFT')
  }),
  marketing_submit_website_version: z.strictObject({
    clientId: uuid,
    siteId: uuid,
    /** Current saved Studio draft you reviewed (currentCheckpointId from marketing_get_website). */
    expectedCheckpointId: checkpointId,
    name: z.string().trim().min(1).max(120),
    acknowledgement: z.literal('SUBMIT_WEBSITE_FOR_REVIEW')
  }),
  marketing_review_website_version: z.strictObject({
    clientId: uuid,
    siteId: uuid,
    versionId: uuid,
    decision: z.enum(['approved', 'rejected', 'returned_to_draft']),
    comment: z.string().trim().min(5).max(4000),
    /** Exact version source and live production release you compared (from marketing_get_website). */
    expectedComparison: z.strictObject({
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      checkpointId: z.string().min(1).max(128),
      releaseId: uuid.nullable(),
      hostname: z.string().min(1).max(253).nullable()
    }).refine(value => (value.releaseId === null) === (value.hostname === null), 'releaseId and hostname are both null or both set'),
    acknowledgement: z.literal('RECORD_INDEPENDENT_WEBSITE_DECISION')
  }),
  marketing_build_website_candidate: z.strictObject({
    clientId: uuid,
    siteId: uuid,
    versionId: uuid,
    expectedVersionDigest: digest,
    environment,
    acknowledgement: z.literal('BUILD_APPROVED_WEBSITE_CANDIDATE')
  }),
  marketing_publish_website_version: z.strictObject({
    clientId: uuid,
    siteId: uuid,
    versionId: uuid,
    expectedVersionDigest: digest,
    /** Reviewed build from marketing_build_website_candidate for this exact version and environment. */
    buildId: checkpointId,
    environment,
    hostname: z.string().trim().toLowerCase().min(1).max(253),
    /** Live release you compared; null only when the hostname has never been published. */
    expectedActiveReleaseId: uuid.nullable(),
    acknowledgement: z.literal('PUBLISH_APPROVED_WEBSITE')
  })
} satisfies Record<DepartmentWebsiteToolName, z.ZodTypeAny>
