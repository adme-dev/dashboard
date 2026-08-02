import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const configPath = fileURLToPath(new URL('../../nuxt.config.ts', import.meta.url))
const wranglerPath = fileURLToPath(new URL('../../wrangler.toml', import.meta.url))

describe('nearby market runtime configuration', () => {
  it('keeps the server Places key private and defaults discovery off', async () => {
    const source = await readFile(configPath, 'utf8')

    expect(source).toMatch(/googlePlacesServerApiKey:\s*process\.env\.GOOGLE_PLACES_SERVER_API_KEY\s*\|\|\s*''/)
    expect(source).toMatch(/nearbyMarketDiscoveryEnabled:\s*process\.env\.NEARBY_MARKET_DISCOVERY_ENABLED\s*===\s*'true'/)
    expect(source).toMatch(/public:\s*\{[\s\S]*nearbyMarketDiscoveryEnabled:[\s\S]*googleMapsBrowserApiKey:[\s\S]*googleMapsMapId:/)
    expect(source).not.toMatch(/public:\s*\{[\s\S]*googlePlacesServerApiKey/)
  })

  it('commits the discovery feature flag as dormant without any Maps key values', async () => {
    const source = await readFile(wranglerPath, 'utf8')

    expect(source).toMatch(/^NEARBY_MARKET_DISCOVERY_ENABLED\s*=\s*"false"$/m)
    expect(source).not.toMatch(/^GOOGLE_PLACES_SERVER_API_KEY\s*=/m)
    expect(source).not.toMatch(/^NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY\s*=/m)
  })
})
