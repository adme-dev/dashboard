import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagePath = new URL('../../app/pages/agency/monday-cutover.vue', import.meta.url)

describe('Monday cutover approval UI contract', () => {
  it('exposes governed dry-run mapping controls to internal admins', () => {
    const page = readFileSync(pagePath, 'utf8')

    expect(page).toContain('middleware: [\'role-admin\']')
    expect(page).toContain('Cutover governance')
    expect(page).toContain('Save draft')
    expect(page).toContain('Approve mapping evidence')
    expect(page).toContain('Client links')
    expect(page).toContain('Column decisions')
    expect(page).toContain('Target placement')
    expect(page).toContain('No import is executed')
  })

  it('uses a standalone Nuxt page instead of a nested child of the legacy migration page', () => {
    const nestedPage = new URL('../../app/pages/agency/monday/cutover.vue', import.meta.url)

    expect(existsSync(pagePath)).toBe(true)
    expect(existsSync(nestedPage)).toBe(false)
  })

  it('uses only approval and read endpoints, never legacy migration execution', () => {
    const page = readFileSync(pagePath, 'utf8')

    expect(page).toContain('/cutover-approval`')
    expect(page).toContain('`${endpoint.value}/approve`')
    expect(page).toContain('method: \'PUT\'')
    expect(page).toContain('method: \'POST\'')
    expect(page).not.toContain('/run-migration')
    expect(page).not.toContain('/import-board')
    expect(page).not.toContain('/import-all')
  })
})
