export interface TemplateTaskGraphNode {
  id: string
  parent_task_id?: string | null
  depends_on_task_ids?: string[] | null
}

/** Validate before copying IDs; template references must never escape their own job. */
export function validateTemplateTaskGraph(tasks: TemplateTaskGraphNode[]) {
  const ids = new Set(tasks.map(task => task.id))
  if (ids.size !== tasks.length) throw createError({ statusCode: 422, statusMessage: 'Template contains duplicate task IDs' })
  for (const relation of ['dependencies', 'parents'] as const) {
    const edges = new Map(tasks.map(task => [task.id, relation === 'parents'
      ? (task.parent_task_id ? [task.parent_task_id] : [])
      : (task.depends_on_task_ids || [])]))
    const visiting = new Set<string>()
    const visited = new Set<string>()
    function visit(id: string) {
      if (visiting.has(id)) throw createError({ statusCode: 422, statusMessage: `Template task ${relation} contain a cycle` })
      if (visited.has(id)) return
      visiting.add(id)
      for (const target of edges.get(id) || []) {
        if (!ids.has(target)) throw createError({ statusCode: 422, statusMessage: 'Task references another template or a missing task' })
        visit(target)
      }
      visiting.delete(id)
      visited.add(id)
    }
    for (const task of tasks) visit(task.id)
  }
}

export function templateTaskDescription(description: string | null, checklist: unknown): string | null {
  if (!Array.isArray(checklist) || !checklist.length) return description || null
  const items = checklist.map(item => typeof item === 'string' ? item : item?.text || item?.title || item?.label)
    .filter((item): item is string => typeof item === 'string' && !!item.trim())
  if (!items.length) return description || null
  return [description, 'Acceptance criteria:', ...items.map(item => `- ${item}`)].filter(Boolean).join('\n')
}
