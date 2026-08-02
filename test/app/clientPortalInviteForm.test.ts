import { describe, expect, it } from 'vitest'
import { createClientPortalInviteForm } from '~~/app/utils/clientPortalInviteForm'

describe('client portal invite form defaults', () => {
  it('creates a fresh opt-in-safe form while preserving only the requested client', () => {
    const first = createClientPortalInviteForm('client-a')
    first.email = 'stale@example.com'
    first.permissions.canNominateCompetitors = true

    const reopened = createClientPortalInviteForm('client-b')

    expect(reopened).toMatchObject({
      clientId: 'client-b',
      email: '',
      name: '',
      permissions: { canNominateCompetitors: false }
    })
    expect(createClientPortalInviteForm()).toMatchObject({
      clientId: null,
      permissions: { canNominateCompetitors: false }
    })
  })
})
