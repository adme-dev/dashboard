import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/226_hr_reminder_idempotency.sql', import.meta.url),
  'utf8',
)
const route = readFileSync(
  new URL('../../server/api/cron/hr-review-reminders.post.ts', import.meta.url),
  'utf8',
)

describe('HR review reminder automation', () => {
  it('uses a database uniqueness boundary to prevent duplicate delivery', () => {
    expect(migration).toContain('idx_hr_notification_delivery_unique')
    expect(migration).toContain('assignment_id, recipient_id, channel, kind')
    expect(route).toContain('delivery_key')
    expect(route).toContain('sendHrReviewLifecycleEmail')
    expect(route).toContain('channel, kind, delivery_key')
    expect(route).toContain("hr_notification_deliveries.status = 'failed'")
    expect(route).toContain('RETURNING id')
  })

  it('fails closed on cron authentication and bounds each reminder run', () => {
    expect(route).toContain('x-cron-secret')
    expect(route).toContain('!process.env.CRON_SECRET')
    expect(route).toContain('LIMIT 200')
  })

  it('separates due-soon reminders from overdue escalations', () => {
    expect(route).toContain("type ReminderKind = 'reminder' | 'overdue'")
    expect(route).toContain("THEN 'overdue' ELSE 'reminder' END AS kind")
    expect(route).toContain("'hr_review_overdue' : 'hr_review_reminder'")
  })
})
