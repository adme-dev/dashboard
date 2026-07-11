type AggregateQuestion = {
  id: string
  prompt: string
  type: string
  module?: string
  options?: Array<{ value: string; label: string }>
}

type AggregateRow = {
  responseId: string
  answers: Record<string, string | string[]>
  questions: AggregateQuestion[]
}

const MINIMUM_COHORT_SIZE = 5

export function aggregateHrFeedback(rows: AggregateRow[]) {
  const uniqueRows = [...new Map(rows.map(row => [row.responseId, row])).values()]
  const cohortSize = uniqueRows.length
  if (cohortSize < MINIMUM_COHORT_SIZE) {
    return { cohortSize, minimumCohortSize: MINIMUM_COHORT_SIZE, suppressed: true, themes: [] }
  }

  const questions = new Map<string, { question: AggregateQuestion; respondents: Set<string> }>()
  for (const row of uniqueRows) {
    for (const question of row.questions || []) {
      if (!['single_choice', 'multiple_choice'].includes(question.type) || !question.options?.length) continue
      const entry = questions.get(question.id) || { question, respondents: new Set<string>() }
      entry.respondents.add(row.responseId)
      questions.set(question.id, entry)
    }
  }

  const themes = [...questions.values()].filter(entry => entry.respondents.size >= MINIMUM_COHORT_SIZE).map(({ question }) => {
    const counts = new Map(question.options!.map(option => [option.value, 0]))
    for (const row of uniqueRows) {
      const answer = row.answers?.[question.id]
      const values = Array.isArray(answer) ? answer : typeof answer === 'string' ? [answer] : []
      for (const value of values) if (counts.has(value)) counts.set(value, (counts.get(value) || 0) + 1)
    }
    return {
      questionId: question.id,
      prompt: question.prompt,
      options: question.options!.map(option => ({ ...option, count: counts.get(option.value) || 0 })),
    }
  })

  return { cohortSize, minimumCohortSize: MINIMUM_COHORT_SIZE, suppressed: false, themes }
}
