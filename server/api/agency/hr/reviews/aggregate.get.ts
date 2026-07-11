import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { aggregateHrFeedback } from '~~/server/utils/hr/aggregateFeedback'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const rows = await queryRows<any>(
    `SELECT cycle.id AS cycle_id, cycle.name AS cycle_name,
            response.id AS response_id, response.answers,
            questionnaire.questions
       FROM hr_review_cycles cycle
       JOIN hr_review_participants participant ON participant.cycle_id = cycle.id
       JOIN hr_questionnaire_assignments assignment ON assignment.participant_id = participant.id
       JOIN hr_questionnaire_versions questionnaire ON questionnaire.id = assignment.questionnaire_version_id
       JOIN hr_responses response ON response.assignment_id = assignment.id
      WHERE response.status = 'submitted'
      ORDER BY cycle.created_at DESC, response.id`,
  )

  const byCycle = new Map<string, { id: string; name: string; rows: any[] }>()
  for (const row of rows) {
    const cycle = byCycle.get(row.cycle_id) || { id: row.cycle_id, name: row.cycle_name, rows: [] }
    cycle.rows.push({ responseId: row.response_id, answers: row.answers || {}, questions: row.questions || [] })
    byCycle.set(row.cycle_id, cycle)
  }

  return {
    cycles: [...byCycle.values()].map(cycle => ({
      id: cycle.id,
      name: cycle.name,
      ...aggregateHrFeedback(cycle.rows),
    })),
    privacy: {
      minimumCohortSize: 5,
      freeTextExcluded: true,
      respondentDrilldown: false,
      crossFilterEnabled: false,
    },
  }
})
