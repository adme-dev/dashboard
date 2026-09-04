import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const retiredBuilderFiles = [
  'app/components/page-studio/BuilderCanvas.vue',
  'app/components/page-studio/BuilderCollectionSection.vue',
  'app/components/page-studio/BuilderContactSection.vue',
  'app/components/page-studio/BuilderFaqSection.vue',
  'app/components/page-studio/BuilderShell.client.vue',
  'app/components/page-studio/BuilderSiteFooter.vue',
  'app/components/page-studio/BuilderSiteHeader.vue',
  'app/components/page-studio/TemplateApplyModal.vue',
  'app/components/page-studio/TemplateLibrarySlideover.vue',
]

describe('Page Studio editor source-of-truth boundary', () => {
  it('does not ship the retired dashboard-local visual builder', () => {
    for (const file of retiredBuilderFiles) {
      expect(existsSync(file), `${file} must remain retired`).toBe(false)
    }
  })

  it('keeps the old edit URL as a signed canonical Studio launcher', () => {
    const route = readFileSync('app/pages/agency/page-studio/[siteId]/edit.vue', 'utf8')

    expect(route).toContain('/editor-sessions')
    expect(route).toContain("form.action = `${editorOrigin}/launch`")
    expect(route).toContain('token.value = response.session.token')
    expect(route).not.toContain('PageStudioBuilder')
    expect(route).not.toContain('BuilderCanvas')
  })

  it('records the standalone editor as the canonical implementation', () => {
    const decision = readFileSync('docs/architecture/page-studio-editor-source-of-truth.md', 'utf8')

    expect(decision).toContain('adme-dev/xeroflow-page-studio')
    expect(decision).toContain('must never implement a second visual website builder')
    expect(decision).toContain('1063ba0002e33b2e19de586f2330b4356e51e8f5')
  })
})
