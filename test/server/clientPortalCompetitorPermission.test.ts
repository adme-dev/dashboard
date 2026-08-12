import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('client competitor nomination permission contract', () => {
  it('keeps competitor nomination explicitly opt-in across portal user persistence and responses', () => {
    const clientAuth = source('server/utils/clientAuth.ts')
    const clientPermissions = source('app/types/index.ts')
    const portalAuth = source('app/composables/usePortalAuth.ts')
    const agencyInvite = source('server/api/agency/client-portal/invite.post.ts')
    const agencyUpdate = source('server/api/agency/client-portal/users/[id].put.ts')
    const agencyUsers = source('server/api/agency/client-portal/users.get.ts')
    const agencyMe = source('server/api/agency/client-portal/auth/me.get.ts')
    const agencyUser = source('server/api/agency/client-portal/users/[id].get.ts')
    const portalMe = source('server/api/portal/auth/me.get.ts')
    const portalUsers = source('server/api/portal/users/index.get.ts')

    expect(clientPermissions).toContain('canNominateCompetitors: boolean')
    expect(portalAuth).toContain('permissions: ClientPermissions')

    expect(clientAuth).toContain('cu.can_nominate_competitors')
    expect(clientAuth).toContain('canNominateCompetitors: user.can_nominate_competitors ?? false')

    expect(agencyInvite).toContain('can_nominate_competitors')
    expect(agencyInvite).toContain('permissions.canNominateCompetitors ?? false')
    expect(agencyUpdate).toContain('canNominateCompetitors?: boolean')
    expect(agencyUpdate).toContain('can_nominate_competitors = $${idx}')
    expect(agencyUpdate).toContain('canNominateCompetitors: user.can_nominate_competitors ?? false')

    for (const endpoint of [agencyUsers, agencyMe, agencyUser, portalUsers]) {
      expect(endpoint).toContain('can_nominate_competitors')
      expect(endpoint).toContain('canNominateCompetitors:')
    }

    expect(agencyUsers).toContain('canNominateCompetitors: u.can_nominate_competitors ?? false')
    expect(agencyMe).toContain('canNominateCompetitors: user.can_nominate_competitors ?? false')
    expect(agencyUser).toContain('canNominateCompetitors: user.can_nominate_competitors ?? false')
    expect(portalUsers).toContain('canNominateCompetitors: user.can_nominate_competitors ?? false')
    expect(portalMe).toContain('canNominateCompetitors: clientUser.permissions.canNominateCompetitors ?? false')
  })
})
