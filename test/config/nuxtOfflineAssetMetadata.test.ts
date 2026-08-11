import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadNuxtConfig() {
  vi.stubGlobal('defineNuxtConfig', <T>(config: T) => config)
  vi.resetModules()

  return (await import('../../nuxt.config')).default as {
    fonts?: { provider?: string }
    icon?: {
      serverBundle?: string | {
        collections?: string[]
      }
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Nuxt asset metadata configuration', () => {
  it('resolves fonts and installed icon collections without remote metadata', async () => {
    const config = await loadNuxtConfig()

    expect(config.fonts?.provider).toBe('local')
    expect(config.icon?.serverBundle).toEqual({
      collections: ['lucide', 'simple-icons']
    })
  })
})
