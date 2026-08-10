import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import typescript from 'typescript'

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

const EXPECTED_SURFACE_CEILINGS = Object.freeze({
  agency_global: 'shadow',
  portal_global: 'off',
  agency_ai: 'assist'
})

const DYNAMIC_FEATURE_ROUTE_CONTRACTS = new Map([
  ['features.detail.crm_search_title', '/features/semantic-search'],
  ['features.detail.crm_search_agency', '/features/semantic-search'],
  ['features.detail.crm_search_assist', '/features/semantic-search'],
  ['features.detail.crm_search_sections_agency', '/features/semantic-search'],
  ['features.detail.crm_search_sections_portal', '/features/semantic-search'],
  ['features.detail.crm_search_sections_assist', '/features/semantic-search'],
  ['features.detail.ai_chat_context', '/features/ai-chat'],
  ['features.detail.intent_classifier', '/features/intent-classification'],
  ['features.detail.smart_watch_summary', '/features/smart-watch'],
  ['features.detail.smart_watch_title', '/features/smart-watch'],
  ['features.detail.smart_watch_subscription', '/features/smart-watch'],
  ['features.detail.composite_summary', '/features/composite-scoring'],
  ['features.detail.composite_formula', '/features/composite-scoring'],
  ['features.detail.composite_profiles', '/features/composite-scoring'],
  ['features.detail.semantic_reranking_title', '/features/composite-scoring'],
  ['features.detail.composite_reranking', '/features/composite-scoring'],
  ['features.detail.knowledge_upload', '/features/knowledge-base'],
  ['features.detail.vectorize_deduplication_title', '/features/knowledge-base'],
  ['features.detail.knowledge_deduplication', '/features/knowledge-base'],
  ['features.detail.knowledge_lifecycle', '/features/knowledge-base'],
  ['features.detail.rate_card_context', '/features/rate-cards']
])

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
const manifestJavaScript = typescript.transpileModule(manifestSource, {
  compilerOptions: {
    module: typescript.ModuleKind.ESNext,
    target: typescript.ScriptTarget.ES2022
  }
}).outputText
const manifestModuleUrl = `data:text/javascript;base64,${Buffer.from(manifestJavaScript).toString('base64')}`
const { CRM_SEARCH_MARKETING_CLAIMS, CRM_SEARCH_MARKETING_COPY } = await import(manifestModuleUrl)

for (const [field, expected] of Object.entries(EXPECTED_CAPABILITY)) {
  if (CRM_SEARCH_MARKETING_CLAIMS[field] !== expected) {
    fail(`manifest ${field} must be ${JSON.stringify(expected)}`)
  }
}

if (CRM_SEARCH_MARKETING_CLAIMS.semanticEntitySet.join(',') !== 'person,company,opportunity') {
  fail('semantic entity set must remain person, company, and opportunity')
}

for (const [surface, ceiling] of Object.entries(EXPECTED_SURFACE_CEILINGS)) {
  if (CRM_SEARCH_MARKETING_CLAIMS.surfaceCeilings[surface] !== ceiling) {
    fail(`${surface} must have exact ${ceiling} ceiling`)
  }
}

for (const claim of CRM_SEARCH_MARKETING_CLAIMS.claims) {
  const exactCeiling = EXPECTED_SURFACE_CEILINGS[claim.userSurface]
  if (exactCeiling && claim.maximumMode !== exactCeiling) {
    fail(`${claim.key} exceeds ${claim.userSurface} ceiling`)
  }
}

const dynamicClaims = CRM_SEARCH_MARKETING_CLAIMS.claims.filter(claim => claim.sourcePath === 'app/pages/features/[slug].vue')
if (dynamicClaims.length !== DYNAMIC_FEATURE_ROUTE_CONTRACTS.size) {
  fail('dynamic feature claim inventory is incomplete')
}
for (const claim of dynamicClaims) {
  if (claim.route !== DYNAMIC_FEATURE_ROUTE_CONTRACTS.get(claim.key) || !claim.routeNeedle) {
    fail(`${claim.key} is not bound to its actual dynamic route`)
  }
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
