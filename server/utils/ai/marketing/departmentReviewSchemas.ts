import { z } from 'zod'

const uuid = z.string().uuid()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const list = z.strictObject({ clientId: uuid.optional() })
const ads = z.strictObject({ actionPlanId: uuid, expectedRequestHash: hash })
const gtm = z.strictObject({ proposalId: uuid, expectedHash: hash })
const social = z.strictObject({ postId: uuid, revisionId: uuid, expectedContentHash: hash })
const decision = { decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(1000).optional() }

/** Closed, typed adapters only: no endpoint, arbitrary operation or generic confirmation input. */
export const departmentReviewContracts = {
  marketing_list_google_ads_reviews: { mutates: false, schema: list },
  marketing_get_google_ads_review: { mutates: false, schema: z.strictObject({ actionPlanId: uuid }) },
  marketing_review_google_ads_plan: { mutates: true, schema: ads.extend(decision) },
  marketing_execute_google_ads_plan: { mutates: true, schema: ads },
  marketing_list_gtm_reviews: { mutates: false, schema: list },
  marketing_get_gtm_review: { mutates: false, schema: z.strictObject({ proposalId: uuid }) },
  marketing_review_gtm_proposal: { mutates: true, schema: gtm.extend(decision) },
  marketing_execute_gtm_proposal: { mutates: true, schema: gtm },
  marketing_list_social_reviews: { mutates: false, schema: list },
  marketing_get_social_review: { mutates: false, schema: z.strictObject({ postId: uuid }) },
  marketing_review_social_revision: { mutates: true, schema: social.extend(decision) },
  marketing_execute_social_revision: { mutates: true, schema: social }
} as const
export type DepartmentReviewToolName = keyof typeof departmentReviewContracts
