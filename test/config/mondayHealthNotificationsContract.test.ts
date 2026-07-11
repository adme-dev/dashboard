import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/api/cron/monday-health-notifications.post.ts', 'utf8')
describe('Monday health notification contract', () => {
  it('is cron-protected and deduplicates canonical task alerts', () => {
    expect(source).toContain('CRON_SECRET')
    expect(source).toContain('DISTINCT ON (mim.task_id)')
    expect(source).toContain("n.metadata->>'localTaskId'")
    expect(source).toContain("INTERVAL '1 day'")
  })
  it('emits explicit blocked/inactive notification types', () => {
    expect(source).toContain("monday_blocked")
    expect(source).toContain("monday_inactive")
    expect(source).toContain('createNotification')
  })
  it('preserves both local and Monday source identities and links', () => {
    expect(source).toContain("mim.source_data->>'url'")
    expect(source).toContain('localTaskId: alert.taskId')
    expect(source).toContain('localTaskUrl')
    expect(source).toContain('mondayItemId: alert.mondayItemId')
    expect(source).toContain('mondayBoardId: alert.mondayBoardId')
    expect(source).toContain('mondayUrl: alert.mondayUrl')
  })
})
