import { ofetch } from 'ofetch'

const GTM_API_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2'

export const GTM_OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish',
] as const

export interface GtmAccount {
  path: string
  accountId: string
  name: string
  shareData?: boolean
  fingerprint?: string
  tagManagerUrl?: string
}

export interface GtmContainer {
  path: string
  accountId: string
  containerId: string
  name: string
  publicId: string
  domainName?: string[]
  tagIds?: string[]
  usageContext?: string[]
  fingerprint?: string
  tagManagerUrl?: string
  features?: Record<string, boolean>
}

export interface GtmParameter {
  type: 'template' | 'boolean' | 'integer' | 'list' | 'map'
  key?: string
  value?: string
  list?: GtmParameter[]
  map?: GtmParameter[]
}

export interface GtmTag {
  path?: string
  accountId?: string
  containerId?: string
  workspaceId?: string
  tagId?: string
  name: string
  type: string
  parameter?: GtmParameter[]
  firingTriggerId?: string[]
  blockingTriggerId?: string[]
  notes?: string
  fingerprint?: string
}

export interface GtmTrigger {
  path?: string
  accountId?: string
  containerId?: string
  workspaceId?: string
  triggerId?: string
  name: string
  type: string
  filter?: unknown[]
  customEventFilter?: unknown[]
  notes?: string
  fingerprint?: string
}

export interface GtmWorkspace {
  path: string
  accountId: string
  containerId: string
  workspaceId: string
  name: string
  description?: string
  fingerprint?: string
  tagManagerUrl?: string
}

export interface GtmContainerVersion {
  path: string
  accountId: string
  containerId: string
  containerVersionId: string
  name?: string
  description?: string
  fingerprint?: string
  tag?: GtmTag[]
  trigger?: GtmTrigger[]
  variable?: unknown[]
  builtInVariable?: unknown[]
}

export interface GtmWorkspaceStatus {
  workspaceChange?: unknown[]
  mergeConflict?: unknown[]
}

export interface GtmQuickPreviewResponse {
  containerVersion?: GtmContainerVersion
  syncStatus?: { mergeConflict?: boolean, syncError?: boolean }
  compilerError?: boolean
}

export interface GtmCreateVersionResponse extends GtmQuickPreviewResponse {
  newWorkspacePath?: string
}

export interface GtmPublishResponse {
  containerVersion?: GtmContainerVersion
  compilerError?: boolean
}

function assertPath(value: string, pattern: RegExp, label: string): string {
  const path = String(value || '').trim().replace(/^\/+|\/+$/g, '')
  if (!pattern.test(path)) throw new Error(`Invalid GTM ${label} path`)
  return path
}

export function assertGtmAccountPath(path: string): string {
  return assertPath(path, /^accounts\/\d+$/, 'account')
}

export function assertGtmContainerPath(path: string): string {
  return assertPath(path, /^accounts\/\d+\/containers\/\d+$/, 'container')
}

export function assertGtmWorkspacePath(path: string): string {
  return assertPath(path, /^accounts\/\d+\/containers\/\d+\/workspaces\/\d+$/, 'workspace')
}

export function assertGtmVersionPath(path: string): string {
  return assertPath(path, /^accounts\/\d+\/containers\/\d+\/versions\/\d+$/, 'version')
}

