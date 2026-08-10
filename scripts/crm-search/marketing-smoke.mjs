import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const PUBLIC_CLAIM_SURFACES = [
  'app/pages/features/index.vue',
  'app/pages/features/[slug].vue',
  'app/components/MarketingNav.vue',
  'app/pages/platform/ai.vue',
  'app/pages/resources/ai-automation.vue',
  'app/pages/resources/integrations.vue',
  'app/pages/resources/index.vue',
  'app/pages/landing.vue',
  'app/pages/ai-training.vue',
  'app/pages/index.vue',
  'app/pages/creativity.vue',
  'app/pages/privacy.vue',
  'app/_drafts/pricing-self-service.vue'
]

const EXPECTED_CAPABILITY = Object.freeze({
  visibleRanking: 'keyword',
  semanticSurface: 'agency_ai_assist',
  defaultMode: 'off',
  portalSemanticRanking: false,
  freshness: 'after_confirmed_indexing'
})

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
  /tasks, clients, briefs, and knowledge base entries are embedded as vectors/i
]

const CLAIM_LINE_PATTERN = /semantic|vectorize|vector[- ]based|vector database|embeddings?|embedded (?:as vectors|with Workers AI|in(?:to)? (?:a |the )?vector)|hybrid (?:search|retrieval)|keyword search|natural-language retrieval|index (?:fresh|current)|indexing|CRM_SEARCH_MARKETING_COPY/i

const ALWAYS_DARK_SURFACES = new Map([
  ['app/components/MarketingNav.vue', /<nav class="[^"]*bg-\[#121317\]/],
  ['app/pages/landing.vue', /min-h-screen bg-\[#0a0a0a\]/],
  ['app/pages/ai-training.vue', /min-h-screen bg-\[#0a0a0a\]/]
])

function fail(message) {
  throw new Error(`CRM search marketing smoke failed: ${message}`)
}

function read(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

const manifestSource = read('app/utils/marketingClaimManifest.ts')
const manifestModuleUrl = `data:text/javascript;base64,${Buffer.from(manifestSource).toString('base64')}`
const { CRM_SEARCH_MARKETING_CLAIMS, CRM_SEARCH_MARKETING_COPY } = await import(manifestModuleUrl)

for (const [field, expected] of Object.entries(EXPECTED_CAPABILITY)) {
  if (CRM_SEARCH_MARKETING_CLAIMS[field] !== expected) {
    fail(`manifest ${field} must be ${JSON.stringify(expected)}`)
  }
}

if (CRM_SEARCH_MARKETING_CLAIMS.semanticEntitySet.join(',') !== 'person,company,opportunity') {
  fail('semantic entity set must remain person, company, and opportunity')
}

const sources = PUBLIC_CLAIM_SURFACES.map(sourcePath => ({ sourcePath, source: read(sourcePath) }))
const combinedSource = sources.map(({ source }) => source).join('\n')

for (const forbidden of FORBIDDEN_PRESENT_TENSE_CLAIMS) {
  if (forbidden.test(combinedSource)) fail(`stale claim survived: ${forbidden.source}`)
}

const mappedSources = new Set(CRM_SEARCH_MARKETING_CLAIMS.claims.map(claim => claim.sourcePath))
for (const { sourcePath, source } of sources) {
  if (!mappedSources.has(sourcePath)) fail(`${sourcePath} has no claim-manifest entry`)

  const claimLines = source
    .split('\n')
    .map((text, index) => ({ line: index + 1, text: text.trim() }))
    .filter(({ text }) => CLAIM_LINE_PATTERN.test(text)
      && !text.startsWith('import ')
      && !text.startsWith('<!--')
      && !text.startsWith('\'semantic-search\':')
      && !text.startsWith('slug:')
      && !text.startsWith('<section'))

  for (const occurrence of claimLines) {
    const mapped = CRM_SEARCH_MARKETING_CLAIMS.claims.some(claim =>
      claim.sourcePath === sourcePath && occurrence.text.includes(claim.sourceNeedle)
    )
    if (!mapped) fail(`${sourcePath}:${occurrence.line} has an unmapped claim`)
  }

  const alwaysDarkContract = ALWAYS_DARK_SURFACES.get(sourcePath)
  if (alwaysDarkContract) {
    if (!alwaysDarkContract.test(source) || !/class="[^"]*text-white/.test(source)) {
      fail(`${sourcePath} no longer satisfies its explicit always-dark contract`)
    }
  } else if (!/class="[^"]*dark:/.test(source)) {
    fail(`${sourcePath} has no light/dark theme treatment`)
  }
}

const renderedContract = [
  CRM_SEARCH_MARKETING_COPY.featureDescription,
  ...CRM_SEARCH_MARKETING_COPY.featureDetails.map(detail => detail.content)
].join('\n')

for (const required of [
  /visible CRM search[^.]*keyword/i,
  /portal[^.]*keyword/i,
  /semantic[^.]*agency.assistant/i,
  /off by default/i,
  /confirmed index/i,
  /portal semantic ranking is unavailable/i
]) {
  if (!required.test(renderedContract)) fail(`central copy is missing ${required.source}`)
}

console.log(`CRM search marketing smoke passed: ${sources.length} surfaces, ${CRM_SEARCH_MARKETING_CLAIMS.claims.length} mapped claims, ${FORBIDDEN_PRESENT_TENSE_CLAIMS.length} negative assertions`)
