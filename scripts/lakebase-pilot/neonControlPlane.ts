import type { LakebasePilotTarget } from './contracts'

const NEON_API_ORIGIN = 'https://console.neon.tech'
const REQUIRED_PRELOAD_LIBRARIES = ['lakebase_text', 'lakebase_vector'] as const

export interface NeonPreloadLibrary {
  library_name: string
  is_default: boolean
}

export interface LakebaseEnableInput {
  target: LakebasePilotTarget
  apiKey: string
}

export interface LakebaseEnableDependencies {
  fetch: typeof globalThis.fetch
}

export interface LakebaseEnableResult {
  projectId: string
  endpointId: string
  preloadLibraries: string[]
  restartDeferred: boolean
}

export class LakebaseControlPlaneError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'LakebaseControlPlaneError'
  }
}

function projectPath(projectId: string, suffix = '') {
  return `${NEON_API_ORIGIN}/api/v2/projects/${encodeURIComponent(projectId)}${suffix}`
}

function endpointLabel(host: unknown): string | null {
  if (typeof host !== 'string' || !host.trim()) return null
  const hostname = host.trim().replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0] || ''
  const label = hostname.split('.')[0]?.replace(/-pooler$/, '')
  return label || null
}

function names(value: string): string[] {
  return value.split(',').map(name => name.trim()).filter(Boolean)
}

function uniqueNames(values: string[]): string[] {
  return [...new Set(values)]
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LakebaseControlPlaneError(code)
  return value as Record<string, unknown>
}

function projectSettings(project: Record<string, unknown>): string[] {
  const settings = project.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return []
  const preloadLibraries = (settings as Record<string, unknown>).preload_libraries
  if (!Array.isArray(preloadLibraries) || !preloadLibraries.every(value => typeof value === 'string')) return []
  return preloadLibraries.flatMap(names)
}

function availableLibraries(value: unknown): NeonPreloadLibrary[] {
  const response = asRecord(value, 'neon_preload_libraries_invalid')
  if (!Array.isArray(response.libraries)) throw new LakebaseControlPlaneError('neon_preload_libraries_invalid')
  const libraries = response.libraries.map((library) => {
    const record = asRecord(library, 'neon_preload_libraries_invalid')
    if (typeof record.library_name !== 'string' || typeof record.is_default !== 'boolean') {
      throw new LakebaseControlPlaneError('neon_preload_libraries_invalid')
    }
    return { library_name: record.library_name, is_default: record.is_default }
  })
  const availableNames = new Set(libraries.flatMap(library => names(library.library_name)))
  if (!REQUIRED_PRELOAD_LIBRARIES.every(name => availableNames.has(name))) {
    throw new LakebaseControlPlaneError('neon_lakebase_preloads_unavailable')
  }
  return libraries
}

async function requestJson(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  failureCode: string
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new LakebaseControlPlaneError(failureCode)
  }
  if (!response.ok) throw new LakebaseControlPlaneError(failureCode)
  try {
    return await response.json()
  } catch {
    throw new LakebaseControlPlaneError(failureCode)
  }
}

/**
 * Merges current libraries with required Lakebase and Neon-default libraries.
 * Current values retain their order; required libraries always precede defaults.
 */
export function mergePreloadLibraries(available: NeonPreloadLibrary[], current: string[]): string[] {
  const defaults = available
    .filter(library => library.is_default)
    .flatMap(library => names(library.library_name))
  return uniqueNames([
    ...current.flatMap(names),
    ...REQUIRED_PRELOAD_LIBRARIES,
    ...defaults
  ])
}

export async function enableLakebasePreloads(
  input: LakebaseEnableInput,
  deps: LakebaseEnableDependencies
): Promise<LakebaseEnableResult> {
  const { target, apiKey } = input
  const headers = {
    'authorization': `Bearer ${apiKey}`,
    'accept': 'application/json',
    'content-type': 'application/json'
  }
  const projectUrl = projectPath(target.projectId)
  const endpointUrl = projectPath(
    target.projectId,
    `/endpoints/${encodeURIComponent(target.endpointId)}`
  )

  const projectResponse = asRecord(await requestJson(deps.fetch, projectUrl, { headers }, 'neon_project_fetch_failed'), 'neon_project_invalid')
  const project = asRecord(projectResponse.project, 'neon_project_invalid')
  if (project.id !== target.projectId) throw new LakebaseControlPlaneError('neon_project_target_mismatch')

  const endpointResponse = asRecord(await requestJson(deps.fetch, endpointUrl, { headers }, 'neon_endpoint_fetch_failed'), 'neon_endpoint_invalid')
  const endpoint = asRecord(endpointResponse.endpoint, 'neon_endpoint_invalid')
  if (endpoint.id !== target.endpointId || endpoint.project_id !== target.projectId) {
    throw new LakebaseControlPlaneError('neon_endpoint_target_mismatch')
  }
  if (endpointLabel(endpoint.host) !== endpointLabel(target.databaseHost)) {
    throw new LakebaseControlPlaneError('neon_endpoint_host_mismatch')
  }

  const availableResponse = await requestJson(
    deps.fetch,
    projectPath(target.projectId, '/available_preload_libraries'),
    { headers },
    'neon_preload_libraries_fetch_failed'
  )
  const preloadLibraries = mergePreloadLibraries(availableLibraries(availableResponse), projectSettings(project))

  await requestJson(
    deps.fetch,
    projectUrl,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ project: { settings: { preload_libraries: preloadLibraries } } })
    },
    'neon_project_update_failed'
  )

  let restartResponse: Response
  try {
    restartResponse = await deps.fetch(projectPath(
      target.projectId,
      `/endpoints/${encodeURIComponent(target.endpointId)}/restart`
    ), { method: 'POST', headers })
  } catch {
    throw new LakebaseControlPlaneError('neon_endpoint_restart_failed')
  }
  if (restartResponse.ok) {
    return { projectId: target.projectId, endpointId: target.endpointId, preloadLibraries, restartDeferred: false }
  }
  let restartBody = ''
  try {
    restartBody = await restartResponse.text()
  } catch {
    // A coded failure below deliberately avoids surfacing a response body.
  }
  if (restartBody.includes('endpoint is not active, could not restart')) {
    return { projectId: target.projectId, endpointId: target.endpointId, preloadLibraries, restartDeferred: true }
  }
  throw new LakebaseControlPlaneError('neon_endpoint_restart_failed')
}
