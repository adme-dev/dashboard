/**
 * Force-regenerate the AI Wiki context for a task. Bypasses the cache hash
 * check and writes a fresh row to task_wiki_cache.
 *
 * POST /api/agency/tasks/:id/wiki/regenerate
 *
 * AuthZ: caller must have access to the task's board AND write access.
 */

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBoardAccess, requireWriteAccess } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { isUUID } from '~~/server/utils/ids'
import {
  buildWiki,
  computeSourceHash,
  type RepoRow,
  type TaskRow,
} from '~~/server/utils/taskWiki'

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
  await requireWriteAccess(event)

  const repo = await queryOne<RepoRow>(
    `SELECT repo_url, default_branch, graphify_path, graphify_last_synced_at
       FROM project_repos
      WHERE department_id = $1
      LIMIT 1`,
    [task.board_id],
  )
  if (!repo) {
    throw createError({ statusCode: 400, statusMessage: 'No repo connected to this board' })
  }
  if (!repo.graphify_path) {
    throw createError({ statusCode: 400, statusMessage: 'No graphify_path configured for this repo' })
  }

  // Compute the hash AFTER buildWiki so it reflects the source state at the
  // time of generation, not the (possibly slightly different) state when the
  // request landed. Reduces the tiny window where a concurrent task edit
  // could mark a stale-input cache entry as "fresh".
  const built = await buildWiki(task, repo)
  const sourceHash = await computeSourceHash(task, repo)

  await execute(
    `INSERT INTO task_wiki_cache (task_id, summary, files, source_hash, generated_at, generated_by_model)
     VALUES ($1, $2, $3::jsonb, $4, NOW(), $5)
     ON CONFLICT (task_id) DO UPDATE
       SET summary = EXCLUDED.summary,
           files = EXCLUDED.files,
           source_hash = EXCLUDED.source_hash,
           generated_at = EXCLUDED.generated_at,
           generated_by_model = EXCLUDED.generated_by_model`,
    [task.id, built.summary, JSON.stringify(built.files), sourceHash, built.model],
  )

  return {
    enabled: true as const,
    status: 'fresh' as const,
    summary: built.summary,
    files: built.files,
    repo: { url: repo.repo_url, branch: repo.default_branch },
    generatedAt: new Date().toISOString(),
    model: built.model,
  }
})
