import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const getEndpoint = readFileSync(
  resolve(root, 'server/api/portal/analytics/audiences/consent-control.get.ts'),
  'utf8',
)
const putEndpoint = readFileSync(
  resolve(root, 'server/api/portal/analytics/audiences/consent-control.put.ts'),
  'utf8',
)
const component = readFileSync(
  resolve(root, 'app/components/analytics/AudienceConsentControl.vue'),
  'utf8',
)

describe('portal persona consent control contract', () => {
  it('requires tenant-scoped client analytics access', () => {
    expect(getEndpoint).toContain('requireClientAuth(event)')
    expect(getEndpoint).toContain('client.clientId')
    expect(putEndpoint).toContain('requireClientAuth(event)')
    expect(putEndpoint).toContain('client.clientId')
  })

  it('limits mutations to authorized client contacts and strict actions', () => {
    expect(putEndpoint).toContain('client.isPrimaryContact')
    expect(putEndpoint).toContain('client.permissions.canApproveWork')
    expect(putEndpoint).toContain("z.discriminatedUnion('action'")
    expect(putEndpoint).toContain("action: z.literal('suppress')")
    expect(putEndpoint).toContain("action: z.literal('release')")
  })

  it('uses the append-only suppression event ledger', () => {
    expect(putEndpoint).toContain('INSERT INTO crm_persona_suppression_events')
    expect(putEndpoint).not.toContain('UPDATE crm_persona_suppression_events')
    expect(putEndpoint).not.toContain('DELETE FROM crm_persona_suppression_events')
  })

  it('does not expose or accept raw customer identifiers', () => {
    expect(getEndpoint).toContain('RIGHT(subject_hash, 12)')
    expect(getEndpoint).not.toMatch(/SELECT[\\s\\S]{0,120}\\bemail\\b/i)
    expect(putEndpoint).not.toContain('email:')
    expect(putEndpoint).not.toContain('phone:')
  })

  it('surfaces consent coverage and suppression controls in the portal', () => {
    expect(component).toContain('Consent ledger & suppression')
    expect(component).toContain('Pseudonymous references only')
    expect(component).toContain('Confirm suppression')
  })
})
