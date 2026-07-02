import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

const THEME_CHECK_FILES = [
  'app/pages/agency/social/publishing/compose.vue',
  'app/pages/agency/social/publishing/accounts.vue',
  'app/pages/agency/social/publishing/analytics.vue',
  'app/pages/agency/social/publishing/approvals.vue',
  'app/pages/agency/social/publishing/calendar.vue',
  'app/pages/agency/social/publishing/index.vue',
  'app/pages/agency/social/publishing/planner.vue',
  'app/pages/agency/social/publishing/queue.vue',
  'app/pages/agency/social/publishing/wall.vue',
  'app/pages/agency/social/inbox/wall.vue',
  'app/components/social-publishing/AiPlanModal.vue',
  'app/components/social-publishing/CalendarView.vue',
  'app/components/social-publishing/CampaignManager.vue',
  'app/components/social-publishing/PlannerAgentPanel.vue',
  'app/components/social-publishing/PlannerBoard.vue',
  'app/components/social-publishing/PlannerCard.vue',
  'app/components/social-publishing/PlatformPreviewPane.vue',
  'app/components/social-publishing/PostComposer.vue',
  'app/components/social-publishing/SlotManager.vue',
  'app/components/social-publishing/SocialPublishingNav.vue',
  'app/components/social-publishing/SocialPublishingShell.vue'
]

const LIGHT_ONLY_PATTERNS = [
  /\bbg-white\b/,
  /\bbg-black\b/,
  /\btext-black\b/,
  /\btext-white\b/,
  /\bborder-gray-\d{2,3}\b/,
  /\bbg-gray-\d{2,3}\b/,
  /\btext-gray-\d{2,3}\b/
]

describe('social publishing light/dark compatibility', () => {
  it('keeps primary publishing and engagement-wall surfaces on semantic theme classes', () => {
    const offenders: string[] = []

    for (const file of THEME_CHECK_FILES) {
      const contents = readFileSync(resolve(ROOT, file), 'utf8')
      contents.split('\n').forEach((line, index) => {
        if (line.includes('dark:')) return
        if (!LIGHT_ONLY_PATTERNS.some(pattern => pattern.test(line))) return
        offenders.push(`${file}:${index + 1}:${line.trim()}`)
      })
    }

    expect(offenders).toEqual([])
  })
})
