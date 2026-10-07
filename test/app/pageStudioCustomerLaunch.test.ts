// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openCustomerStudio } from '~~/app/utils/pageStudioCustomerLaunch'

afterEach(() => vi.restoreAllMocks())
describe('customer handoff transport', () => {
  it.each([
    { editorOrigin: 'http://editor.example.test' }, { editorOrigin: 'https://editor.example.test/path' },
    { editorOrigin: 'https://user:secret@editor.example.test' }, { editorOrigin: 'javascript:alert(1)' },
    { token: 'bad' }, { expiresAt: 'bad' }, { expiresAt: new Date(0).toISOString() }
  ])('refuses invalid or expired transport data %j', (change) => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    expect(() => openCustomerStudio({ token: 'a'.repeat(64), editorOrigin: 'https://editor.example.test', expiresAt: new Date(Date.now() + 60000).toISOString(), ...change })).toThrow()
    expect(submit).not.toHaveBeenCalled()
    expect(document.querySelector('form')).toBeNull()
  })
  it('cleans up the credential if navigation throws', () => {
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {
      throw new Error('navigation blocked')
    })
    expect(() => openCustomerStudio({ token: 'a'.repeat(64), editorOrigin: 'https://editor.example.test', expiresAt: new Date(Date.now() + 60000).toISOString() })).toThrow()
    expect(document.querySelector('form')).toBeNull()
  })
})
