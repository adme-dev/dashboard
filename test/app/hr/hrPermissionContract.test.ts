import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const clientPermissions = readFileSync(new URL('../../../app/utils/permissions.ts', import.meta.url), 'utf8')
const serverPermissions = readFileSync(new URL('../../../server/utils/permissions.ts', import.meta.url), 'utf8')
const authComposable = readFileSync(new URL('../../../app/composables/useAuth.ts', import.meta.url), 'utf8')

describe('HR permission contract', () => {
  it('defines owner-only HR_ADMIN in both permission mirrors', () => {
    expect(clientPermissions).toContain("HR_ADMIN: ['owner']")
    expect(serverPermissions).toContain("HR_ADMIN: ['owner']")
    expect(clientPermissions).toContain("'HR_ADMIN'")
    expect(serverPermissions).toContain("'HR_ADMIN'")
  })

  it('exposes an HR access capability from useAuth', () => {
    expect(authComposable).toContain('const canAccessHr = computed')
    expect(authComposable).toContain('canAccessHr,')
  })
})
