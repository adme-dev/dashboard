import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const MANIFEST_PATH = 'app/utils/marketingClaimManifest.ts'
const SMOKE_PATH = 'scripts/crm-search/marketing-smoke.mjs'

const PUBLIC_CLAIM_SURFACES = [
  { sourcePath: 'app/pages/features/index.vue', route: '/features' },
  { sourcePath: 'app/pages/features/[slug].vue', route: '/features/semantic-search' },
  { sourcePath: 'app/components/MarketingNav.vue', route: 'component:MarketingNav' },
  { sourcePath: 'app/pages/platform/ai.vue', route: '/platform/ai' },
  { sourcePath: 'app/pages/resources/ai-automation.vue', route: '/resources/ai-automation' },
  { sourcePath: 'app/pages/resources/integrations.vue', route: '/resources/integrations' },
  { sourcePath: 'app/pages/resources/index.vue', route: '/resources' },
  { sourcePath: 'app/pages/landing.vue', route: '/landing' },
  { sourcePath: 'app/pages/ai-training.vue', route: '/ai-training' },
  { sourcePath: 'app/pages/index.vue', route: '/' },
  { sourcePath: 'app/pages/creativity.vue', route: '/creativity' },
  { sourcePath: 'app/pages/privacy.vue', route: '/privacy' },
  { sourcePath: 'app/_drafts/pricing-self-service.vue', route: 'draft:pricing-self-service' }
] as const

const CLAIM_LINE_PATTERN = /semantic|vectorize|vector[- ]based|vector database|embeddings?|embedded (?:as vectors|with Workers AI|in(?:to)? (?:a |the )?vector)|hybrid (?:search|retrieval)|keyword search|natural-language retrieval|index (?:fresh|current)|indexing|CRM_SEARCH_MARKETING_COPY/i

const FORBIDDEN_PRESENT_TENSE_CLAIMS = [
  /Vectorize-powered search across tasks, clients, briefs, and knowledge base entries/i,
  /semantic search surface what matters before you even think to ask/i,
  /semantic search via Vectorize[^\n]*trained exclusively on your operations/i,
  /every chat, every decision, every workflow pattern makes your AI smarter[^\n]*continuously/i,
  /instant natural-language retrieval/i,
  /keeping the index (?:fresh|current)/i,
  /continuously updated so search results reflect the latest data/i,
  /automatically embedded when created or updated/i,
  /no manual indexing or maintenance required/i,
  /search across all entity types simultaneously/i,
  /hybrid approach delivers better recall than either method alone/i,
  /text embeddings are generated to enable vector-based search across your data/i,
  /tasks, briefs, clients, and spend data/i,
  /tasks, clients, briefs, and knowledge base entries are embedded as vectors/i,
  /Your agency AI, trained on your data/i,
  /XeroFlow learns from your unique workflows, clients, and operations/i,
  /Private, continuous, and entirely under your control/i
] as const

interface MarketingClaimEntry {
  key: string
  sourcePath: string
  route: string
  location: 'rendered_text' | 'seo_description' | 'seo_og_description' | 'navigation' | 'feature_catalog' | 'privacy_disclosure'
  renderedText: string
  routeNeedle?: string
  sourceNeedle: string
  entitySet: readonly string[]
  userSurface: string
  maximumMode: string
  rolloutState: string
}

interface MarketingClaimManifest {
  visibleRanking: string
  semanticSurface: string
  defaultMode: string
  portalSemanticRanking: boolean
  freshness: string
  semanticEntitySet: readonly string[]
  surfaceCeilings: Readonly<Record<'agency_global' | 'portal_global' | 'agency_ai', 'off' | 'shadow' | 'assist'>>
  claims: readonly MarketingClaimEntry[]
  negativeAssertions: readonly { key: string, pattern: string }[]
}

interface MarketingClaimModule {
  CRM_SEARCH_MARKETING_CLAIMS?: MarketingClaimManifest
  assertMarketingClaimSurfaceCeilings?: (claims: readonly Pick<MarketingClaimEntry, 'key' | 'userSurface' | 'maximumMode'>[]) => void
}

