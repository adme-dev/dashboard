import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { GraphifyError, loadGraph, loadReport } from '~~/server/utils/graphify'

type RepoRow = {
  id: string
  repo_url: string
  provider: string | null
  default_branch: string | null
  graphify_path: string | null
  graphify_last_synced_at: string | null
  updated_at: string | null
  department_id: string
  department_name: string | null
  department_slug: string | null
}

type GraphifyStatus =
  | 'ready'
  | 'stale'
  | 'missing_path'
  | 'missing_artifact'
  | 'r2_unconfigured'
  | 'error'

const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000
const GRAPHIFY_INSPECTION_CONCURRENCY = 4

function present(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && !value.toLowerCase().includes('your_')
}

function r2Configured() {
  return present(process.env.R2_ACCOUNT_ID)
    && present(process.env.R2_ACCESS_KEY_ID)
    && present(process.env.R2_SECRET_ACCESS_KEY)
    && present(process.env.R2_BUCKET_NAME || 'agency-files')
}

function isStale(value: string | null) {
  if (!value) return true
  const timestamp = new Date(value).getTime()
  return !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS
}

async function inspectRepo(row: RepoRow, canReadR2: boolean) {
  const base = {
    id: row.id,
    repoUrl: row.repo_url,
    provider: row.provider || 'github',
    defaultBranch: row.default_branch || 'main',
    board: {
      id: row.department_id,
      name: row.department_name || 'Untitled board',
      slug: row.department_slug,
    },
    graphifyPath: row.graphify_path,
    graphifyLastSyncedAt: row.graphify_last_synced_at,
    repoUpdatedAt: row.updated_at,
    nodeCount: 0,
    edgeCount: 0,
    hyperedgeCount: 0,
    reportChars: 0,
    status: 'ready' as GraphifyStatus,
    reason: null as string | null,
  }

  if (!row.graphify_path) {
    return {
      ...base,
      status: 'missing_path' as GraphifyStatus,
      reason: 'No graphify_path is configured for this repo.',
    }
  }

  if (!canReadR2) {
    return {
      ...base,
      status: 'r2_unconfigured' as GraphifyStatus,
      reason: 'R2 credentials are not configured in this environment.',
    }
  }

  try {
    const [graph, report] = await Promise.all([
      loadGraph(row.graphify_path),
      loadReport(row.graphify_path).catch((error) => {
        if (error instanceof GraphifyError && error.status === 404) return ''
        throw error
      }),
    ])
    const edges = graph.links ?? graph.edges ?? []
    const hyperedges = graph.graph?.hyperedges ?? []
    const stale = isStale(row.graphify_last_synced_at)

    return {
      ...base,
      nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
      edgeCount: Array.isArray(edges) ? edges.length : 0,
      hyperedgeCount: Array.isArray(hyperedges) ? hyperedges.length : 0,
      reportChars: report.length,
      status: stale ? 'stale' as GraphifyStatus : 'ready' as GraphifyStatus,
      reason: stale ? 'Graphify sync is older than 14 days or has no sync timestamp.' : null,
    }
  } catch (error) {
    if (error instanceof GraphifyError && error.status === 404) {
      return {
        ...base,
        status: 'missing_artifact' as GraphifyStatus,
        reason: 'Graphify graph.json artifact was not found in R2.',
      }
    }

    console.error('[Admin AI Model Ops Graphify] Repo inspection failed:', {
      repoId: row.id,
      graphifyPath: row.graphify_path,
      error,
    })

    return {
      ...base,
      status: 'error' as GraphifyStatus,
      reason: error instanceof GraphifyError ? error.message : 'Failed to inspect Graphify artifacts.',
    }
  }
}

function countByStatus(rows: Array<{ status: GraphifyStatus }>) {
  return rows.reduce<Record<GraphifyStatus, number>>((acc, row) => {
    acc[row.status] += 1
    return acc
  }, {
    ready: 0,
    stale: 0,
    missing_path: 0,
    missing_artifact: 0,
    r2_unconfigured: 0,
    error: 0,
  })
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

function isMissingGraphifyTableError(error: unknown): boolean {
  const err = error as { code?: unknown, message?: unknown }
  const message = String(err?.message || '')
  return err?.code === '42P01' || message.includes('project_repos') || message.includes('departments')
}

function unavailable(reason = 'Graphify repository metadata is not available yet.') {
  return {
    available: false,
    reason,
    r2Configured: r2Configured(),
    staleAfterDays: 14,
    summary: {
      totalRepos: 0,
      configuredRepos: 0,
      readyRepos: 0,
      staleRepos: 0,
      issueRepos: 0,
      totalNodes: 0,
      totalEdges: 0,
      statusCounts: {
        ready: 0,
        stale: 0,
        missing_path: 0,
        missing_artifact: 0,
        r2_unconfigured: 0,
        error: 0,
      } satisfies Record<GraphifyStatus, number>,
    },
    repos: [],
  }
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  let rows: RepoRow[]
  try {
    rows = await queryRows<RepoRow>(`
      SELECT
        pr.id::text,
        pr.repo_url,
        pr.provider,
        pr.default_branch,
        pr.graphify_path,
        pr.graphify_last_synced_at,
        pr.updated_at,
        d.id::text AS department_id,
        d.name AS department_name,
        d.slug AS department_slug
      FROM project_repos pr
      JOIN departments d ON d.id = pr.department_id
      ORDER BY d.name ASC, pr.repo_url ASC
    `)
  } catch (error) {
    if (isMissingGraphifyTableError(error)) {
      return unavailable('Project repository metadata is missing; configure project_repos before Graphify status can be shown.')
    }

    console.error('[Admin AI Model Ops Graphify] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load Graphify status'
    })
  }

  const canReadR2 = r2Configured()
  const repos = await mapWithConcurrency(
    rows,
    GRAPHIFY_INSPECTION_CONCURRENCY,
    row => inspectRepo(row, canReadR2),
  )
  const statusCounts = countByStatus(repos)

  return {
    available: true,
    r2Configured: canReadR2,
    staleAfterDays: 14,
    summary: {
      totalRepos: repos.length,
      configuredRepos: repos.filter((repo) => Boolean(repo.graphifyPath)).length,
      readyRepos: statusCounts.ready,
      staleRepos: statusCounts.stale,
      issueRepos: repos.length - statusCounts.ready,
      totalNodes: repos.reduce((sum, repo) => sum + repo.nodeCount, 0),
      totalEdges: repos.reduce((sum, repo) => sum + repo.edgeCount, 0),
      statusCounts,
    },
    repos,
  }
})
