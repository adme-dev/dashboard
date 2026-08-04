import { submitKnowledgeSource } from '~~/server/utils/boardKnowledge/apiRoutes'

export default defineEventHandler(event => submitKnowledgeSource(event, 'task_attachment', 'attachmentId'))
