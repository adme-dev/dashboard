// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { inlineMergeEditorHtml, insertInlineMergeToken, inlineSelectionOffsets, sanitizeInlineHtml, serializeInlineMergeHtml } from '../../app/utils/edmInlineText'

const token = '{{custom_offer | Ask our team}}'

describe('atomic editing merge chips', () => {
  it('hydrates only supported text tokens as non-editable chips and roundtrips formatting', () => {
    const input = `<b>Hello {{first_name | there}}</b> ${token} {{unsupported}}`
    const editor = inlineMergeEditorHtml(input)
    const root = document.createElement('div')
    root.innerHTML = editor
    expect(root.querySelectorAll('[contenteditable="false"]')).toHaveLength(2)
    expect(root.querySelector('[data-merge]')?.textContent).toBe('{{first_name | there}}')
    expect(serializeInlineMergeHtml(editor)).toBe(input)
  })
  it('roundtrips quoted fallbacks through escaped chip metadata', () => {
    const token = `{{custom_offer | We're offering "more"}}`
    expect(serializeInlineMergeHtml(inlineMergeEditorHtml(token))).toBe(token)
  })
  it('keeps existing safe text presentation when hydrating without persisting editor markup', () => {
    const html = '<p style="text-align:center"><span style="color:red">Hello {{first_name | there}}</span></p>'
    const editor = inlineMergeEditorHtml(html)
    expect(editor).toContain('<p style="text-align:center">')
    expect(editor).toContain('<span style="color:red">')
    expect(editor).toContain('contenteditable="false"')
  })
  it('allows only validated data-merge identity and rebuilds inert text without trusting pasted labels', () => {
    const html = `<span data-merge="${token}" onclick="evil()" style="color:red" contenteditable="true"><img src=x onerror=evil()>fake</span>`
    expect(sanitizeInlineHtml(html)).toBe(`<span data-merge="${token}">${token}</span>`)
    expect(serializeInlineMergeHtml(html)).toBe(token)
    expect(sanitizeInlineHtml('<span data-merge="{{location}}" data-x="1" onclick="x()">label</span>')).toBe('<span>label</span>')
  })
  it('does not hydrate tokens in attributes or foreign-content subtrees', () => {
    const html = inlineMergeEditorHtml('<a href="https://example.com/{{first_name}}">link</a><svg><text>{{name}}</text></svg>')
    expect(html).not.toContain('data-merge')
    expect(html).not.toContain('svg')
  })
  it('replaces selected text using a bookmark after a blur/re-render, then serializes to a token', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    root.innerHTML = 'Hello <b>world</b>'
    const range = document.createRange()
    range.selectNodeContents(root.querySelector('b')!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const offsets = inlineSelectionOffsets(root)
    root.innerHTML = 'Hello <b>world</b>'
    insertInlineMergeToken(root, token, offsets)
    expect(serializeInlineMergeHtml(root.innerHTML)).toContain(token)
    expect(root.textContent).not.toContain('world')
    root.remove()
  })
  it('deletes a selected chip as one unit, with no metadata in persisted HTML', () => {
    const root = document.createElement('div')
    root.innerHTML = inlineMergeEditorHtml(`Hi ${token}!`)
    const chip = root.querySelector('[data-merge]')!
    const range = document.createRange()
    range.selectNode(chip)
    range.deleteContents()
    expect(serializeInlineMergeHtml(root.innerHTML)).toBe('Hi !')
  })
})
