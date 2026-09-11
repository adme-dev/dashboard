import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSetupProposalBody } from '~~/server/utils/pageStudio/schemas'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'
import { edgeGenerate } from '~~/server/utils/edgeAi'

function parseQuestions(response: string | null, fallback: string[]): string[] {
  if (!response) return fallback
  try {
    const parsed = JSON.parse(response.replace(/```json\n?|\n?```/g, '').trim())
    if (!Array.isArray(parsed?.questions)) return fallback
    const questions = parsed.questions.filter((question: unknown): question is string => typeof question === 'string' && question.trim().length > 0 && question.length <= 240).slice(0, 9)
    return questions.length ? questions : fallback
  } catch {
    return fallback
  }
}

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) {
      throw createError({ statusCode: 403, statusMessage: 'Page Studio editing access denied' })
    }
    const parsed = PageStudioSetupProposalBody.omit({ scope: true }).safeParse(await readBody(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio setup request' })
    const proposal = createPageStudioSetupProposal({
      businessName: parsed.data.name,
      starterVersion: parsed.data.starterVersion,
      setupSource: parsed.data.setupSource,
      setupBrief: parsed.data.setupBrief
    })
    const fallbackQuestions = proposal.missingFacts.map(fact => `What confirmed ${fact} should this website use?`)
    const response = await edgeGenerate(event, `Rewrite only these missing setup facts as concise questions for the customer. Do not add facts, prices, policies, or assumptions. Return JSON only in the form {"questions":["..."]}. Missing facts: ${JSON.stringify(proposal.missingFacts)}`, {
      featureKey: 'page_studio_setup_questions',
      userId: user.id,
      clientId: user.clientId,
      maxTokens: 320,
      temperature: 0.1,
      systemPrompt: 'You produce safe customer clarification questions. Use only the supplied missing-fact labels.'
    })
    return { proposal: { ...proposal, questions: parseQuestions(response, fallbackQuestions) } }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
