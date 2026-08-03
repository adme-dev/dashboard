import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workspace = readFileSync(new URL('../../app/components/search-authority/Workspace.vue', import.meta.url), 'utf8')
const performance = readFileSync(new URL('../../app/components/search-authority/TrustPerformanceCard.vue', import.meta.url), 'utf8')
const findings = readFileSync(new URL('../../app/components/search-authority/TrustFindingsTable.vue', import.meta.url), 'utf8')
const taskLink = readFileSync(new URL('../../server/api/agency/search-authority/trust/findings/[id]/task-link.post.ts', import.meta.url), 'utf8')
const featureDetail = readFileSync(new URL('../../app/pages/features/[slug].vue', import.meta.url), 'utf8')

describe('Search Authority trust workspace contract', () => {
  it('loads tenant-scoped trust evidence and exposes a bounded mobile refresh', () => {
    expect(workspace).toContain('/api/agency/search-authority/trust/findings')
    expect(workspace).toContain('/api/agency/search-authority/trust/refresh')
    expect(workspace).toContain('pageLimit: 3')
    expect(workspace).toContain('<SearchAuthorityTrustPerformanceCard')
    expect(workspace).toContain('<SearchAuthorityTrustFindingsTable')
  })

  it('labels field, lab and unavailable evidence independently', () => {
    expect(performance).toContain('Field · CrUX')
    expect(performance).toContain('Lab · Lighthouse')
    expect(performance).toContain('Unavailable')
    expect(performance).toContain('Missing provider data is never shown as zero or passing')
    expect(featureDetail).toContain('CrUX field experience separate from Lighthouse lab tests')
  })

  it('reuses the normal task dialog and links tasks tenant-safely', () => {
    expect(findings).toContain('Create task')
    expect(workspace).toContain('<WorkflowTaskCreateDialog')
    expect(workspace).toContain('/trust/findings/${findingId}/task-link')
    expect(taskLink).toContain('JOIN projects project ON project.id = task.project_id')
    expect(taskLink).toContain('project.client_id = $2')
    expect(taskLink).toContain(`lifecycle_status = 'actioned'`)
  })
})
