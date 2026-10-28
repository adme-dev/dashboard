import { expect, it } from 'vitest'
import { resolveMarketingProviderConfig } from '~~/server/utils/marketingProviderConfig'

const off = { pmaxProviderWrites: false, pmaxActivation: false, metaAdPublish: false, emailSending: false }
const on = { pmaxProviderWrites: true, pmaxActivation: true, metaAdPublish: true, emailSending: true }
const compact = JSON.stringify(on)
it('defaults to no provider writes and requires PMax write authority before activation', () => {
  expect(resolveMarketingProviderConfig({})).toEqual(off)
  expect(resolveMarketingProviderConfig({ MARKETING_PROVIDER_CONFIG: compact })).toEqual(on)
  expect(resolveMarketingProviderConfig({ MARKETING_PROVIDER_CONFIG: '{"pmaxActivation":true}' })).toEqual(off)
})
it.each(['{', '[]', 'null', 'true', '{"metaAdPublish":"true"}', '{"unknown":true,"metaAdPublish":true}', '{"__proto__":true,"metaAdPublish":true}'])('rejects the entire malformed compact source %s', (value) => {
  expect(resolveMarketingProviderConfig({ MARKETING_PROVIDER_CONFIG: value })).toEqual(off)
})
it.each(['false', '', 'TRUE', '1', null, undefined, true])('retains an explicit legacy kill switch even if malformed: %s', (value) => {
  expect(resolveMarketingProviderConfig({ MARKETING_PROVIDER_CONFIG: compact, GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: value, META_AD_PUBLISH_ENABLED: value, EMAIL_SENDING_ENABLED: value })).toEqual(off)
})
it('honors independent exact legacy true values despite malformed compact settings', () => {
  expect(resolveMarketingProviderConfig({ MARKETING_PROVIDER_CONFIG: 'broken', GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true', GOOGLE_PMAX_ACTIVATION_ENABLED: 'true', META_AD_PUBLISH_ENABLED: 'true', EMAIL_SENDING_ENABLED: 'true' })).toEqual(on)
  expect(resolveMarketingProviderConfig({ MARKETING_PROVIDER_CONFIG: compact, GOOGLE_PMAX_ACTIVATION_ENABLED: 'false' })).toEqual({ ...on, pmaxActivation: false })
})
it('does not accept inherited environment flags', () => {
  expect(resolveMarketingProviderConfig(Object.create({ GOOGLE_PMAX_PROVIDER_WRITES_ENABLED: 'true', META_AD_PUBLISH_ENABLED: 'true', MARKETING_PROVIDER_CONFIG: compact }))).toEqual(off)
})
