import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const panel = readFileSync(resolve(root, 'app/components/page-studio/RuntimePublishingPanel.client.vue'), 'utf8')
const workspace = readFileSync(resolve(root, 'app/components/page-studio/PublishingWorkspace.client.vue'), 'utf8')

describe('runtime publishing panel', () => {
  it('publishes and restores only through explicit, idempotent runtime actions', () => {
    expect(panel).toContain('/runtime-releases/activate')
    expect(panel).toContain('/runtime-releases/rollback')
    expect(panel.match(/'idempotency-key'/g)).toHaveLength(2)
    expect(panel).toContain('expectedActiveReleaseId: live.value?.releaseId ?? null')
    expect(panel).toContain('environment: props.state.environment')
    expect(panel).not.toContain('environment: \'production\'')
    expect(panel).toContain('label="I have previewed this version"')
    expect(panel).toContain(':disabled="!publishConfirmed"')
    expect(panel).toContain('the live site was not changed')
  })

  it('previews the private draft through the credential handoff, never a URL token', () => {
    expect(panel).toContain('/runtime-preview')
    expect(panel).toContain('openPageStudioCandidatePreview(result.hostname, result.session)')
  })

  it('explains why publishing is unavailable', () => {
    for (const reason of ['not configured', 'ready production domain', 'no staging hostname', 'Approve a saved version', 'already live']) {
      expect(panel).toContain(reason)
    }
  })

  it('replaces build publishing for runtime sites in the workspace', () => {
    expect(workspace).toContain('<PageStudioRuntimePublishingPanel')
    expect(workspace).toContain(':disabled="!canPublish || runtimeMode"')
    expect(workspace).toContain('This website uses instant publishing')
  })
})
