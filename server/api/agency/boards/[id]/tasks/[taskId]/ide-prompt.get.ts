/**
 * Generate a copy-paste IDE / CLI prompt for a board task.
 * GET /api/agency/boards/:id/tasks/:taskId/ide-prompt
 *
 * Pulls the task, its subtasks (the QA checklist), and the board's
 * connected GitHub repo + graphify path, and formats them into a
 * single string the user can drop into Claude Code / Cursor / etc.
 *
 * AuthZ: caller must have board access.
 */

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireBoardAccess } from '~~/server/utils/auth'
import { getAppUrl } from '~~/server/utils/appUrl'
import { queryOne, queryRows } from '~~/server/utils/db'
import { isUUID } from '~~/server/utils/ids'

interface TaskRow {
  id: string
  title: string
  description: string | null
  status_name: string | null
  group_name: string | null
  board_id: string
  board_name: string
  board_slug: string
}

interface SubtaskRow {
  title: string
  status_name: string | null
  sort_order: number
}

interface RepoRow {
  repo_url: string
  default_branch: string
  graphify_path: string | null
}

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')
  const taskId = getRouterParam(event, 'taskId')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'Board id is required' })
  if (!taskId || !isUUID(taskId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid task id is required' })
  }

  await requireBoardAccess(event, idOrSlug)

  const where = isUUID(idOrSlug) ? 'd.id = $2' : 'd.slug = $2'
  const task = await queryOne<TaskRow>(
    `SELECT t.id, t.title, t.description,
            ts.name AS status_name,
            bg.name AS group_name,
            d.id   AS board_id,
            d.name AS board_name,
            d.slug AS board_slug
       FROM tasks t
       JOIN departments d ON d.id = t.department_id
       LEFT JOIN task_statuses ts ON ts.id = t.status_id
       LEFT JOIN board_groups bg ON bg.id = t.group_id
      WHERE t.id = $1 AND ${where}`,
    [taskId, idOrSlug],
  )
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found on this board' })

  const subtasks = await queryRows<SubtaskRow>(
    `SELECT t.title, ts.name AS status_name, t.sort_order
       FROM tasks t
       LEFT JOIN task_statuses ts ON ts.id = t.status_id
      WHERE t.parent_task_id = $1
      ORDER BY t.sort_order, t.created_at`,
    [taskId],
  )

  const repo = await queryOne<RepoRow>(
    `SELECT repo_url, default_branch, graphify_path
       FROM project_repos
      WHERE department_id = $1
      LIMIT 1`,
    [task.board_id],
  )

  const prompt = buildPrompt(task, subtasks, repo)
  const boardLink = `${getAppUrl(event)}/agency/boards/${task.board_slug}`

  return {
    taskId: task.id,
    title: task.title,
    boardName: task.board_name,
    boardLink,
    prompt,
  }
})

function buildPrompt(task: TaskRow, subtasks: SubtaskRow[], repo: RepoRow | null): string {
  const lines: string[] = []

  lines.push(`# Task: ${task.title}`)
  lines.push('')
  lines.push(`Board: **${task.board_name}**${task.group_name ? ` · Group: ${task.group_name}` : ''}${task.status_name ? ` · Status: ${task.status_name}` : ''}`)
  lines.push('')

  if (task.description) {
    lines.push('## Description')
    lines.push(task.description)
    lines.push('')
  }

  if (repo) {
    lines.push('## Repository context')
    lines.push(`- Repo: \`${repo.repo_url}\``)
    lines.push(`- Branch: \`${repo.default_branch}\``)
    if (repo.graphify_path) {
      lines.push(`- Codebase graph: \`${repo.graphify_path}/graph.json\` (graphify) — use it to locate relevant files instead of grep-ing blindly.`)
    }
    lines.push('')
  }

  lines.push('## Checklist')
  if (subtasks.length === 0) {
    lines.push('_(no subtasks defined for this item — add some on the dashboard if you want a structured checklist)_')
  } else {
    for (const s of subtasks) {
      const done = (s.status_name ?? '').toLowerCase() === 'done' || (s.status_name ?? '').toLowerCase() === 'verified'
      lines.push(`- [${done ? 'x' : ' '}] ${s.title}`)
    }
  }
  lines.push('')

  lines.push('## How to work this task')
  lines.push('1. Read the description and checklist above. Get one passing run-through end-to-end before fixing things.')
  if (repo?.graphify_path) {
    lines.push(`2. Use the graphify graph at \`${repo.graphify_path}/graph.json\` to find the files / components / workers this feature touches. Look for matching nodes by label or source_file.`)
  } else {
    lines.push('2. If the codebase is unfamiliar, do a broad grep for the feature name first; then narrow.')
  }
  lines.push('3. For each checkbox, verify the behaviour. If a check fails: capture the error / screenshot, propose a fix, implement it (or open a follow-up).')
  lines.push('4. When everything passes, update the task on the dashboard and mark it Verified.')
  lines.push('')
  lines.push('## Done means')
  lines.push('- All subtasks above check off.')
  lines.push('- Any bugs found are filed back on the dashboard under "Bugs Found" status (linked to this item).')
  lines.push('- A short note on what was tested / fixed pasted into the task comments.')

  return lines.join('\n')
}
