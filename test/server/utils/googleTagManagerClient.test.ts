import { describe, expect, it } from 'vitest'
import {
  assertGtmAccountPath,
  assertGtmContainerPath,
  assertGtmVersionPath,
  assertGtmWorkspacePath,
  buildXeroFlowGtmEntities,
  versionHasXeroFlowTag,
} from '../../../server/utils/googleTagManagerClient'

describe('googleTagManagerClient', () => {
  it('accepts only canonical GTM resource paths', () => {
    expect(assertGtmAccountPath('/accounts/123/')).toBe('accounts/123')
    expect(assertGtmContainerPath('accounts/123/containers/456')).toBe('accounts/123/containers/456')
    expect(assertGtmWorkspacePath('accounts/123/containers/456/workspaces/7')).toBe('accounts/123/containers/456/workspaces/7')
    expect(assertGtmVersionPath('accounts/123/containers/456/versions/8')).toBe('accounts/123/containers/456/versions/8')
    expect(() => assertGtmContainerPath('https://example.com/containers/1')).toThrow('Invalid GTM container path')
    expect(() => assertGtmWorkspacePath('accounts/1/containers/2/workspaces/3:publish')).toThrow('Invalid GTM workspace path')
  })

  it('builds a stable, idempotency-detectable XeroFlow tag and trigger', () => {
    const entities = buildXeroFlowGtmEntities({
      siteId: '11111111-1111-4111-8111-111111111111',
      siteName: 'Knox LDV',
      snippet: '<script src="https://app.xeroflow.io/track.js" data-key="xf_knox" async></script>',
    })
    expect(entities.marker).toBe('xeroflow:tracking-site:11111111-1111-4111-8111-111111111111:v1')
    expect(entities.trigger.type).toBe('windowLoaded')
    expect(entities.tag.type).toBe('html')
    expect(entities.tag.notes).toBe(entities.marker)
    expect(entities.tag.parameter).toContainEqual({
      type: 'template',
      key: 'html',
      value: '<script src="https://app.xeroflow.io/track.js" data-key="xf_knox" async></script>',
    })
  })

  it('recognises managed tags by marker and legacy/manual tags by write key', () => {
    expect(versionHasXeroFlowTag({
      path: 'accounts/1/containers/2/versions/3',
      accountId: '1',
      containerId: '2',
      containerVersionId: '3',
      tag: [{ name: 'Managed', type: 'html', notes: 'xeroflow:tracking-site:site:v1' }],
    }, 'xeroflow:tracking-site:site:v1', 'xf_site')).toBe(true)

    expect(versionHasXeroFlowTag({
      path: 'accounts/1/containers/2/versions/3',
      accountId: '1',
      containerId: '2',
      containerVersionId: '3',
      tag: [{
        name: 'Manual',
        type: 'html',
        parameter: [{ type: 'template', key: 'html', value: '<script data-key="xf_site"></script>' }],
      }],
    }, 'missing-marker', 'xf_site')).toBe(true)
  })
})
