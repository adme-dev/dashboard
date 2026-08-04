import { transitionKnowledgeForBoard } from '~~/server/utils/boardKnowledge/apiRoutes'

export default defineEventHandler(event => transitionKnowledgeForBoard(event, 'approve', 'knowledge.index'))
