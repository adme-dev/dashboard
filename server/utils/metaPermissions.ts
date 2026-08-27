import { ofetch } from 'ofetch'
import { normalizeMetaGraphPageUrl } from '~~/server/utils/metaGraphUrl'

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'

export type MetaOAuthIntent = 'baseline' | 'catalog'

export const META_BASELINE_OAUTH_SCOPES = [
  'ads_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_ads',
  'pages_manage_metadata',
  'leads_retrieval',
  'business_management',
] as const

export const META_CATALOG_OAUTH_SCOPES = ['catalog_management'] as const

type MetaPermissionRow = {
  permission?: string
  status?: string
}

type MetaPermissionsResponse = {
  data?: MetaPermissionRow[]
  paging?: { next?: string }
}

type MetaPermissionsFetch = <T>(url: string, options?: Record<string, unknown>) => Promise<T>

export function getMetaOAuthScopes(intent: MetaOAuthIntent = 'baseline'): string[] {
  return intent === 'catalog'
    ? [...META_BASELINE_OAUTH_SCOPES, ...META_CATALOG_OAUTH_SCOPES]
    : [...META_BASELINE_OAUTH_SCOPES]
}

export function normalizeMetaOAuthIntent(value: unknown): MetaOAuthIntent {
  return value === 'catalog' ? 'catalog' : 'baseline'
}

export function normalizeGrantedMetaPermissions(rows: MetaPermissionRow[]): string[] {
  return [...new Set(rows
    .filter(row => row.status === 'granted' && typeof row.permission === 'string')
    .map(row => row.permission!.trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
}

export async function getGrantedMetaPermissions(
  token: string,
  fetchImpl: MetaPermissionsFetch = ofetch as MetaPermissionsFetch,
): Promise<string[]> {
  const rows: MetaPermissionRow[] = []
  let url: string | undefined = `${META_GRAPH_BASE}/me/permissions`
  const visitedUrls = new Set<string>()
  let options: Record<string, unknown> | undefined = {
    headers: { Authorization: `Bearer ${token}` },
    query: { limit: 100 },
  }

  while (url) {
    if (visitedUrls.has(url) || visitedUrls.size >= 100) {
      throw new Error('Meta returned an invalid permissions pagination sequence.')
    }
    visitedUrls.add(url)
    const response: MetaPermissionsResponse = await fetchImpl<MetaPermissionsResponse>(url, options)
    rows.push(...(response.data || []))
    url = response.paging?.next ? normalizeMetaGraphPageUrl(response.paging.next) : undefined
    options = { headers: { Authorization: `Bearer ${token}` } }
  }

  return normalizeGrantedMetaPermissions(rows)
}
