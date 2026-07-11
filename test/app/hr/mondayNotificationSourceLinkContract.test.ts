import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/components/inbox/InboxNotification.vue', 'utf8')

describe('Monday notification source link', () => {
  it('shows a validated external Monday action without replacing the local task action', () => {
    expect(source).toContain('safeMondayUrl')
    expect(source).toContain("metadata?.mondayUrl")
    expect(source).toContain('label="Open in Monday"')
    expect(source).toContain(':to="mondaySourceUrl"')
    expect(source).toContain('target="_blank"')
    expect(source).toContain('v-if="notification.link"')
  })
})
