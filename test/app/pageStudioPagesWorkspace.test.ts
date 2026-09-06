import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const workspace = readFileSync('app/components/page-studio/PagesWorkspace.vue', 'utf8')
const settings = readFileSync('app/components/page-studio/PageSettingsPanel.vue', 'utf8')
const redirects = readFileSync('app/components/page-studio/RedirectManager.vue', 'utf8')
const publishing = readFileSync('app/components/page-studio/PublishingWorkspace.client.vue', 'utf8')
const launcher = readFileSync('app/composables/usePageStudioLauncher.ts', 'utf8')

describe('Page Studio Pages workspace', () => {
  it('mounts permanent page management in the site workspace', () => {
    expect(publishing).toContain('<PageStudioPagesWorkspace :site-id="siteId" />')
    expect(publishing).toContain('@click="openStudio"')
    expect(publishing).not.toContain('/edit')
    expect(launcher).toContain(`window.open('about:blank', targetName)`)
    expect(launcher).toContain(`form.method = 'POST'`)
    expect(launcher).toContain(`studioTab.document.createElement('form')`)
    expect(launcher).toContain('studioTab.document.body.append(form)')
    expect(launcher).toContain('/editor-sessions')
  })

  it('submits the session token inside the Studio tab with its opener detached', async () => {
    const dashboard = new Window({ url: 'https://dashboard.example.test/agency/page-studio' })
    const studio = new Window({ url: 'about:blank' })
    const studioTab = {
      document: studio.document,
      opener: dashboard as Window | null,
      closed: false,
      focus: vi.fn(),
      close: vi.fn()
    }
    const open = vi.fn(() => studioTab)
    const fetchSession = vi.fn(async () => ({ session: { token: 'signed-session-fixture' } }))
    const submit = vi.spyOn(studio.HTMLFormElement.prototype, 'submit').mockImplementation(function () {
      expect(this.ownerDocument).toBe(studio.document)
      expect(this.parentElement).toBe(studio.document.body)
      expect(this.method.toUpperCase()).toBe('POST')
      expect(this.action).toBe('https://studio.example.test/launch')
      expect(['', '_self']).toContain(this.target)
      expect(this.querySelector('input[name="token"]')?.getAttribute('value')).toBe('signed-session-fixture')
      expect(studioTab.opener).toBeNull()
      expect(dashboard.document.querySelector('form')).toBeNull()
    })

    try {
      // Compile the real Nuxt composable for its client branch without starting Nuxt.
      const { outputText } = transpileModule(launcher.replaceAll('import.meta.client', 'true'), {
        compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.CommonJS }
      })
      const moduleExports = {} as {
        usePageStudioLauncher: () => { launchPageStudio: (siteId: string) => Promise<void> }
      }
      runInNewContext(outputText, {
        exports: moduleExports,
        useRuntimeConfig: () => ({ public: { pageStudioEditorUrl: 'https://studio.example.test' } }),
        computed: (getter: () => unknown) => ({ get value() { return getter() } }),
        crypto: { randomUUID: () => 'test-id' },
        window: { open },
        document: dashboard.document,
        $fetch: fetchSession,
        URL
      })
      await moduleExports.usePageStudioLauncher().launchPageStudio('site/one')

      expect(open).toHaveBeenCalledWith('about:blank', 'xeroflow-page-studio-test-id')
      expect(fetchSession).toHaveBeenCalledWith(
        '/api/agency/page-studio/sites/site%2Fone/editor-sessions', { method: 'POST' }
      )
      expect(submit).toHaveBeenCalledOnce()
      expect(studioTab.focus).toHaveBeenCalledOnce()
      expect(studioTab.close).not.toHaveBeenCalled()
    } finally {
      submit.mockRestore()
      await studio.happyDOM.close()
      await dashboard.happyDOM.close()
    }
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
