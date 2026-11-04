import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  parseConditionPredicate,
  parseContentCondition,
  resolveConditionalHtml,
  wrapConditionalHtml,
  ConditionDefinitionInputSchema
} from '../../shared/emailRendering/conditions'
import {
  canConditionBlock,
  assertDocumentConditions,
  conditionPolicyLockIds
} from '../../shared/emailRendering/conditionProtection'
import {
  validateEmailDesign,
  assertStaffDesignEdit
} from '../../shared/emailRendering/designContract'
import { applyConditionAction } from '../../shared/emailRendering/conditionActions'
import { renderTemplateDocumentLocally } from '../../workers/email-rendering/src/render/document'

const predicate = { field: 'first_name', op: 'equals', value: 'Alex' } as const
const condition = { version: 1, name: 'Alex offer', predicate } as const
function document() {
  return {
    root: { type: 'EmailLayout', data: { childrenIds: ['row', 'footer'] } },
    row: { type: 'Container', data: { childrenIds: ['text'], props: {} } },
    text: { type: 'Text', data: { props: { text: 'Offer {{first_name}}' } } },
    footer: { type: 'footer', data: { props: { showUnsubscribe: true } } }
  }
}
function canonical() {
  return validateEmailDesign({
    schemaVersion: 1,
    kind: 'template',
    scope: { clientId: '11111111-1111-4111-8111-111111111111' },
    source: { editor: 'composer', nativeArtifact: null },
    blocks: document(),
    rootChildrenIds: ['root'],
    lineage: [],
    dependencies: [],
    moduleInstances: [],
    assets: [],
    policy: { version: 1, editableFields: ['text.data.props.text'] }
  })
}
describe('bounded real-recipient condition language', () => {
  it('evaluates literal operators and all/any; missing values never match', () => {
    expect(evaluateCondition(predicate, { first_name: 'Alex' })).toBe(true)
    expect(evaluateCondition(predicate, { first_name: 'alex' })).toBe(false)
    expect(
      evaluateCondition(
        {
          op: 'all',
          terms: [
            predicate,
            { field: 'email', op: 'contains', value: '@example.invalid' }
          ]
        },
        { first_name: 'Alex', email: 'alex@example.invalid' }
      )
    ).toBe(true)
    expect(
      evaluateCondition(
        { op: 'any', terms: [predicate, { field: 'name', op: 'exists' }] },
        { name: 'Ada' }
      )
    ).toBe(true)
    for (const value of [undefined, ''])
      expect(
        evaluateCondition(
          { field: 'name', op: 'not-equals', value: 'Alex' },
          { name: value }
        )
      ).toBe(false)
    expect(
      evaluateCondition(
        { field: 'name', op: 'not-equals', value: 'Alex' },
        { name: 'Ada' }
      )
    ).toBe(true)
    expect(
      evaluateCondition(
        { field: 'name', op: 'exists' },
        Object.create({ name: 'Inherited' })
      )
    ).toBe(false)
    const accessor = Object.defineProperty({}, 'name', {
      get() {
        throw new Error('must not execute')
      }
    })
    expect(evaluateCondition({ field: 'name', op: 'exists' }, accessor)).toBe(false)
  })
  it('rejects custom fields, traversal, regex, code, unknown keys and invalid bounds', () => {
    for (const field of [
      'custom_offer',
      'profile.name',
      '__proto__',
      'unsubscribe_url'
    ])
      expect(() => parseConditionPredicate({ field, op: 'exists' })).toThrow()
    for (const input of [
      { field: 'email', op: 'regex', value: '.*' },
      { ...predicate, code: 'true' },
      { op: 'all', terms: [] },
      { ...predicate, value: '{{name}}' },
      { ...predicate, value: '<script>' },
      { ...predicate, value: 'x'.repeat(201) },
      { ...predicate, value: '\n' }
    ])
      expect(() => parseConditionPredicate(input)).toThrow()
    let deep: unknown = predicate
    for (let i = 0; i < 4; i++) deep = { op: 'any', terms: [deep] }
    expect(() => parseConditionPredicate(deep)).toThrow()
    expect(() =>
      parseConditionPredicate({ op: 'all', terms: Array(24).fill(predicate) })
    ).toThrow()
    const cycle: Record<string, unknown> = { op: 'any' }
    cycle.terms = [cycle]
    expect(() => parseConditionPredicate(cycle)).toThrow()
    expect(
      ConditionDefinitionInputSchema.safeParse({
        client_id: '11111111-1111-4111-8111-111111111111',
        name: 'Offer',
        predicate
      }).success
    ).toBe(true)
    expect(() =>
      parseContentCondition({ ...condition, definitionId: 'mutable' })
    ).toThrow()
  })
})
describe('compiler-owned frozen condition markers', () => {
  it('matches nested regions and preserves ordinary/Outlook comments byte-for-byte', () => {
    const outlook = '<!--[if mso]><table><![endif]-->'
    const inner = wrapConditionalHtml(
      'inner',
      { ...condition, predicate: { field: 'email', op: 'exists' } },
      'c2'
    )
    const html
      = outlook
        + wrapConditionalHtml(`before${inner}after`, condition, 'c1')
        + '<!--[endif]-->'
    expect(
      resolveConditionalHtml(html, { first_name: 'Alex', email: 'a' })
    ).toBe(outlook + 'beforeinnerafter<!--[endif]-->')
    expect(resolveConditionalHtml(html, { first_name: 'Alex' })).toBe(
      outlook + 'beforeafter<!--[endif]-->'
    )
    expect(resolveConditionalHtml(html, {})).toBe(outlook + '<!--[endif]-->')
    expect(
      resolveConditionalHtml('<p>{{#if name}}raw{{/if}}</p>', {})
    ).toContain('{{#if name}}')
  })
  it('rejects unknown/malformed/unmatched regions even inside a hidden region', () => {
    const html = wrapConditionalHtml('secret', condition, 'c1')
    for (const bad of [
      html.replace(':close:c1', ':close:c2'),
      html.replace(':v1:', ':v2:'),
      html.replace(/:[a-f0-9]+-->/, ':00-->'),
      html.replace('secret', '<!--xf-condition:bad-->'),
      html.slice(0, html.indexOf('<!--xf-condition:v1:close')),
      '<!--xf-condition',
      '<!--xf-condition:v1:close:c1-->'
    ])
      expect(() => resolveConditionalHtml(bad, {})).toThrow(
        'INVALID_CONDITION_MARKER'
      )
  })
})
describe('generated marker resource limits', () => {
  it('rejects repeated IDs, too many markers and excessive nesting', () => {
    const row = wrapConditionalHtml('body', condition, 'c1')
    expect(() => resolveConditionalHtml(row + row, {})).toThrow('INVALID_CONDITION_MARKER')
    const many = Array.from({ length: 301 }, (_, index) => wrapConditionalHtml('body', condition, `c${index + 1}`)).join('')
    expect(() => resolveConditionalHtml(many, {})).toThrow('INVALID_CONDITION_MARKER')
    let nested = 'body'
    for (let index = 1; index <= 33; index++) nested = wrapConditionalHtml(nested, condition, `c${index}`)
    expect(() => resolveConditionalHtml(nested, {})).toThrow('INVALID_CONDITION_MARKER')
  })
})

