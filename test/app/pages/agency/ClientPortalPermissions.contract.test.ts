import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync('app/pages/agency/client-portal.vue', 'utf8')

describe('agency client portal nomination permission contract', () => {
  it('adds the opt-in permission once to each existing invite and edit form', () => {
    const page = source()

    expect(page).toMatch(/canNominateCompetitors\?:\s*boolean/)
    expect(page).toMatch(/inviteForm\.permissions\.canNominateCompetitors/)
    expect(page).toMatch(/accessForm\.permissions\.canNominateCompetitors/)
    expect(page).toMatch(/UFormField[\s\S]*Competitor nominations[\s\S]*UCheckbox/)
    expect(page).toMatch(/Nominate nearby competitors for agency review/)
    expect(page).toMatch(/portalUserModules[\s\S]*Competitor nominations/)
    expect(page.match(/v-model="inviteForm\.permissions\.canNominateCompetitors"/g)).toHaveLength(1)
    expect(page.match(/v-model="accessForm\.permissions\.canNominateCompetitors"/g)).toHaveLength(1)
  })

  it('keeps all defaults and standard presets disabled until explicitly enabled', () => {
    const page = source()

    expect(page).toMatch(/canNominateCompetitors:\s*Boolean\(user\.permissions\?\.canNominateCompetitors\)/)
    expect(page.match(/canNominateCompetitors:\s*false/g)?.length).toBeGreaterThanOrEqual(6)
    expect(page).not.toMatch(/canNominateCompetitors:\s*true/)
  })
})
