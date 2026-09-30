import type { ContentAuthorityRequest } from './businessContent'
import type { PageStudioControlQueryClient } from './controlStore'
import { withCmsCommitAuthority } from './cmsCommitAuthority'
import { ImageCreditError } from './imageCredits'
import { withImageGenerationAuthority, type ImageGenerationContext } from './imageGenerationAuthority'

/** Billing is a native client-admin capability, independently of site editing or
 * model allowance. Reuse the site→login/entitlement/membership lock order, with
 * billing-specific role admission and final wall-clock revalidation. */
export function withImageBillingAuthority<T>(
  request: ContentAuthorityRequest,
  work: (db: PageStudioControlQueryClient, context: ImageGenerationContext) => Promise<T>,
  dependencies: Parameters<typeof withImageGenerationAuthority>[3] = {}
) {
  return withImageGenerationAuthority(request, false, async (db, context) => {
    if (!context.canPurchase) throw new ImageCreditError('IMAGE_BILLING_DENIED', 403, 'Only your billing owner can add image credits')
    return withCmsCommitAuthority({ scope: context.scope, principal: { source: 'native-login', request }, mutation: 'image-billing' },
      () => work(db, context), { runTransaction: callback => callback(db) })
  }, dependencies)
}