describe('canonical eligibility and renderer integration', () => {
  it('protects legal/unknown/required/locked/linked blocks and both directions of ancestry', () => {
    const doc = document()
    expect(canConditionBlock(doc, 'row')).toBe(true)
    expect(
      canConditionBlock(
        doc,
        'row',
        conditionPolicyLockIds({
          designerLocks: {
            blockIds: [],
            styleFields: ['text.data.style.color']
          }
        })
      )
    ).toBe(false)
    expect(
      canConditionBlock(
        doc,
        'text',
        conditionPolicyLockIds({
          designerLocks: { blockIds: ['root'], styleFields: [] }
        })
      )
    ).toBe(false)
    expect(canConditionBlock(doc, 'root')).toBe(false)
    expect(canConditionBlock(doc, 'footer')).toBe(false)
    expect(canConditionBlock(doc, 'text', ['row'])).toBe(false)
    doc.text.data.props.text = 'Privacy and {{unsubscribe_url}}'
    expect(canConditionBlock(doc, 'row')).toBe(false)
    doc.text.data.props.text = 'Offer'
    Object.assign(doc.text.data, { mobile: { props: { text: 'Unsubscribe' } } })
    expect(canConditionBlock(doc, 'row')).toBe(false)
    delete (doc.text.data as Record<string, unknown>).mobile
    Object.assign(doc.row.data.props, { brandLocked: true })
    expect(canConditionBlock(doc, 'text')).toBe(false)
    Object.assign(doc.row.data.props, { brandLocked: false })
    Object.assign(doc.text.data.props, { required: true })
    expect(canConditionBlock(doc, 'row')).toBe(false)
  })
  it('copies a condition without widening ordinary staff policy and rejects protected mutations', () => {
    const base = canonical()
    const action = { blockId: 'row', condition } as Parameters<
      typeof applyConditionAction
    >[1]
    const next = applyConditionAction(base, action)
    expect(next.policy).toEqual(base.policy)
    expect(next.blocks.row.data.props?.visibilityCondition).toEqual(condition)
    expect(base.blocks.row.data.props?.visibilityCondition).toBeUndefined()
    expect(() => assertStaffDesignEdit(base, next)).toThrow('EDIT_FORBIDDEN')
    const widened = JSON.parse(JSON.stringify(next))
    widened.policy.editableFields.push('row.data.props.visibilityCondition.predicate.value')
    expect(() => validateEmailDesign(widened)).toThrow('INVALID_DESIGN')
    expect(applyConditionAction(base, { ...action, condition: null })).toEqual(base)
    expect(() =>
      applyConditionAction(base, { ...action, blockId: 'footer' })
    ).toThrow()
    expect(
      applyConditionAction(next, { ...action, condition: null }).blocks.row.data
        .props?.visibilityCondition
    ).toBeUndefined()
    const linked = canonical()
    linked.dependencies = [{ moduleId: 'module', revisionId: 'revision' }]
    linked.moduleInstances = [
      {
        instanceId: 'instance',
        moduleId: 'module',
        revisionId: 'revision',
        rootBlockIds: ['row'],
        overrides: {}
      }
    ]
    expect(() => applyConditionAction(linked, action)).toThrow()
  })
  it('retains typed markers without values and evaluates sample values in the private renderer', () => {
    const doc = document()
    Object.assign(doc.row.data.props, { visibilityCondition: condition })
    const frozen = renderTemplateDocumentLocally(doc)
    expect(frozen).toContain('<!--xf-condition:v1:open:')
    expect(frozen).toContain('Offer')
    expect(resolveConditionalHtml(frozen, {})).not.toContain('Offer')
    const matching = renderTemplateDocumentLocally(doc, {
      variables: { first_name: 'Alex' }
    })
    expect(matching).toContain('Offer Alex')
    expect(matching).not.toContain('xf-condition:')
    const nonmatching = renderTemplateDocumentLocally(doc, {
      variables: { first_name: 'Ada' }
    })
    expect(nonmatching).not.toContain('Offer')
    expect(nonmatching).toContain('Unsubscribe')
  })
  it('rejects forged authored markers, mobile-only conditions and protected conditions', () => {
    const doc = document()
    Object.assign(doc.footer.data.props, { visibilityCondition: condition })
    expect(() => assertDocumentConditions(doc)).toThrow()
    delete (doc.footer.data.props as Record<string, unknown>)
      .visibilityCondition
    Object.assign(doc.text.data, {
      mobile: { props: { visibilityCondition: condition } }
    })
    expect(() => assertDocumentConditions(doc)).toThrow()
    delete (doc.text.data as Record<string, unknown>).mobile
    doc.text.data.props.text = '<!--xf-condition:v1:close:c1-->'
    expect(() => assertDocumentConditions(doc)).toThrow()
  })
  it('preserves a complete imported document and arbitrary Outlook comments exactly', () => {
    const html = '<!DOCTYPE html>\n<html><head><title>OEM</title></head><body><!--[if mso]><table><![endif]--><p>{{#if name}}source{{/if}}</p><!--[if !mso]><!-->other<!--<![endif]--></body></html>'
    const doc = { root: { type: 'EmailLayout', data: { childrenIds: ['html'] } }, html: { type: 'Html', data: { props: { documentMode: 'email', contents: html } } } }
    expect(renderTemplateDocumentLocally(doc)).toBe(html)
    expect(renderTemplateDocumentLocally(doc, { variables: { first_name: 'Alex' } })).toBe(html)
    expect(canConditionBlock(doc, 'html')).toBe(false)
  })
})
