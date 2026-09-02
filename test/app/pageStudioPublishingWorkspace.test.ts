import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('Page Studio publishing workspace', () => {
  it('keeps Studio authoring separate from site management', () => {
    const workspace = readFileSync(resolve(root, 'app/components/page-studio/SiteWorkspace.vue'), 'utf8')
    const management = readFileSync(resolve(root, 'app/components/page-studio/PublishingWorkspace.vue'), 'utf8')

    expect(workspace).toContain('label="Manage site"')
    expect(workspace).toContain('label="Launch Studio"')
    expect(management).toContain('Governed publishing')
    expect(management).toContain('Publish approved version')
    expect(management).not.toContain('manifest:')
    expect(management).not.toContain('assets:')
  })

  it('provides the permanent site management route', () => {
    const page = readFileSync(resolve(root, 'app/pages/agency/page-studio/[siteId]/index.vue'), 'utf8')
    expect(page).toContain('PageStudioPublishingWorkspace')
  })
})
