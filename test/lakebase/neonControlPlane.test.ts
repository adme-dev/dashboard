import { describe, expect, it, vi } from 'vitest'
import {
  enableLakebasePreloads,
  mergePreloadLibraries
} from '../../scripts/lakebase-pilot/neonControlPlane'
import { runLakebaseEnable } from '../../scripts/lakebase-pilot/enable'
import type { LakebasePilotTarget } from '../../scripts/lakebase-pilot/contracts'
import type { LakebaseControlPlaneError } from '../../scripts/lakebase-pilot/neonControlPlane'

const target: LakebasePilotTarget = {
  projectId: 'pilot-green-river-12345678',
  endpointId: 'ep-pilot-green-river-a1b2c3d4',
  databaseUrl: 'postgresql://pilot:secret@ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  databaseHost: 'ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech',
  productionProjectId: 'prod-silent-tree-87654321'
}

const safeEnv = {
  LAKEBASE_PILOT_PROJECT_ID: target.projectId,
  LAKEBASE_PILOT_ENDPOINT_ID: target.endpointId,
  LAKEBASE_PILOT_DATABASE_URL: target.databaseUrl,
  NEON_PRODUCTION_PROJECT_ID: target.productionProjectId,
  DATABASE_URL: 'postgresql://prod:secret@ep-prod-silent-tree-z9y8x7w6.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: '1',
  NEON_API_KEY: 'neon-api-token-that-must-never-be-emitted'
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

type RequestStage = 'project' | 'endpoint' | 'preloads' | 'patch' | 'restart'

interface FakeFetchOptions {
  restartResponse?: Response
  failAt?: {
    stage: RequestStage
    reply: () => Response
  }
}

function successfulFetch({ restartResponse = jsonResponse({ operations: [] }), failAt }: FakeFetchOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || 'GET'
    const stage: RequestStage | null = method === 'GET' && url.endsWith(`/projects/${target.projectId}`)
      ? 'project'
      : method === 'GET' && url.endsWith(`/endpoints/${target.endpointId}`)
        ? 'endpoint'
        : method === 'GET' && url.endsWith('/available_preload_libraries')
          ? 'preloads'
          : method === 'PATCH'
            ? 'patch'
            : method === 'POST' && url.endsWith('/restart')
              ? 'restart'
              : null

    if (stage === failAt?.stage) return failAt.reply()

    if (stage === 'project') {
      return jsonResponse({ project: { id: target.projectId, settings: { preload_libraries: ['custom_existing'] } } })
    }
    if (stage === 'endpoint') {
      return jsonResponse({ endpoint: { id: target.endpointId, project_id: target.projectId, host: `${target.endpointId}-pooler.ap-southeast-2.aws.neon.tech` } })
    }
    if (stage === 'preloads') {
      return jsonResponse({ libraries: [
        { library_name: 'pg_stat_statements', is_default: true },
        { library_name: 'lakebase_text', is_default: false },
        { library_name: 'lakebase_vector', is_default: false }
      ] })
    }
    if (stage === 'patch') return jsonResponse({ project: { id: target.projectId } })
    if (stage === 'restart') return restartResponse
    throw new Error(`Unexpected fake request: ${method} ${url}`)
  })
}

