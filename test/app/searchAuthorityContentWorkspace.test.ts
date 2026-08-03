import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const library = () => readFileSync('app/components/search-authority/ContentLibrary.vue', 'utf8')
const editor = () => readFileSync('app/components/search-authority/ContentEditorSlideover.vue', 'utf8')
const approval = () => readFileSync('app/components/search-authority/ContentApprovalPanel.vue', 'utf8')

describe('Search Authority content workspace', () => {
  it('uses structured Nuxt UI fields for source-backed drafts', () => {
    expect(editor()).toContain('<USlideover')
    expect(editor()).toContain('<UFormField')
    expect(editor()).toContain('Interview notes')
    expect(editor()).toContain('Claims and sources')
    expect(editor()).toContain('Disclaimer')
    expect(editor()).not.toMatch(/<input\b|<textarea\b|<select\b/)
  })

  it('creates versions rather than editing approved content and gates publish', () => {
    expect(library()).toContain('/versions')
    expect(library()).toContain('/publish')
    expect(library()).toContain('method: \'POST\'')
    expect(approval()).toContain('Create a new version')
    expect(approval()).toContain('status === \'approved\'')
    expect(approval()).toContain('Publish is enabled only after explicit approval')
  })
})
