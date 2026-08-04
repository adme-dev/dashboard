import { transitionKnowledgeForBoard } from '~~/server/utils/boardKnowledge/apiRoutes'

export default defineEventHandler(event => transitionKnowledgeForBoard(event, 'archive', 'knowledge.index'))
