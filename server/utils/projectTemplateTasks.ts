import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { validateTemplateTaskGraph } from '~~/server/utils/briefConversion/taskGraph'

export const templateTaskInput = z.object({
  taskId: z.string().uuid().optional(),
  expectedRevision: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(12000).default(''),
  defaultDepartmentId: z.string().uuid().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  taskType: z.enum(['task', 'milestone', 'deliverable', 'review', 'approval']).default('task'),
  estimatedHours: z.number().min(0).max(9999.99).nullable().default(null),
  startDayOffset: z.number().int().min(0).max(3650).default(0),
  durationDays: z.number().int().min(0).max(3650).default(1),
  dependsOnTaskIds: z.array(z.string().uuid()).max(100).default([]),
  billable: z.boolean().default(false)
}).strict()

export async function saveProjectTemplateTask(templateId: string, input: z.infer<typeof templateTaskInput>) {
  return transaction(async (db) => {
    const template = (await db.query('SELECT id, updated_at::text AS revision FROM project_templates WHERE id = $1 FOR UPDATE', [templateId])).rows[0]
    if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    if (template.revision !== input.expectedRevision) {
      throw createError({ statusCode: 409, statusMessage: 'This template changed. Refresh and review the latest tasks before saving.' })
    }
    if (input.defaultDepartmentId) {
      const department = (await db.query('SELECT id FROM departments WHERE id = $1 AND is_active = true', [input.defaultDepartmentId])).rows[0]
      if (!department) throw createError({ statusCode: 422, statusMessage: 'Choose an active board' })
    }
    const tasks = (await db.query('SELECT * FROM template_tasks WHERE template_id = $1', [templateId])).rows
    if (tasks.length >= 1000 && !input.taskId) throw createError({ statusCode: 422, statusMessage: 'Template task limit reached' })
    const existing = tasks.find(task => task.id === input.taskId)
    if (input.taskId && !existing) throw createError({ statusCode: 404, statusMessage: 'Task does not belong to this template' })
    const id = input.taskId || crypto.randomUUID()
    const dependencies = [...new Set(input.dependsOnTaskIds)]
    validateTemplateTaskGraph([...tasks.filter(task => task.id !== id), { ...existing, id, depends_on_task_ids: dependencies }])
    const values = [templateId, id, input.title, input.description.trim() || null, input.defaultDepartmentId,
      input.priority, input.taskType, input.estimatedHours, input.startDayOffset, input.durationDays, dependencies, input.billable]
    if (existing) {
      await db.query(`UPDATE template_tasks SET title=$3, description=$4, default_department_id=$5,
        priority=$6, task_type=$7, estimated_hours=$8, start_day_offset=$9, duration_days=$10,
        depends_on_task_ids=$11, billable=$12, updated_at=clock_timestamp()
        WHERE template_id=$1 AND id=$2`, values)
    } else {
      await db.query(`INSERT INTO template_tasks (template_id,id,title,description,default_department_id,
        priority,task_type,estimated_hours,start_day_offset,duration_days,depends_on_task_ids,billable,sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          (SELECT COALESCE(MAX(sort_order),0)+1 FROM template_tasks WHERE template_id=$1))`, values)
    }
    const updated = (await db.query('UPDATE project_templates SET updated_at=clock_timestamp() WHERE id=$1 RETURNING updated_at::text AS revision', [templateId])).rows[0]
    return { id, revision: updated.revision }
  })
}
