import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadNuxtConfig() {
  vi.stubGlobal('defineNuxtConfig', <T>(config: T) => config)
  vi.resetModules()

  return (await import('../../nuxt.config')).default as {
    fonts?: { provider?: string }
    icon?: {
      provider?: string
      serverBundle?: boolean | string | {
        collections?: string[]
      }
      clientBundle?: {
        scan?: boolean | {
          globInclude?: string[]
          globExclude?: string[]
        }
        sizeLimitKb?: number
      }
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Nuxt asset metadata configuration', () => {
  it('resolves fonts and only source-used icons without remote metadata', async () => {
    const config = await loadNuxtConfig()

    expect(config.fonts?.provider).toBe('local')
    expect(config.icon).toMatchObject({
      provider: 'none',
      serverBundle: false,
      clientBundle: {
        scan: {
          globInclude: [
            '{app,shared}/**',
            'node_modules/@nuxt/ui/dist/**'
          ],
          globExclude: ['node_modules']
        },
        sizeLimitKb: 1024
      }
    })
  })
})
