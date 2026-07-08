import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { syncSmokeVerifierToml } from '../../scripts/sync-agency-workflows-smoke-verifier.mjs'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

describe('agency workflows smoke verifier sync script', () => {
  it('replaces the deployed verifier with a hash of the CI smoke secret', () => {
    const result = syncSmokeVerifierToml([
      '[vars]',
      'AGENCY_WORKFLOWS_ENABLED = "true"',
      'AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256 = "old"',
      ''
    ].join('\n'), 'machine-secret')

    expect(result.updated).toBe(true)
    expect(result.toml).toContain(`AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256 = "${hash('machine-secret')}"`)
    expect(result.toml).not.toContain('machine-secret')
  })

  it('inserts the verifier when the deploy config does not have one yet', () => {
    const result = syncSmokeVerifierToml([
      '[vars]',
      'AGENCY_WORKFLOWS_ENABLED = "true"',
      'AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY = "false"',
      ''
    ].join('\n'), 'machine-secret')

    expect(result.updated).toBe(true)
    expect(result.toml).toContain([
      'AGENCY_WORKFLOWS_ENABLED = "true"',
      `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256 = "${hash('machine-secret')}"`,
      'AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY = "false"'
    ].join('\n'))
  })

  it('leaves the deploy config unchanged when CI smoke auth is not configured', () => {
    const source = [
      '[vars]',
      'AGENCY_WORKFLOWS_ENABLED = "true"',
      ''
    ].join('\n')

    expect(syncSmokeVerifierToml(source, '')).toEqual({
      updated: false,
      toml: source
    })
  })
})
