import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workspace = readFileSync('app/components/page-studio/PagesWorkspace.vue', 'utf8')
const settings = readFileSync('app/components/page-studio/PageSettingsPanel.vue', 'utf8')
const redirects = readFileSync('app/components/page-studio/RedirectManager.vue', 'utf8')
const publishing = readFileSync('app/components/page-studio/PublishingWorkspace.vue', 'utf8')
const launcher = readFileSync('app/composables/usePageStudioLauncher.ts', 'utf8')

describe('Page Studio Pages workspace', () => {
  it('mounts permanent page management in the site workspace', () => {
    expect(publishing).toContain('<PageStudioPagesWorkspace :site-id="siteId" />')
    expect(publishing).toContain('@click="openStudio"')
    expect(publishing).not.toContain('/edit')
    expect(launcher).toContain(`window.open('about:blank', targetName)`)
    expect(launcher).toContain(`form.method = 'POST'`)
    expect(launcher).toContain('form.target = targetName')
    expect(launcher).toContain('/editor-sessions')
  })

  it('uses the governed revisioned document endpoint', () => {
    expect(workspace).toContain('/document`')
    expect(workspace).toContain('method: \'PUT\'')
    expect(workspace).toContain('expectedRevision: data.value.revision')
    expect(workspace).toContain('<PageStudioRedirectManager')
  })

  it('exposes required CMS controls using Nuxt UI', () => {
    for (const label of ['Add top-level page', 'Add subpage', 'Duplicate selected', 'Save pages']) {
      expect(workspace).toContain(label)
    }
    for (const label of ['Page title', 'Status', 'Parent page', 'Route segment', 'SEO title', 'Meta description', 'Header', 'Footer']) {
      expect(settings).toContain(`label="${label}"`)
    }
    expect(redirects).toContain('<UModal')
    expect(redirects).toContain('<UFormField')
    expect(redirects).not.toMatch(/<(?:input|select|button)\b/)
  })
})
