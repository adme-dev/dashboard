/**
 * Read cached AI "Wiki" context for a board task. Cache-only — does NOT
 * trigger LLM generation. Use POST /wiki/regenerate to (re)build.
 *
 * GET /api/agency/tasks/:id/wiki
 *
 * Response shapes:
 *   { enabled: false, reason: 'no-repo' | 'no-graphify' }
 *   { enabled: true, status: 'never-generated' }
 *   { enabled: true, status: 'fresh' | 'stale',
 *     summary, files, repo, generatedAt, model }
 *
 * AuthZ: caller must have access to the task's board.
 */

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBoardAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { isUUID } from '~~/server/utils/ids'
import {
  computeSourceHash,
  type RepoRow,
  type TaskRow,
  type WikiFile,
} from '~~/server/utils/taskWiki'

interface CacheRow {
  summary: string
  files: WikiFile[]
  source_hash: string
  generated_at: string
  generated_by_model: string | null
}

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  if (!taskId || !isUUID(taskId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid task id is required' })
  }

  const task = await queryOne<TaskRow>(
    `SELECT id, title, description, department_id AS board_id
       FROM tasks
      WHERE id = $1`,
    [taskId],
  )
  if (!task) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  }

  await requireBoardAccess(event, task.board_id)

  const repo = await queryOne<RepoRow>(
    `SELECT repo_url, default_branch, graphify_path, graphify_last_synced_at
       FROM project_repos
      WHERE department_id = $1
      LIMIT 1`,
    [task.board_id],
  )

  if (!repo) {
    return { enabled: false as const, reason: 'no-repo' as const }
  }
  if (!repo.graphify_path) {
    return { enabled: false as const, reason: 'no-graphify' as const }
  }

  const cached = await queryOne<CacheRow>(
    `SELECT summary, files, source_hash, generated_at, generated_by_model
       FROM task_wiki_cache
      WHERE task_id = $1`,
    [task.id],
  )

  if (!cached) {
    return {
      enabled: true as const,
      status: 'never-generated' as const,
      repo: { url: repo.repo_url, branch: repo.default_branch },
    }
  }

  const sourceHash = await computeSourceHash(task, repo)
  const status = cached.source_hash === sourceHash ? ('fresh' as const) : ('stale' as const)

  return {
    enabled: true as const,
    status,
    summary: cached.summary,
    files: cached.files,
    repo: { url: repo.repo_url, branch: repo.default_branch },
    generatedAt: cached.generated_at,
    model: cached.generated_by_model,
  }
})
