import { z } from 'zod'
import { PageStudioBusinessContentError } from './businessContent'
import { cmsEqual } from './cmsVisibility'
import type { PageStudioPublishingScope } from './publishing'
import type { RuntimeRenderer } from './runtimeReleases'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const admissionsSchema = z.array(z.object({
  scope: z.object({ tenantId: z.string().min(1).max(200), clientId: z.uuid(), siteId: z.uuid() }).strict(),
  environment: z.enum(['staging', 'production']),
  renderer: z.object({ name: z.literal('astro-runtime'), generation: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), codeDigest: digest, assetsDigest: digest }).strict()
}).strict()).max(100)

/** Operator-owned admission follows verified renderer deployment and scoped
 * acceptance. Missing configuration never enables customer CMS publication.
 * Retained generations require their own exact entry when used for rollback. */
export function assertRuntimeFeatureAdmission(input: { scope: PageStudioPublishingScope, environment: 'staging' | 'production', renderer: RuntimeRenderer }, env: Record<string, unknown> | undefined) {
  let raw: unknown
  try {
    raw = typeof env?.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS === 'string' ? JSON.parse(env.PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS) : undefined
  } catch { raw = undefined }
  const admissions = admissionsSchema.safeParse(raw)
  if (!admissions.success || !admissions.data.some(entry => entry.environment === input.environment
    && cmsEqual(entry.scope, input.scope) && cmsEqual(entry.renderer, input.renderer))) {
    throw new PageStudioBusinessContentError('RUNTIME_CMS_NOT_ADMITTED', 503, 'CMS publication is not enabled for this website and runtime renderer')
  }
}

/** The checkpoint has already passed the shared verifier. Ordinary native forms
 * remain supported; generated action submissions need a separate runtime lane. */
export function assertRuntimeFeatureForms(manifest: Record<string, unknown>) {
  const pages = manifest.pages as Array<{ forms?: Array<{ submission?: { mode?: string } }> }> | undefined
  if (pages?.some(page => page.forms?.some(form => form.submission?.mode === 'action'))) {
    throw new PageStudioBusinessContentError('RUNTIME_ACTION_FORMS_UNAVAILABLE', 422, 'Generated action forms are not supported by this runtime publication')
  }
}
