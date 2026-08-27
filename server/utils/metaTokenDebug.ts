import { ofetch } from 'ofetch'

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'

type MetaFetch = <T>(url: string, options?: Record<string, unknown>) => Promise<T>

export interface MetaGranularScope {
  scope: string
  target_ids?: string[]
}

export interface MetaTokenDebugData {
  app_id?: string
  is_valid?: boolean
  scopes?: string[]
  granular_scopes?: MetaGranularScope[]
  type?: string
  user_id?: string
  expires_at?: number
  data_access_expires_at?: number
}

export async function debugMetaAccessToken(
  token: string,
  appId: string,
  appSecret: string,
  fetchImpl: MetaFetch = ofetch as MetaFetch,
): Promise<MetaTokenDebugData> {
  const response = await fetchImpl<{ data?: MetaTokenDebugData }>(`${META_GRAPH_BASE}/debug_token`, {
    method: 'GET',
    query: {
      input_token: token,
      access_token: `${appId}|${appSecret}`,
    },
  })
  return response.data || {}
}

export function getMetaGranularTargetIds(
  debugData: MetaTokenDebugData,
  scope: string,
): string[] {
  return [...new Set(
    (debugData.granular_scopes || [])
      .filter(entry => entry.scope === scope)
      .flatMap(entry => entry.target_ids || [])
      .map(String)
      .filter(Boolean),
  )]
}
