import { beforeEach, describe, expect, it } from 'vitest'

import {
  getCachedCfBinding,
  getCachedCfObjectBinding,
  setCachedCfBindings
} from '../../../server/utils/cfBindings'

describe('Cloudflare deploy-time primitive cache', () => {
  beforeEach(() => {
    setCachedCfBindings({})
  })

  it('retains primitive configuration without retaining native object bindings', () => {
    const bucket = { delete: () => undefined }

    setCachedCfBindings({
      APP_URL: 'https://app.xeroflow.test',
      MEDIA_BUCKET: bucket
    })

    expect(getCachedCfBinding('APP_URL')).toBe('https://app.xeroflow.test')
    expect(getCachedCfObjectBinding('MEDIA_BUCKET')).toBeUndefined()
  })
})