async function gtmFetch<T>(path: string, token: string, options: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: Record<string, any>
  query?: Record<string, string | undefined>
} = {}): Promise<T> {
  try {
    return await ofetch<T>(`${GTM_API_BASE}/${path.replace(/^\/+/, '')}`, {
      method: options.method || 'GET',
      body: options.body,
      query: options.query,
      timeout: 30_000,
      retry: 0,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || error?.data?.error?.code || 0)
    const googleMessage = String(error?.data?.error?.message || error?.message || 'Google Tag Manager request failed')
    const code = status === 401
      ? 'gtm_token_invalid'
      : status === 403
        ? (googleMessage.toLowerCase().includes('quota') ? 'gtm_quota_exceeded' : 'gtm_permission_denied')
        : status === 404
          ? 'gtm_resource_not_found'
          : status === 409 || status === 412
            ? 'gtm_conflict'
            : 'gtm_api_error'
    const safe = new Error(googleMessage.slice(0, 600)) as Error & { code?: string, statusCode?: number }
    safe.code = code
    safe.statusCode = status || 502
    throw safe
  }
}

async function listAll<T>(
  token: string,
  path: string,
  arrayKey: string,
  reserveEachPage = false,
): Promise<T[]> {
  const rows: T[] = []
  let pageToken: string | undefined
  let pages = 0
  do {
    if (pages >= 5) throw new Error('GTM inventory exceeds bounded page limit')
    if (reserveEachPage) { const { reserveGtmApiQuota } = await import('~~/server/utils/googleTagManagerStore'); await reserveGtmApiQuota(1) }
    const response = await gtmFetch<Record<string, unknown>>(path, token, {
      query: pageToken ? { pageToken } : undefined,
    })
    const pageRows = response[arrayKey]
    if (Array.isArray(pageRows)) rows.push(...pageRows as T[])
    if (++pages > 5 || rows.length > 500) throw new Error('GTM inventory exceeds bounded limit')
    pageToken = typeof response.nextPageToken === 'string' && response.nextPageToken
      ? response.nextPageToken
      : undefined
  } while (pageToken)
  return rows
}

export function listGtmAccounts(token: string): Promise<GtmAccount[]> {
  return listAll<GtmAccount>(token, 'accounts', 'account')
}

export function listGtmContainers(token: string, accountPath: string): Promise<GtmContainer[]> {
  return listAll<GtmContainer>(token, `${assertGtmAccountPath(accountPath)}/containers`, 'container')
}

export function listGtmWorkspaces(token: string, containerPath: string): Promise<GtmWorkspace[]> {
  return listAll<GtmWorkspace>(token, `${assertGtmContainerPath(containerPath)}/workspaces`, 'workspace')
}

export function createGtmWorkspace(
  token: string,
  containerPath: string,
  body: { name: string, description?: string },
): Promise<GtmWorkspace> {
  return gtmFetch<GtmWorkspace>(`${assertGtmContainerPath(containerPath)}/workspaces`, token, {
    method: 'POST',
    body,
  })
}

export function createGtmTrigger(
  token: string,
  workspacePath: string,
  body: GtmTrigger,
): Promise<GtmTrigger> {
  return gtmFetch<GtmTrigger>(`${assertGtmWorkspacePath(workspacePath)}/triggers`, token, {
    method: 'POST',
    body,
  })
}

export function createGtmTag(
  token: string,
  workspacePath: string,
  body: GtmTag,
): Promise<GtmTag> {
  return gtmFetch<GtmTag>(`${assertGtmWorkspacePath(workspacePath)}/tags`, token, {
    method: 'POST',
    body,
  })
}

export function getGtmWorkspaceStatus(token: string, workspacePath: string): Promise<GtmWorkspaceStatus> {
  return gtmFetch<GtmWorkspaceStatus>(`${assertGtmWorkspacePath(workspacePath)}/status`, token)
}

export function quickPreviewGtmWorkspace(token: string, workspacePath: string): Promise<GtmQuickPreviewResponse> {
  return gtmFetch<GtmQuickPreviewResponse>(`${assertGtmWorkspacePath(workspacePath)}:quick_preview`, token, {
    method: 'POST',
  })
}

export function syncGtmWorkspace(token: string, workspacePath: string): Promise<{
  syncStatus?: { mergeConflict?: boolean, syncError?: boolean }
  mergeConflict?: unknown[]
}> {
  return gtmFetch(`${assertGtmWorkspacePath(workspacePath)}:sync`, token, { method: 'POST' })
}

export function createGtmVersion(
  token: string,
  workspacePath: string,
  body: { name: string, notes?: string },
): Promise<GtmCreateVersionResponse> {
  return gtmFetch<GtmCreateVersionResponse>(`${assertGtmWorkspacePath(workspacePath)}:create_version`, token, {
    method: 'POST',
    body,
  })
}

export function publishGtmVersion(
  token: string,
  versionPath: string,
  fingerprint?: string,
): Promise<GtmPublishResponse> {
  return gtmFetch<GtmPublishResponse>(`${assertGtmVersionPath(versionPath)}:publish`, token, {
    method: 'POST',
    query: fingerprint ? { fingerprint } : undefined,
  })
}

export function getLiveGtmVersion(token: string, containerPath: string): Promise<GtmContainerVersion> {
  return gtmFetch<GtmContainerVersion>(`${assertGtmContainerPath(containerPath)}/versions:live`, token)
}

export function buildXeroFlowGtmEntities(input: {
  siteId: string
  siteName: string
  snippet: string
}): { marker: string, trigger: GtmTrigger, tag: GtmTag } {
  const marker = `xeroflow:tracking-site:${input.siteId}:v1`
  const triggerName = `XeroFlow - Window Loaded - All Pages - ${input.siteName}`.slice(0, 200)
  return {
    marker,
    trigger: {
      name: triggerName,
      type: 'windowLoaded',
      notes: marker,
    },
    tag: {
      name: `XeroFlow First-Party Tracking - ${input.siteName}`.slice(0, 200),
      type: 'html',
      notes: marker,
      parameter: [
        { type: 'template', key: 'html', value: input.snippet },
        { type: 'boolean', key: 'supportDocumentWrite', value: 'false' },
      ],
    },
  }
}

export function versionHasXeroFlowTag(
  version: GtmContainerVersion | null | undefined,
  marker: string,
  writeKey?: string,
): boolean {
  return (version?.tag || []).some((tag) => {
    if (tag.notes === marker) return true
    if (!writeKey) return false
    return (tag.parameter || []).some(parameter => parameter.value?.includes(writeKey))
  })
}

export type GtmEntityKind = 'tags'|'triggers'|'variables'|'folders'
export type GtmEntity = Record<string, any> & {path?:string,fingerprint?:string}
export function assertGtmEntityPath(path:string,kind:GtmEntityKind):string {
 if(!['tags','triggers','variables','folders'].includes(kind)) throw new Error('Invalid GTM entity kind')
 return assertPath(path,new RegExp(`^accounts/\\d+/containers/\\d+/workspaces/\\d+/${kind}/\\d+$`),'entity')
}
/** Every page reserves quota; truncation fails closed so review never hides an omitted entity. */
export async function listGtmEntities(token:string,workspace:string,kind:GtmEntityKind):Promise<GtmEntity[]> {
 const parent=assertGtmWorkspacePath(workspace)
 assertGtmEntityPath(`${parent}/${kind}/1`,kind)
 const {reserveGtmApiQuota}=await import('~~/server/utils/googleTagManagerStore')
 const rows:GtmEntity[]=[];let pageToken:string|undefined
 for(let page=0;page<5;page++) {
  await reserveGtmApiQuota(1)
  const result=await gtmFetch<any>(`${parent}/${kind}`,token,{query:pageToken?{pageToken}:undefined})
  rows.push(...(result[kind.slice(0,-1)]??[]))
  if(rows.length>500) throw new Error('GTM inventory exceeds bounded review limit')
  pageToken=result.nextPageToken
  if(!pageToken) return rows
 }
 throw new Error('GTM inventory exceeds bounded page limit')
}
export function getGtmEntity(token:string,path:string,kind:GtmEntityKind):Promise<GtmEntity> {
 return gtmFetch(assertGtmEntityPath(path,kind),token)
}
export function writeGtmEntity(token:string,workspace:string,kind:GtmEntityKind,body:Record<string,any>,update?:{path:string,fingerprint:string}):Promise<GtmEntity> {
 const parent=assertGtmWorkspacePath(workspace)
 assertGtmEntityPath(`${parent}/${kind}/1`,kind)
 if(update&&(!update.path.startsWith(`${parent}/${kind}/`)||!update.fingerprint)) throw new Error('Exact workspace and fingerprint required')
 return gtmFetch(update?assertGtmEntityPath(update.path,kind):`${parent}/${kind}`,token,{method:update?'PUT':'POST',body,query:update?{fingerprint:update.fingerprint}:undefined})
}
export function getGtmVersion(token:string,path:string):Promise<GtmContainerVersion> {
 return gtmFetch(assertGtmVersionPath(path),token)
}

export function getGtmContainer(token:string,path:string):Promise<GtmContainer> {
 return gtmFetch(assertGtmContainerPath(path),token)
}

export function listBoundedGtmWorkspaces(token:string,containerPath:string):Promise<GtmWorkspace[]> {
 return listAll<GtmWorkspace>(token,`${assertGtmContainerPath(containerPath)}/workspaces`,'workspace',true)
}
