import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { compileGtmTemplate } from '../../../server/utils/tracking/gtmTemplateRegistry'
import {
  assertManagedGtmUpdate,
  verifyGtmManagedEntity,
  assertGtmOnlyManagedChanges
} from '../../../server/utils/tracking/gtmTypedChanges'

describe('bounded GTM contracts', () => {
  it('matches all three pinned Google-authored fixtures', () => {
    const fixtures = JSON.parse(
      readFileSync('test/fixtures/gtm/google-authored-templates.json', 'utf8')
    ).fixtures
    expect(fixtures).toHaveLength(3)
    for (const f of fixtures)
      expect(compileGtmTemplate(f.input)).toEqual({
        kind: 'tags',
        body: f.body
      })
  })
  it('compiles Google tag as ordinary googtag/tagId', () => {
    expect(
      compileGtmTemplate({
        templateId: 'tag.google.v1',
        name: 'Google tag',
        tagId: 'GT-ABC123',
        firingTriggerId: ['7']
      })
    ).toEqual({
      kind: 'tags',
      body: {
        name: 'Google tag',
        type: 'googtag',
        parameter: [{ type: 'template', key: 'tagId', value: 'GT-ABC123' }],
        firingTriggerId: ['7']
      }
    })
  })
  it('compiles exact GA4 event nesting with measurementIdOverride', () => {
    const v = compileGtmTemplate({
      templateId: 'tag.ga4_event.v1',
      name: 'View',
      eventName: 'view_item',
      measurementIdOverride: 'G-ABC123',
      firingTriggerId: ['7'],
      eventParameters: [{ name: 'content_id', value: 'item' }]
    })
    expect(v.body.parameter[1].key).toBe('measurementIdOverride')
    expect(v.body.parameter[2]).toEqual({
      type: 'list',
      key: 'eventSettingsTable',
      list: [
        {
          type: 'map',
          map: [
            { type: 'template', key: 'parameter', value: 'content_id' },
            { type: 'template', key: 'parameterValue', value: 'item' }
          ]
        }
      ]
    })
  })
  it('rejects unknown settings, scripts, legacy config and unresolved variables', () => {
    for (const value of [
      { templateId: 'tag.ga4_config.v1', name: 'x' },
      {
        templateId: 'tag.google.v1',
        name: 'x',
        tagId: '{{Secret}}',
        firingTriggerId: ['7']
      },
      {
        templateId: 'tag.google.v1',
        name: 'x',
        tagId: 'G-ABC',
        firingTriggerId: ['7'],
        html: '<script>'
      }
    ])
      expect(() => compileGtmTemplate(value)).toThrow()
  })
  it('never drops unreviewed fields on PUT', () => {
    const body = compileGtmTemplate({
      templateId: 'tag.google.v1',
      name: 'x',
      tagId: 'G-ABC',
      firingTriggerId: ['7']
    }).body
    expect(() =>
      assertManagedGtmUpdate(
        { ...body, consentSettings: { consentStatus: 'needed' } },
        body
      )
    ).toThrow()
    expect(() =>
      assertManagedGtmUpdate(
        {
          ...body,
          parameter: [
            ...body.parameter,
            { type: 'template', key: 'unreviewed', value: 'x' }
          ]
        },
        body
      )
    ).toThrow()
  })
  it('detects altered read-back parameters and duplicate keys', () => {
    const body = compileGtmTemplate({
      templateId: 'tag.google_ads_conversion.v1',
      name: 'Sale',
      conversionId: '123',
      conversionLabel: 'label',
      firingTriggerId: ['7'],
      enableConversionLinker: true
    }).body
    expect(body.parameter.at(-1).value).toBe('true')
    expect(() =>
      verifyGtmManagedEntity(body, {
        ...body,
        parameter: [...body.parameter, body.parameter[0]]
      })
    ).toThrow()
    expect(() =>
      verifyGtmManagedEntity(body, { ...body, type: 'html' })
    ).toThrow()
  })
  it('rejects unrelated zone and future entity collections inherited by a version', () => {
    const base: any = { path: 'accounts/1/containers/2/versions/3' }
    for (const field of ['zone', 'futureProviderCollection']) {
      expect(() =>
        assertGtmOnlyManagedChanges(
          base,
          { ...base, [field]: [{ name: 'Unreviewed' }] },
          []
        )
      ).toThrow('Unreviewed')
    }
  })
  it('rejects an isolated workspace that inherited unreviewed non-live changes', () => {
    const base: any = {
      path: 'accounts/1/containers/2/versions/3',
      tag: [{ tagId: '1', name: 'Original', type: 'googtag' }]
    }
    const version: any = {
      ...base,
      tag: [{ tagId: '1', name: 'Unreviewed change', type: 'googtag' }],
      folder: [{ folderId: '9', name: 'Reviewed' }]
    }
    expect(() =>
      assertGtmOnlyManagedChanges(base, version, [
        {
          action: 'create',
          kind: 'folders',
          id: '9',
          body: { name: 'Reviewed' }
        }
      ])
    ).toThrow('Unreviewed')
  })
})
