import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('portal social news approval UI', () => {
  it('mounts a dedicated News & Social Content section in the existing approvals view', () => {
    const page = read('app/pages/portal/approvals/index.vue')
    expect(page).toContain('PortalSocialNewsApprovals')
    expect(page).toContain(':status="statusFilter"')
  })

  it('shows per-platform previews, immutable attribution, targets, package/SLA status, and audit history', () => {
    const source = read('app/components/portal/SocialNewsApprovalCard.vue')
    for (const token of [
      'platformPreviews',
      'AI-assisted rewrite',
      'Source attribution',
      'attributionLocked',
      'targetAccounts',
      'approvalSlaHours',
      'usageByPlatform',
      'Approval history'
    ]) {
      expect(source).toContain(token)
    }
  })

  it('uses explicit confirmations and a labelled feedback field for all client decisions', () => {
    const source = read('app/components/portal/SocialNewsApprovals.vue')
    expect(source).toContain('/api/portal/social/news-drafts')
    expect(source).toContain('action: \'approve\'')
    expect(source).toContain('action: \'request_changes\'')
    expect(source).toContain('action: \'reject\'')
    expect(source).toContain('<UModal')
    expect(source).toContain('<UFormField')
    expect(source).toContain('<UTextarea')
  })

  it('surfaces the portal decision in agency Approvals and prevents premature internal approval', () => {
    const source = read('app/pages/agency/social/publishing/approvals.vue')
    expect(source).toContain('client_approval_status')
    expect(source).toContain('Client decision')
    expect(source).toContain('Client approval is required before agency approval')
    expect(source).toContain('selectedPost.client_approval_status !== \'approved\'')
  })

  it('keeps client-facing feature descriptions aligned with the shipped workflow', () => {
    expect(read('app/pages/features/[slug].vue')).toContain('Client-Portal Review')
    expect(read('app/pages/portal/features.vue')).toContain('source-linked social drafts')
  })
})
