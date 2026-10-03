import { requireWriteAccess } from '~~/server/utils/auth'
import { saveProjectTemplateTask, templateTaskInput } from '~~/server/utils/projectTemplateTasks'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const templateId = getRouterParam(event, 'id')
  if (!templateId) throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  const parsed = templateTaskInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check the task title, board, dates and prerequisites' })
  return saveProjectTemplateTask(templateId, parsed.data)
})