describe('Neon Lakebase preload control plane', () => {
  it('preserves current and comma-packed default libraries while adding the required Lakebase libraries', () => {
    expect(mergePreloadLibraries(
      [
        { library_name: 'pg_stat_statements', is_default: true },
        { library_name: 'lakebase_text', is_default: false },
        { library_name: 'lakebase_vector', is_default: false }
      ],
      ['custom_existing']
    )).toEqual(['custom_existing', 'lakebase_text', 'lakebase_vector', 'pg_stat_statements'])

    expect(mergePreloadLibraries(
      [
        { library_name: 'pg_stat_statements, pg_hint_plan', is_default: true },
        { library_name: 'lakebase_text', is_default: false },
        { library_name: 'lakebase_vector', is_default: false }
      ],
      ['custom_existing, pg_hint_plan']
    )).toEqual(['custom_existing', 'pg_hint_plan', 'lakebase_text', 'lakebase_vector', 'pg_stat_statements'])
  })

  it('verifies the isolated target before changing preloads and never emits credentials', async () => {
    const fetch = successfulFetch()
    const emitted: unknown[] = []

    const result = await runLakebaseEnable(
      { env: safeEnv },
      { fetch, write: value => emitted.push(value) }
    )

    expect(result).toEqual({
      exitCode: 0,
      output: {
        status: 'enabled',
        target: {
          projectId: target.projectId,
          endpointId: target.endpointId,
          databaseHost: target.databaseHost
        },
        preloadLibraries: ['custom_existing', 'lakebase_text', 'lakebase_vector', 'pg_stat_statements'],
        restartDeferred: false
      }
    })
    expect(fetch.mock.calls.map(([url, init]) => ({
      method: init?.method || 'GET',
      path: new URL(String(url)).pathname
    }))).toEqual([
      { method: 'GET', path: `/api/v2/projects/${target.projectId}` },
      { method: 'GET', path: `/api/v2/projects/${target.projectId}/endpoints/${target.endpointId}` },
      { method: 'GET', path: `/api/v2/projects/${target.projectId}/available_preload_libraries` },
      { method: 'PATCH', path: `/api/v2/projects/${target.projectId}` },
      { method: 'POST', path: `/api/v2/projects/${target.projectId}/endpoints/${target.endpointId}/restart` }
    ])
    expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toEqual({
      project: {
        settings: {
          preload_libraries: ['custom_existing', 'lakebase_text', 'lakebase_vector', 'pg_stat_statements']
        }
      }
    })
    expect(JSON.stringify(fetch.mock.calls.map(([url]) => String(url)))).not.toContain(target.productionProjectId)
    expect(JSON.stringify(emitted)).not.toContain(safeEnv.NEON_API_KEY)
  })

  it('defers only the documented inactive endpoint restart response', async () => {
    const result = await enableLakebasePreloads(
      { target, apiKey: safeEnv.NEON_API_KEY },
      { fetch: successfulFetch({ restartResponse: jsonResponse({ message: 'endpoint is not active, could not restart' }, 409) }) }
    )

    expect(result.restartDeferred).toBe(true)
  })

  it('returns a coded failure for an undocumented restart response', async () => {
    const fetch = successfulFetch({ restartResponse: jsonResponse({ message: 'restart is locked' }, 409) })

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code: 'neon_endpoint_restart_failed' } satisfies Partial<LakebaseControlPlaneError>)
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('returns a coded failure when the restart request cannot be completed', async () => {
    const fetch = successfulFetch({
      failAt: {
        stage: 'restart',
        reply: () => {
          throw new Error('connection reset by peer')
        }
      }
    })

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code: 'neon_endpoint_restart_failed' } satisfies Partial<LakebaseControlPlaneError>)
  })

  it.each([
    { stage: 'project', code: 'neon_project_fetch_failed', calls: 1 },
    { stage: 'endpoint', code: 'neon_endpoint_fetch_failed', calls: 2 },
    { stage: 'preloads', code: 'neon_preload_libraries_fetch_failed', calls: 3 },
    { stage: 'patch', code: 'neon_project_update_failed', calls: 4 }
  ] as const)('returns $code when $stage responds with a non-2xx status', async ({ stage, code, calls }) => {
    const fetch = successfulFetch({
      failAt: { stage, reply: () => jsonResponse({ message: 'controlled failure' }, 503) }
    })

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code } satisfies Partial<LakebaseControlPlaneError>)
    expect(fetch).toHaveBeenCalledTimes(calls)
  })

  it.each([
    { stage: 'project', code: 'neon_project_fetch_failed', calls: 1 },
    { stage: 'endpoint', code: 'neon_endpoint_fetch_failed', calls: 2 },
    { stage: 'preloads', code: 'neon_preload_libraries_fetch_failed', calls: 3 },
    { stage: 'patch', code: 'neon_project_update_failed', calls: 4 }
  ] as const)('returns $code when $stage has a transport failure', async ({ stage, code, calls }) => {
    const fetch = successfulFetch({
      failAt: {
        stage,
        reply: () => {
          throw new Error('controlled transport failure')
        }
      }
    })

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code } satisfies Partial<LakebaseControlPlaneError>)
    expect(fetch).toHaveBeenCalledTimes(calls)
  })

  it('fails closed before PATCH when the retrieved project ID does not match the pilot target', async () => {
    const fetch = successfulFetch()
    fetch.mockImplementationOnce(async () => jsonResponse({ project: { id: 'pilot-wrong-project-1234', settings: { preload_libraries: [] } } }))

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code: 'neon_project_target_mismatch' } satisfies Partial<LakebaseControlPlaneError>)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fails closed before PATCH when the retrieved endpoint ID does not match the pilot target', async () => {
    const fetch = successfulFetch()
    fetch.mockImplementationOnce(async () => jsonResponse({ project: { id: target.projectId, settings: { preload_libraries: [] } } }))
    fetch.mockImplementationOnce(async () => jsonResponse({ endpoint: { id: 'ep-wrong-endpoint-a1b2c3d4', project_id: target.projectId, host: target.databaseHost } }))

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code: 'neon_endpoint_target_mismatch' } satisfies Partial<LakebaseControlPlaneError>)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails closed before PATCH when endpoint ownership does not match the target', async () => {
    const fetch = successfulFetch()
    fetch.mockImplementationOnce(async () => jsonResponse({ project: { id: target.projectId, settings: { preload_libraries: [] } } }))
    fetch.mockImplementationOnce(async () => jsonResponse({ endpoint: { id: target.endpointId, project_id: target.productionProjectId, host: target.databaseHost } }))

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code: 'neon_endpoint_target_mismatch' } satisfies Partial<LakebaseControlPlaneError>)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails closed before PATCH when the normalized endpoint host does not match the pilot target', async () => {
    const fetch = successfulFetch()
    fetch.mockImplementationOnce(async () => jsonResponse({ project: { id: target.projectId, settings: { preload_libraries: [] } } }))
    fetch.mockImplementationOnce(async () => jsonResponse({ endpoint: { id: target.endpointId, project_id: target.projectId, host: 'ep-wrong-host-a1b2c3d4-pooler.ap-southeast-2.aws.neon.tech' } }))

    await expect(enableLakebasePreloads({ target, apiKey: safeEnv.NEON_API_KEY }, { fetch }))
      .rejects.toMatchObject({ code: 'neon_endpoint_host_mismatch' } satisfies Partial<LakebaseControlPlaneError>)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not read the API key when mutation target resolution fails', async () => {
    const env = new Proxy(safeEnv, {
      get(object, property, receiver) {
        if (property === 'NEON_API_KEY') throw new Error('API key was read before target validation')
        return Reflect.get(object, property, receiver)
      }
    })
    const resolveTarget = vi.fn(() => {
      throw new Error('target validation failed')
    })
    const fetch = vi.fn()

    const result = await runLakebaseEnable({ env }, { resolveTarget, fetch, write: () => {} })

    expect(result).toEqual({ exitCode: 1, output: { status: 'blocked', code: 'pilot_target_validation_failed' } })
    expect(fetch).not.toHaveBeenCalled()
  })
})
