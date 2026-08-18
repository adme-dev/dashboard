import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Meta lead client resolution', () => {
  const resolver = readFileSync('server/utils/leads/metaLeadClient.ts', 'utf8')
  const webhook = readFileSync('server/api/leads/webhook/meta.post.ts', 'utf8')
  const backfill = readFileSync('server/api/leads/_internal/meta-backfill.post.ts', 'utf8')

  it('prefers the exact Facebook Page mapping and falls back to the unique form rule', () => {
    expect(resolver).toContain("account.platform = 'facebook'")
    expect(resolver).toContain('account.platform_account_id = $1')
    expect(resolver).toContain("rule.source = 'meta'")
    expect(resolver).toContain('rule.form_id = $2')
    expect(resolver).toContain('ORDER BY candidate.priority')
  })

  it('does not infer the client from a shared OAuth token', () => {
    expect(webhook).toContain('resolveMetaLeadClient(pageId, resolved.form_id ?? change.value?.form_id)')
    expect(backfill).toContain('resolveMetaLeadClient(pageId, resolved.form_id ?? payload?.form_id)')
    expect(webhook).not.toContain('workingToken?.client_id')
    expect(backfill).not.toContain('workingToken?.client_id')
  })
})
