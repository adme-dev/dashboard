import { getAdAccounts, type MetaAdAccount } from '~~/server/utils/metaClient'
import {
  getMetaBusiness,
  listMetaBusinesses,
  listMetaProductCatalogs,
  type MetaBusiness,
} from '~~/server/utils/metaCatalogClient'
import {
  getGrantedMetaPermissions,
  type MetaOAuthIntent,
} from '~~/server/utils/metaPermissions'

type MetaPermissionEvidenceDependencies = {
  getReportedPermissions: (token: string) => Promise<string[]>
  getAdAccounts: (token: string) => Promise<MetaAdAccount[]>
  listBusinesses: (token: string) => Promise<MetaBusiness[]>
  getBusiness: (businessId: string, token: string) => Promise<MetaBusiness>
  businessTargetIds: string[]
  listCatalogs: (businessId: string, token: string) => Promise<unknown[]>
}

export type EffectiveMetaPermissionEvidence = {
  scopes: string[]
  adAccounts: MetaAdAccount[]
  businesses: MetaBusiness[]
  evidence: {
    permissionsEndpoint: boolean
    adsManagement: boolean
    businessManagement: boolean
    catalogManagement: boolean
  }
}

const defaultDependencies: MetaPermissionEvidenceDependencies = {
  getReportedPermissions: getGrantedMetaPermissions,
  getAdAccounts,
  listBusinesses: listMetaBusinesses,
  getBusiness: getMetaBusiness,
  businessTargetIds: [],
  listCatalogs: listMetaProductCatalogs,
}

/**
 * Resolve effective Meta grants from both /me/permissions and protected API
 * calls. Facebook Login for Business tokens can return an empty permissions
 * collection even after asset-scoped consent; a successful protected call is
 * stronger evidence than copying the scopes requested by our own OAuth URL.
 */
export async function getEffectiveMetaPermissionEvidence(
  token: string,
  intent: MetaOAuthIntent = 'baseline',
  dependencies: Partial<MetaPermissionEvidenceDependencies> = {},
): Promise<EffectiveMetaPermissionEvidence> {
  const deps = { ...defaultDependencies, ...dependencies }
  const scopes = new Set<string>()
  let permissionsEndpoint = false
  let adsManagement = false
  let businessManagement = false
  let catalogManagement = false
  let adAccounts: MetaAdAccount[] = []
  let businesses: MetaBusiness[] = []

  try {
    const reported = await deps.getReportedPermissions(token)
    reported.forEach(scope => scopes.add(scope))
    permissionsEndpoint = true
  } catch {
    // Capability checks below remain authoritative when this legacy endpoint
    // is unavailable for a Facebook Login for Business token.
  }

  try {
    adAccounts = await deps.getAdAccounts(token)
    scopes.add('ads_management')
    adsManagement = true
  } catch {
    // The caller validates required capabilities after all probes complete.
  }

  try {
    businesses = await deps.listBusinesses(token)
    scopes.add('business_management')
    businessManagement = true
  } catch {
    // The caller validates required capabilities after all probes complete.
  }

  if (businesses.length === 0 && deps.businessTargetIds.length > 0) {
    const targetedBusinesses = await Promise.all(
      deps.businessTargetIds.map(async businessId => {
        try {
          return await deps.getBusiness(businessId, token)
        } catch {
          return null
        }
      }),
    )
    businesses = targetedBusinesses.filter((business): business is MetaBusiness => Boolean(business))
    if (businesses.length > 0) {
      scopes.add('business_management')
      businessManagement = true
    }
  }

  if (intent === 'catalog' && businesses.length > 0) {
    for (const business of businesses) {
      try {
        await deps.listCatalogs(business.id, token)
        scopes.add('catalog_management')
        catalogManagement = true
        break
      } catch {
        // Asset-scoped access can vary by Business, so try every selected one.
      }
    }
  }

  return {
    scopes: [...scopes].sort((left, right) => left.localeCompare(right)),
    adAccounts,
    businesses,
    evidence: {
      permissionsEndpoint,
      adsManagement,
      businessManagement,
      catalogManagement,
    },
  }
}
