import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/portal/magic-link.vue', 'utf8')
const composable = readFileSync('app/composables/usePortalAuth.ts', 'utf8')

describe('portal magic-link verification page', () => {
  it('keeps the credential in the fragment and requires explicit user confirmation', () => {
    expect(page).toContain('window.location.hash')
    expect(page).toContain('window.history.replaceState')
    expect(page).toContain('const ready = ref(false)')
    expect(page).toContain('v-if="!ready"')
    expect(page).toContain('ready.value = true')
    expect(page).toContain('Continue to portal')
    expect(page).toContain('@click="handleVerify"')
    expect(page).not.toContain('onMounted(handleVerify)')
    expect(page).not.toMatch(/<button[\s>]/)
  })

  it('uses dedicated passwordless request and verification actions', () => {
    expect(composable).toContain('\'/api/portal/auth/magic-link/request\'')
    expect(composable).toContain('\'/api/portal/auth/magic-link/verify\'')
    expect(composable).toContain('requestMagicLink')
    expect(composable).toContain('verifyMagicLink')
    expect(composable).not.toContain('\'/api/portal/auth/login\'')
    expect(composable).not.toMatch(/\bpassword\b/i)
  })
})