async function loadManifestModule(): Promise<MarketingClaimModule> {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing checked marketing claim manifest: ${MANIFEST_PATH}`)
  }

  const manifestUrl = pathToFileURL(MANIFEST_PATH).href
  return await import(/* @vite-ignore */ manifestUrl) as MarketingClaimModule
}

async function loadManifest(): Promise<MarketingClaimManifest> {
  const loaded = await loadManifestModule()

  if (!loaded.CRM_SEARCH_MARKETING_CLAIMS) {
    throw new Error('marketingClaimManifest.ts must export CRM_SEARCH_MARKETING_CLAIMS')
  }

  return loaded.CRM_SEARCH_MARKETING_CLAIMS
}

function readPublicSources() {
  return PUBLIC_CLAIM_SURFACES.map(surface => ({
    ...surface,
    source: readFileSync(surface.sourcePath, 'utf8')
  }))
}

describe('CRM search public claim manifest', () => {
  it('pins the approved capability ceiling and freshness boundary', async () => {
    const manifest = await loadManifest()

    expect(manifest).toMatchObject({
      visibleRanking: 'keyword',
      semanticSurface: 'agency_ai_assist',
      defaultMode: 'off',
      portalSemanticRanking: false,
      freshness: 'after_confirmed_indexing',
      semanticEntitySet: ['person', 'company', 'opportunity'],
      surfaceCeilings: {
        agency_global: 'shadow',
        portal_global: 'off',
        agency_ai: 'assist'
      }
    })
  })

  it('rejects a claim whose mode exceeds its exact user-surface ceiling', async () => {
    const loaded = await loadManifestModule()
    const assertSurfaceCeilings = loaded.assertMarketingClaimSurfaceCeilings

    expect(assertSurfaceCeilings).toBeTypeOf('function')
    expect(() => assertSurfaceCeilings?.([
      { key: 'agency-visible-assist', userSurface: 'agency_global', maximumMode: 'assist' },
      { key: 'portal-shadow', userSurface: 'portal_global', maximumMode: 'shadow' },
      { key: 'agency-ai-assist', userSurface: 'agency_ai', maximumMode: 'assist' }
    ])).toThrow(/agency-visible-assist.*agency_global.*shadow|portal-shadow.*portal_global.*off/i)
  })

  it('splits composite feature copy across the agency, portal, and assistant ceilings', async () => {
    const manifest = await loadManifest()
    const featureClaims = manifest.claims.filter(claim => claim.key.startsWith('features.catalogue.crm_search'))
    const detailClaims = manifest.claims.filter(claim => claim.key.startsWith('features.detail.crm_search'))

    expect(featureClaims.map(claim => [claim.userSurface, claim.maximumMode])).toEqual([
      ['agency_global', 'shadow'],
      ['agency_ai', 'assist']
    ])
    expect(new Set(detailClaims.map(claim => `${claim.userSurface}:${claim.maximumMode}`))).toEqual(new Set([
      'agency_global:shadow',
      'portal_global:off',
      'agency_ai:assist'
    ]))
  })

  it('removes every known broad, automatic, continuous, or instant claim', () => {
    const publicSource = readPublicSources().map(({ source }) => source).join('\n')
    const survivingClaims = FORBIDDEN_PRESENT_TENSE_CLAIMS
      .filter(pattern => pattern.test(publicSource))
      .map(pattern => pattern.source)

    expect(survivingClaims).toEqual([])
  })

  it('maps every public semantic, vector, hybrid, keyword, and indexing occurrence', async () => {
    const manifest = await loadManifest()
    const mappedSources = new Set(manifest.claims.map(claim => claim.sourcePath))

    expect(new Set(manifest.claims.map(claim => claim.key)).size).toBe(manifest.claims.length)
    expect(manifest.negativeAssertions.length).toBeGreaterThanOrEqual(FORBIDDEN_PRESENT_TENSE_CLAIMS.length)

    for (const surface of readPublicSources()) {
      const claimLines = surface.source
        .split('\n')
        .map((text, index) => ({ line: index + 1, text: text.trim() }))
        .filter(({ text }) => CLAIM_LINE_PATTERN.test(text)
          && !text.startsWith('import ')
          && !text.startsWith('<!--')
          && !text.startsWith('\'semantic-search\':')
          && !text.startsWith('slug:')
          && !text.startsWith('<section'))

      expect(mappedSources, `${surface.sourcePath} has no manifest entry`).toContain(surface.sourcePath)

      for (const occurrence of claimLines) {
        const mapped = manifest.claims.some(claim =>
          claim.sourcePath === surface.sourcePath
          && occurrence.text.includes(claim.sourceNeedle)
        )
        expect(mapped, `${surface.sourcePath}:${occurrence.line} is not mapped: ${occurrence.text}`).toBe(true)
      }
    }
  })

  it('keeps each claim bounded by route, field, entities, surface, mode, and rollout', async () => {
    const manifest = await loadManifest()
    const expectedRoutes = new Map(PUBLIC_CLAIM_SURFACES.map(surface => [surface.sourcePath, surface.route]))

    for (const claim of manifest.claims) {
      if (claim.sourcePath === 'app/pages/features/[slug].vue') {
        expect(claim.route).toMatch(/^\/features\/[a-z0-9-]+$/)
      } else {
        expect(expectedRoutes.get(claim.sourcePath)).toBe(claim.route)
      }
      expect(claim.renderedText.trim().length).toBeGreaterThan(0)
      expect(claim.sourceNeedle.trim().length).toBeGreaterThan(0)
      expect(claim.entitySet.length).toBeGreaterThan(0)
      expect([
        'agency_global', 'portal_global', 'agency_ai', 'privacy_disclosure',
        'provider_disclosure', 'separate_existing_feature'
      ]).toContain(claim.userSurface)
      expect(['off', 'shadow', 'assist']).toContain(claim.maximumMode)
      expect(['off_by_default', 'controlled', 'unavailable', 'available']).toContain(claim.rolloutState)

      const exactCeiling = manifest.surfaceCeilings[claim.userSurface as keyof typeof manifest.surfaceCeilings]
      if (exactCeiling) expect(claim.maximumMode).toBe(exactCeiling)
    }
  })

  it('ships an offline smoke gate for every public claim surface', () => {
    expect(existsSync(SMOKE_PATH)).toBe(true)

    const smoke = readFileSync(SMOKE_PATH, 'utf8')
    for (const { sourcePath } of PUBLIC_CLAIM_SURFACES) {
      expect(smoke).toContain(sourcePath)
    }

    expect(smoke).toContain('visibleRanking: \'keyword\'')
    expect(smoke).toContain('semanticSurface: \'agency_ai_assist\'')
    expect(smoke).toContain('defaultMode: \'off\'')
    expect(smoke).toContain('portalSemanticRanking: false')
    expect(smoke).toContain('freshness: \'after_confirmed_indexing\'')
    expect(smoke).toContain('FORBIDDEN_PRESENT_TENSE_CLAIMS')
  })
})
