import { describe, expect, it } from 'vitest'
import * as pilotEvidence from '~~/server/utils/ai/governance/pilotEvidence'

describe('pilot evidence authority', () => {
  it('exposes only the durable evidence state machine and no in-memory trust reader', () => {
    expect(pilotEvidence).toHaveProperty('issuePilotUatEvidence')
    expect(pilotEvidence).toHaveProperty('markPilotUatStarted')
    expect(pilotEvidence).toHaveProperty('terminalizePilotUatEvidence')
    expect(pilotEvidence).toHaveProperty('assessPilotUatEvidence')
    expect(pilotEvidence).not.toHaveProperty('readTrustedPilotRepresentativeEvidence')
    expect(pilotEvidence).not.toHaveProperty('issuePilotRepresentativeEvidence')
  })
})
