import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const worker = readFileSync(new URL('../../workers/pages-cron/src/index.ts', import.meta.url), 'utf8')

describe('HR reminder worker schedule', () => {
  it('dispatches the idempotent HR reminder endpoint on the hourly trigger', () => {
    const hourlyRoute = worker.match(/'0 \* \* \* \*': \[([^\]]+)\]/s)?.[1] || ''
    expect(hourlyRoute).toContain("'/api/cron/hr-review-reminders'")
  })
})
