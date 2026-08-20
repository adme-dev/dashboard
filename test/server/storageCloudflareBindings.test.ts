import { afterEach, describe, expect, it } from 'vitest'
import { getCachedCfBinding, setCachedCfBindings } from '~~/server/utils/cfBindings'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

const KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'] as const
const saved = Object.fromEntries(KEYS.map(key => [key, process.env[key]]))

afterEach(() => {
  setCachedCfBindings({})
  for (const key of KEYS) {
    if (saved[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = saved[key]
  }
})

describe('storage Cloudflare primitive bindings', () => {
  it('uses request-cached Pages bindings even when process.env is empty at module import', async () => {
    for (const key of KEYS) Reflect.deleteProperty(process.env, key)
    setCachedCfBindings({
      R2_ACCOUNT_ID: 'pages-account',
      R2_ACCESS_KEY_ID: 'pages-key',
      R2_SECRET_ACCESS_KEY: 'pages-secret',
      R2_BUCKET_NAME: 'agency-files',
      R2_PUBLIC_URL: 'https://files.example.com'
    })

    expect(getCachedCfBinding('R2_ACCOUNT_ID')).toBe('pages-account')
    expect(isStorageConfigured()).toBe(true)
    expect(getPublicUrl('video/source.png')).toBe('https://files.example.com/video/source.png')
    const signed = new URL(await getPresignedDownloadUrl('video/source.png', 60))
    expect(signed.hostname).toBe('agency-files.pages-account.r2.cloudflarestorage.com')
    expect(signed.searchParams.get('X-Amz-Credential')).toContain('pages-key')
  })
})
