import { setHeader } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireHrAdmin(event)

  const candidates = await queryRows<any>(
    `SELECT 'published_finding' AS source_type, finding.id AS source_id,
            finding.title, finding.statement AS suggested_content,
            finding.published_at AS source_date,
            ARRAY['Human finding from one review must not be generalized without corroboration.',
                  'Participant response and contrary evidence remain part of the authoritative review record.']::text[] AS limitations
       FROM hr_review_findings finding
      WHERE finding.status = 'published'
        AND NOT EXISTS (SELECT 1 FROM hr_knowledge_entries entry WHERE entry.entry_key = 'published_finding:' || finding.id::text)
      UNION ALL
     SELECT 'completed_action' AS source_type, action.id AS source_id,
            action.title,
            CONCAT_WS(E'\n', action.description, 'Measured outcome: ' || NULLIF(action.success_measure, '')) AS suggested_content,
            action.updated_at AS source_date,
            ARRAY['Completion records show an implemented action, not proof that the same remedy will work elsewhere.',
                  'Personal details and individual questionnaire answers must be removed before promotion.']::text[] AS limitations
       FROM hr_follow_up_plans action
      WHERE action.status = 'completed'
        AND NOT EXISTS (SELECT 1 FROM hr_knowledge_entries entry WHERE entry.entry_key = 'completed_action:' || action.id::text)
      ORDER BY source_date DESC
      LIMIT 200`,
  )

  return {
    candidates,
    policy: {
      manualDraftOnly: true,
      prohibitedSources: ['questionnaire_answers', 'anonymous_raw_feedback', 'private_messages', 'original_contracts'],
      generalAiExcluded: true,
    },
  }
})
