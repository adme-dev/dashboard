import { randomUUID } from 'node:crypto'
import { access, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { initSync, parse } from 'es-module-lexer'
import { transform } from 'esbuild'

export const WORKER_MODULE_COMPACTION_MARKER = 'XEROFLOW_COMPACT_WORKER_MODULE'

initSync()

const PRECOMPUTED_MANIFEST_PATHS = [
  ['chunks', 'virtual', 'precomputed.mjs'],
  ['chunks', 'build', 'client.precomputed.mjs']
]

export async function resolvePrecomputedManifestPath(workerDirectory) {
  for (const segments of PRECOMPUTED_MANIFEST_PATHS) {
    const candidate = path.join(workerDirectory, ...segments)
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next known Nuxt output location.
    }
  }

  throw new Error(
    '[worker-manifest] Nuxt emitted no recognized precomputed manifest; '
    + 'update the postbuild compactor before deploying'
  )
}

const PRECOMPUTED_RESOURCE_KEYS = [
  'file',
  'resourceType',
  'module',
  'mimeType',
  'preload',
  'prefetch'
]
const PRECOMPUTED_TOP_LEVEL_KEYS = ['dependencies', 'entrypoints', 'modules']
const PRECOMPUTED_DEPENDENCY_KEYS = ['scripts', 'styles', 'preload', 'prefetch']
const PRECOMPUTED_KNOWN_RESOURCE_KEYS = [
  ...PRECOMPUTED_RESOURCE_KEYS,
  'name',
  'src',
  'isEntry',
  'isDynamicEntry',
  'imports',
  'dynamicImports',
  'css',
  'assets'
]

function assertKnownKeys(value, supported, label) {
  const unknown = Object.keys(value || {}).filter(key => !supported.includes(key))
  if (unknown.length) {
    throw new Error(
      `[worker-manifest] Unsupported ${label} field(s): ${unknown.join(', ')}`
    )
  }
}

function compactPrecomputedResource(resource) {
  assertKnownKeys(resource, PRECOMPUTED_KNOWN_RESOURCE_KEYS, 'resource')
  return Object.fromEntries(PRECOMPUTED_RESOURCE_KEYS
    .filter(key => resource[key] !== undefined && resource[key] !== false)
    .map(key => [key, resource[key]]))
}

export function compactPrecomputedManifest(manifest) {
  assertKnownKeys(manifest, PRECOMPUTED_TOP_LEVEL_KEYS, 'top-level')
  const dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies || {}).map(([moduleId, dependency]) => {
      assertKnownKeys(dependency, PRECOMPUTED_DEPENDENCY_KEYS, 'dependency')
      return [
        moduleId,
        Object.fromEntries(
          PRECOMPUTED_DEPENDENCY_KEYS.map(bucket => [
            bucket,
            Object.fromEntries(
              Object.entries(dependency[bucket] || {}).map(([id, resource]) => [
                id,
                compactPrecomputedResource(resource)
              ])
            )
          ])
        )
      ]
    })
  )
  return {
    dependencies,
    entrypoints: manifest.entrypoints || []
  }
}

export function buildCompressedPrecomputedManifestModule(
  manifest,
  { contract = 'loader' } = {}
) {
  if (contract !== 'loader' && contract !== 'value') {
    throw new Error(`[worker-manifest] Unsupported export contract: ${contract}`)
  }

  // Preserve Nuxt's complete data contract. Nuxt 4.5 consumes both
  // `dependencies` and `modules`, and exports the manifest value directly;
  // older releases exported an async loader. Gzip already collapses the
  // repeated resource objects effectively, so field-level elision is both
  // unnecessary and unsafe across framework upgrades.
  const compressed = gzipSync(Buffer.from(JSON.stringify(manifest)), { level: 9 })
  const decoder = `const XEROFLOW_COMPACT_PRECOMPUTED='${compressed.toString('base64')}'
async function decodePrecomputedManifest() {
  const bytes = Uint8Array.from(atob(XEROFLOW_COMPACT_PRECOMPUTED), char => char.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text())
}
`

  if (contract === 'value') {
    return `${decoder}const manifest = await decodePrecomputedManifest()
export default manifest
`
  }

  return `${decoder}let cache
export default async function loadPrecomputedManifest() {
  if (cache) return cache
  cache = await decodePrecomputedManifest()
  return cache
}
`
}

export function buildWorkerDispatcherModule() {
  return `import nitro from './_nitro.js'
import { handleBoardConnect, handleChatConnect, handleBannerConnect } from './_ws.js'

const BOARD_RE = /^\\/api\\/agency\\/boards\\/([^/]+)\\/connect$/
const CHAT_RE = /^\\/api\\/chat\\/([^/]+)\\/connect$/
const BANNER_RE = /^\\/api\\/agency\\/banner-studio\\/([^/]+)\\/connect$/

export default {
  async fetch(request, env, ctx) {
    if (request.headers.get('Upgrade') === 'websocket') {
      try {
        const { pathname } = new URL(request.url)
        const m1 = pathname.match(BOARD_RE)
        if (m1) return await handleBoardConnect(request, env, decodeURIComponent(m1[1]))
        const m2 = pathname.match(CHAT_RE)
        if (m2) return await handleChatConnect(request, env, decodeURIComponent(m2[1]))
        const m3 = pathname.match(BANNER_RE)
        if (m3) return await handleBannerConnect(request, env, decodeURIComponent(m3[1]))
      } catch (err) {
        console.error('[ws-wrap]', err && err.stack || err)
        return new Response('WebSocket handler error', { status: 500 })
      }
    }
    return nitro.fetch(request, env, ctx)
  },
  scheduled(event, env, ctx) {
    if (typeof nitro.scheduled === 'function') {
      return nitro.scheduled(event, env, ctx)
    }
  },
}
`
}

export function compactPlatformImports(source) {
  const removableImports = parse(source)[0]
    .filter(entry => (
      entry.d === -1
      && (entry.n?.startsWith('node:') || entry.n === 'cloudflare:workers')
      && /^import\s*(['"])[^'"]+\1$/.test(source.slice(entry.ss, entry.se))
    ))
    .map(entry => ({
      start: entry.ss,
      end: source[entry.se] === ';' ? entry.se + 1 : entry.se
    }))
    .sort((left, right) => right.start - left.start)

  let compacted = source
  for (const removableImport of removableImports) {
    compacted = compacted.slice(0, removableImport.start)
      + compacted.slice(removableImport.end)
  }
  return compacted
}

function compactDeployedModuleSource(source) {
  return compactPlatformImports(source).replace(
    /\/\/[#@]\s*sourceMappingURL=[^\s]+\s*$/gm,
    ''
  )
}

async function minifyDeployedModuleToFixedPoint(source, sourcefile, keepNames) {
  let compacted = source

  for (let pass = 0; pass < 8; pass += 1) {
    const transformed = await transform(compacted, {
      sourcefile,
      loader: 'js',
      format: 'esm',
      platform: 'neutral',
      target: 'esnext',
      minify: true,
      keepNames,
      legalComments: 'none'
    })
    if (Buffer.byteLength(transformed.code) >= Buffer.byteLength(compacted)) {
      return compacted
    }
    compacted = transformed.code
  }

  throw new Error(
    `[worker-compaction] ${sourcefile} did not converge after 8 shrinking passes`
  )
}

// Audited against the fresh 2026-08-06 production corpus. Each tuple pins one
// generated default-only module and its measured keepNames byte delta. Function
// names remain preserved everywhere else; additions require a new corpus audit
// plus an SSR smoke test when the module is a rendered page chunk.
const NAME_DROPPING_MODULE_AUDIT = [
  ['chunks/build/intelligence-DMrpuEHV.mjs', 2295],
  ['chunks/build/news-8MCDnfLl.mjs', 2145],
  ['chunks/build/governance-BRhMTB2H.mjs', 2019],
  ['chunks/routes/api/xero/reports/pnl-detailed.get.mjs', 393],
  ['chunks/routes/api/xero/overheads.get.mjs', 308],
  ['chunks/routes/api/internal/ai-orchestrator/read-tool.post.mjs', 287],
  ['chunks/routes/api/public/banner-assets/_token_.get.mjs', 260],
  ['chunks/routes/api/xero/invoices.get.mjs', 255],
  ['chunks/routes/api/agency/monday/preview.post.mjs', 211],
  ['chunks/routes/api/kpis-advanced.get.mjs', 209],
  ['chunks/routes/api/office/_officeId/assistant/jobs/_jobId_.patch.mjs', 207],
  ['chunks/routes/api/portal/analytics/trends.get.mjs', 201],
  ['chunks/routes/api/office/_officeId/zones/_zoneId/live-transcription.post.mjs', 198],
  ['chunks/routes/api/agency/social/spend/_id/actions/plan.post.mjs', 189],
  ['chunks/routes/api/xero/reports/cash-flow-insights.get.mjs', 189],
  ['chunks/routes/api/office/_officeId/lobby-requests/_requestId_.patch.mjs', 184],
  ['chunks/routes/api/xero/reports/executive-summary.get.mjs', 184],
  ['chunks/routes/api/xero/get-out/profitability.get.mjs', 182],
  ['chunks/routes/api/leads/webhook/generic/_token_.post.mjs', 179],
  ['chunks/routes/api/xero/expenses.get.mjs', 178],
  ['chunks/routes/api/xero/reports/balance-sheet.get.mjs', 173],
  ['chunks/routes/api/admin/ai/model-ops/invocations.get.mjs', 172],
  ['chunks/routes/api/ai/financial-advisor.get.mjs', 159],
  ['chunks/routes/api/ai/insights.get.mjs', 158],
  ['chunks/routes/api/chat/link-preview.get.mjs', 158],
  ['chunks/routes/api/internal/platform-agents/think/recovery-exhausted.post.mjs', 158],
  ['chunks/routes/api/admin/ai/model-ops/graphify.get.mjs', 155],
  ['chunks/routes/api/xero/bank-monitoring.get.mjs', 154],
  ['chunks/routes/api/xero/reports/client-pnl.get.mjs', 153],
  ['chunks/routes/api/email/templates/test-send.post.mjs', 152],
  ['chunks/routes/api/leads/webhook/google/_token_.post.mjs', 152],
  ['chunks/routes/api/admin/ai/model-ops/model-map.get.mjs', 150],
  ['chunks/routes/api/customers/_contactId/insights.get.mjs', 150],
  ['chunks/routes/api/internal/mcp/call.post.mjs', 150],
  ['chunks/routes/api/agency/social/spend/bank-charges.get.mjs', 147],
  ['chunks/routes/api/xero/reports/aging.get.mjs', 144],
  ['chunks/routes/api/admin/ai/model-ops/copilot.post.mjs', 142],
  ['chunks/routes/api/customers/index.get.mjs', 141],
  ['chunks/routes/api/index2.get.mjs', 141],
  ['chunks/routes/api/internal/workflows/crm/followup-review.post.mjs', 139],
  ['chunks/routes/api/xero/reports/pnl-consolidated.get.mjs', 138],
  ['chunks/routes/api/cashflow.get.mjs', 135],
  ['chunks/routes/api/public/office-lobby/_officeId/request/_requestId/token.post.mjs', 135],
  ['chunks/routes/api/agency/client-portal/clients.get.mjs', 133],
  ['chunks/routes/api/admin/dealer-feeds/_clientId/preview.post.mjs', 131],
  ['chunks/routes/api/agency/agents/think/turn.post.mjs', 131],
  ['chunks/routes/api/agency/social/spend/pacing-review.get.mjs', 130],
  ['chunks/routes/api/agency/hr/reviews/preview.post.mjs', 128],
  ['chunks/routes/api/agency/boards/index.get.mjs', 125],
  ['chunks/routes/api/agency/search-authority/google/callback.get.mjs', 123],
  ['chunks/routes/api/agency/social/publishing/accounts/callback/google-business.get.mjs', 123],
  ['chunks/routes/api/xero/reports/cash-flow-scenarios.get.mjs', 123],
  ['chunks/routes/api/xero/invoice-pipeline.get.mjs', 122],
  ['chunks/routes/api/agency/banner-studio/assets/upload.post.mjs', 121],
  ['chunks/routes/api/agency/monday/backfill-comments.post.mjs', 121],
  ['chunks/routes/api/agency/templates/_id/use.post.mjs', 121],
  ['chunks/routes/api/agency/video/assets/_id/extract.post.mjs', 121],
  ['chunks/routes/api/cron/publish-social-posts.post.mjs', 121],
  ['chunks/routes/api/office/_officeId/meetings/_meetingId/action-items/_actionItemId/task.post.mjs', 121],
  ['chunks/routes/api/agency/social/spend/_id/actions/_actionId/execute.post.mjs', 120],
  ['chunks/routes/api/customers/_contactId/pipeline.get.mjs', 120],
  ['chunks/routes/api/agency/video/generation/jobs.post.mjs', 119],
  ['chunks/routes/api/agency/site-intelligence/market-locations/_id_.put.mjs', 116],
  ['chunks/routes/api/agency/banner-studio/ad-publish/meta.post.mjs', 113],
  ['chunks/routes/api/agency/banner-studio/dissect/_jobId/import.post.mjs', 113],
  ['chunks/routes/api/agency/banner-studio/publish.post.mjs', 113],
  ['chunks/routes/api/cron/sync-social-inbox.post.mjs', 110],
  ['chunks/routes/api/xero/quotes-summary.get.mjs', 110],
  ['chunks/routes/api/agency/social/publishing/accounts/callback/linkedin.get.mjs', 109],
  ['chunks/routes/api/internal/crm-email/inbound.post.mjs', 109],
  ['chunks/routes/api/xero/get-out/quote-velocity.get.mjs', 108],
  ['chunks/routes/api/agency/social/publishing/accounts/callback/youtube.get.mjs', 105],
  ['chunks/routes/api/portal/measurement.get.mjs', 105],
  ['chunks/routes/api/agency/search-authority/index2.post.mjs', 104],
  ['chunks/routes/api/office/_officeId/meetings/_meetingId/invite.post.mjs', 103],
  ['chunks/routes/api/agency/site-intelligence/changes.get.mjs', 101],
  ['chunks/routes/api/agency/measurement/clients/_clientId/google-conversion-actions.get.mjs', 100],
  ['chunks/routes/api/agency/social/inbox/wall.get.mjs', 100],
  ['chunks/routes/api/xero/get-out.get.mjs', 98],
  ['chunks/routes/api/agency/banner-studio/custom-instances/_id/publish.post.mjs', 94],
  ['chunks/routes/api/portal/profile.put.mjs', 93],
  ['chunks/routes/api/office/_officeId/meetings/_meetingId/ask.post.mjs', 92],
  ['chunks/routes/api/agency/site-intelligence/readiness.get.mjs', 91],
  ['chunks/routes/api/agency/social/spend/alerts.get.mjs', 91],
  ['chunks/routes/api/customers/export.csv.get.mjs', 90],
  ['chunks/routes/api/portal/analytics/tracking/summary.get.mjs', 89],
  ['chunks/routes/api/agency/analytics/blended.get.mjs', 88],
  ['chunks/routes/api/agency/analytics/internal-benchmarks.get.mjs', 88],
  ['chunks/routes/api/office/_officeId/recordings.post.mjs', 88],
  ['chunks/routes/api/admin/ai/model-ops/platform-agents-check.post.mjs', 87],
  ['chunks/routes/api/email/subscribers/add-to-list.post.mjs', 87],
  ['chunks/routes/api/office/_officeId/assistant/jobs.post.mjs', 87],
  ['chunks/routes/api/agency/clients/_id_.get.mjs', 86],
  ['chunks/routes/api/portal/analytics/funnel.get.mjs', 86],
  ['chunks/routes/api/customers/_contactId/invoices.get.mjs', 85],
  ['chunks/routes/api/leads/webhook/podium/_token_.post.mjs', 85],
  ['chunks/routes/api/xero/client-concentration.get.mjs', 85],
  ['chunks/routes/api/xero/budgets.get.mjs', 84],
  ['chunks/routes/api/agency/social/publishing/accounts/callback/meta.get.mjs', 83],
  ['chunks/routes/api/office/_officeId/meetings/search.post.mjs', 83],
  ['chunks/routes/api/agency/boards/_id/import.post.mjs', 81],
  ['chunks/routes/api/agency/boards/_id/groups/_groupId/items.get.mjs', 80],
  ['chunks/routes/api/ai/anomalies/_id/narrative.get.mjs', 80],
  ['chunks/routes/api/office/_officeId/token.post.mjs', 79],
  ['chunks/routes/api/agency/social/publishing/accounts/callback/tiktok.get.mjs', 78],
  ['chunks/routes/api/agency/analytics/trends.get.mjs', 74],
  ['chunks/routes/api/portal/analytics/tracking/insights.get.mjs', 73],
  ['chunks/routes/api/admin/sidebar/badge-counts.get.mjs', 71],
  ['chunks/routes/api/notifications/subscriptions.get.mjs', 71],
  ['chunks/routes/api/admin/dealer-feeds/index.post.mjs', 70],
  ['chunks/routes/api/agency/social/inbox/index.post.mjs', 69],
  ['chunks/routes/api/agency/briefs/index2.get.mjs', 68],
  ['chunks/routes/api/xero/get-out/margin.get.mjs', 68],
  ['chunks/routes/api/agency/banner-studio/custom-instances/_id_.patch.mjs', 67],
  ['chunks/routes/api/agency/banner-studio/generate-from-url.post.mjs', 67],
  ['chunks/routes/api/notifications/stream.get.mjs', 123],
  ['chunks/routes/api/admin/ai/governance/releases/_id/pilots.delete.mjs', 84],
  ['chunks/routes/api/cron/observe-and-learn.post.mjs', 82],
  ['chunks/routes/api/admin/ai/governance/pilot-metrics.get.mjs', 80],
  ['chunks/routes/api/admin/ai/governance/readiness.get.mjs', 80],
  ['chunks/routes/api/admin/ai/governance/releases/_id/pilots.post.mjs', 80],
  ['chunks/routes/api/admin/ai/governance/rollout.get.mjs', 80],
  ['chunks/routes/api/admin/ai/governance/draft-packs.post.mjs', 78],
  ['chunks/routes/api/admin/ai/governance/releases/_id/pilots.get.mjs', 78],
  ['chunks/routes/api/admin/ai/governance/evaluations/_id_.get.mjs', 70],
  ['chunks/routes/api/admin/ai/governance/releases/_id_.patch.mjs', 68],
  ['chunks/routes/api/admin/ai/governance/pilot-uat/_id/assessment.post.mjs', 67],
  ['chunks/routes/api/office/_officeId/lobbies/analytics.get.mjs', 67],
  ['chunks/routes/api/public/office-recordings/_token/view.post.mjs', 67],
  ['chunks/routes/api/admin/users/invite.post.mjs', 66],
  ['chunks/routes/api/agency/site-intelligence/gaps.get.mjs', 66],
  ['chunks/routes/api/admin/ai/governance/evaluations/_id/approve.post.mjs', 65],
  ['chunks/routes/api/agency/banner-studio/index6.post.mjs', 65],
  ['chunks/routes/api/agency/social/listening/index.post.mjs', 65],
  ['chunks/routes/api/xero/credit-notes.get.mjs', 65],
  ['chunks/routes/api/xero/get-out/stream.get.mjs', 65],
  ['chunks/routes/api/agency/boards/_id/events.get.mjs', 64],
  ['chunks/routes/api/agency/social/ga4/sync.post.mjs', 64],
  ['chunks/routes/api/cron/send-ad-reports.post.mjs', 64],
  ['chunks/routes/api/agency/search-authority/trust/findings.get.mjs', 63],
  ['chunks/routes/api/agency/social/meta/sync-spend.post.mjs', 62],
  ['chunks/routes/api/cron/feed-post-rules.post.mjs', 62],
  ['chunks/routes/api/leads/forms/discover.get.mjs', 61],
  ['chunks/routes/api/office/_officeId/zones/_zoneId/notes.put.mjs', 61],
  ['chunks/routes/api/xero/get-out/unbilled-wip.get.mjs', 61],
  ['chunks/routes/api/cron/lead-integration-health.post.mjs', 59],
  ['chunks/routes/api/agency/monday/preview-complete.post.mjs', 57],
  ['chunks/routes/api/agency/tracking/analytics/_clientId/funnel.get.mjs', 57],
  ['chunks/routes/api/portal/analytics/export.get.mjs', 57],
  ['chunks/routes/api/admin/ai/governance/index.post.mjs', 56],
  ['chunks/routes/api/agency/social/spend/_id/actions/_actionId/cancel.post.mjs', 56],
  ['chunks/routes/api/office/_officeId/meetings/_meetingId/artifacts/_artifactId_.patch.mjs', 56],
  ['chunks/routes/api/admin/ai/governance/index.get.mjs', 55],
  ['chunks/routes/api/email/campaigns/_id_.patch.mjs', 55],
  ['chunks/routes/api/admin/ai/governance/catalog.get.mjs', 53],
  ['chunks/routes/api/public/contact.post.mjs', 53],
  ['chunks/routes/api/admin/ai/governance/evaluations/_id/run.post.mjs', 52],
  ['chunks/routes/api/admin/ai/governance/pilot-uat.post.mjs', 52],
  ['chunks/routes/api/agency/social/reporting/overview.get.mjs', 52],
  ['chunks/routes/api/crm/index7.post.mjs', 52],
  ['chunks/routes/api/office/_officeId/meetings/_meetingId/artifacts.post.mjs', 51],
  ['chunks/routes/api/agency/social/listening/queries/_id_.patch.mjs', 50],
  ['chunks/routes/api/internal/process-job.post.mjs', 50],
  ['chunks/routes/api/xero/get-out/mrr-movement.get.mjs', 50],
  ['chunks/routes/api/agency/boards/index2.get.mjs', 49],
  ['chunks/routes/api/agency/site-intelligence/overview.get.mjs', 49],
  ['chunks/routes/api/agency/social/spend/_id/actions/_actionId/approve.post.mjs', 49],
  ['chunks/routes/api/agency/tracking/audiences/breakdowns.get.mjs', 49],
  ['chunks/routes/api/agency/tracking/audiences/timeseries.get.mjs', 49],
  ['chunks/routes/api/webhooks/social/meta.post.mjs', 49],
  ['chunks/routes/api/agency/analytics/daily-spend.get.mjs', 48],
  ['chunks/routes/api/agency/social/import/csv.post.mjs', 48],
  ['chunks/routes/api/admin/index4.get.mjs', 47],
  ['chunks/routes/api/client-portal/crm/email-routes/_id/rotate.post.mjs', 47],
  ['chunks/routes/api/client-portal/crm/index6.post.mjs', 47],
  ['chunks/routes/api/crm/email-routes/_id/rotate.post.mjs', 47],
  ['chunks/routes/api/xero/get-out/agi.get.mjs', 47],
  ['chunks/routes/api/customers/_contactId/ad-spend.get.mjs', 46],
  ['chunks/routes/api/agency/social/inbox/conversations/_id/client-approval.post.mjs', 44],
  ['chunks/routes/api/agency/analytics/funnel.get.mjs', 43],
  ['chunks/routes/api/agency/search-authority/sync.post.mjs', 43],
  ['chunks/routes/api/agency/social/inbox/automation-rules/_id_.patch.mjs', 43],
  ['chunks/routes/api/agency/ai/my-assistant.get.mjs', 42],
  ['chunks/routes/api/xero/get-out/clients.get.mjs', 42],
  ['chunks/routes/api/leads/list.get.mjs', 41],
  ['chunks/routes/api/admin/dealer-feeds/_clientId/_feedId/preview.get.mjs', 40],
  ['chunks/routes/api/agency/tracking/audiences/overview.get.mjs', 39],
  ['chunks/routes/api/crm/index6.post.mjs', 39],
  ['chunks/routes/api/portal/index.get.mjs', 39],
  ['chunks/routes/api/xero/repeating-invoices.get.mjs', 38],
  ['chunks/routes/api/agency/search/semantic.get.mjs', 37],
  ['chunks/routes/api/customers/_contactId/work.get.mjs', 37],
  ['chunks/routes/api/agency/social/spend/_id/google-recommendations.get.mjs', 36],
  ['chunks/routes/api/cron/sync-social-metrics.post.mjs', 36],
  ['chunks/routes/api/agency/ai/chat/conversations/_id/confirm-action.post.mjs', 35],
  ['chunks/routes/api/client-portal/crm/index5.post.mjs', 35],
  ['chunks/routes/api/agency/social/feed-items.get.mjs', 34],
  ['chunks/routes/api/leads/stream.get.mjs', 34],
  ['chunks/routes/api/internal/crm-email/process-inbound.post.mjs', 33],
  ['chunks/routes/api/agency/invoicing/coa-codes.get.mjs', 32],
  ['chunks/routes/api/agency/social/google/sync-spend.post.mjs', 32],
  ['chunks/routes/api/agency/social/microsoft_ads/sync-spend.post.mjs', 32],
  ['chunks/routes/api/agency/social/pinterest/sync-spend.post.mjs', 32],
  ['chunks/routes/api/agency/social/snapchat/sync-spend.post.mjs', 32],
  ['chunks/routes/api/agency/social/tiktok/sync-spend.post.mjs', 32],
  ['chunks/routes/api/agency/social/twitter/sync-spend.post.mjs', 32],
  ['chunks/routes/api/crm/tasks/_id_.patch.mjs', 31],
  ['chunks/routes/api/agency/video/assets/_id/publish-social.post.mjs', 30],
  ['chunks/routes/api/cron/site-intelligence.post.mjs', 30],
  ['chunks/routes/api/leads/endpoints/podium.post.mjs', 30],
  ['chunks/routes/api/leads/endpoints/website.post.mjs', 30],
  ['chunks/routes/api/xero/get-out/tax-provision.get.mjs', 30],
  ['chunks/routes/api/agency/banner-studio/export-video.post.mjs', 29],
  ['chunks/routes/api/xero/get-out/ar-collection-forecast.get.mjs', 29],
  ['chunks/routes/api/client-portal/social/reporting/overview.get.mjs', 28],
  ['chunks/routes/api/email/campaigns/_id/send.post.mjs', 28],
  ['chunks/routes/api/agency/social/linkedin/sync-spend.post.mjs', 27],
  ['chunks/routes/api/email/campaigns/_id/materialize.post.mjs', 27],
  ['chunks/routes/api/client-portal/crm/tasks/_id_.patch.mjs', 26],
  ['chunks/routes/api/agency/social/reporting/schedules/_id_.patch.mjs', 24],
  ['chunks/routes/api/xero/invoices/_id_.get.mjs', 24],
  ['chunks/routes/api/portal/ai/confirm-action.post.mjs', 23],
  ['chunks/routes/api/cron/spend-auto-action.post.mjs', 22],
  ['chunks/routes/api/crm/dedupe/suggestions.get.mjs', 20]
]

function shouldKeepDeployedModuleNames(modulePath, source) {
  const portableModulePath = modulePath.split(path.sep).join('/')
  const isAuditedModule = NAME_DROPPING_MODULE_AUDIT.some(
    ([moduleSuffix]) => portableModulePath.endsWith(`/${moduleSuffix}`)
  )
  if (!isAuditedModule) return true
  const exports = parse(source)[1]
  return exports.some(entry => entry.n !== 'default')
}

export async function compactDeployedWorkerModules(directory) {
  let changedFiles = 0
  let savedBytes = 0

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await compactDeployedWorkerModules(entryPath)
      changedFiles += nested.changedFiles
      savedBytes += nested.savedBytes
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue

    const source = await readFile(entryPath, 'utf8')
    const stripped = compactDeployedModuleSource(source)
    const preservesCompactionMarker = (
      source.includes('XEROFLOW_COMPACT_PRECOMPUTED')
      || source.includes(WORKER_MODULE_COMPACTION_MARKER)
    )
    const compacted = preservesCompactionMarker
      ? stripped
      : await minifyDeployedModuleToFixedPoint(
          stripped,
          entry.name,
          shouldKeepDeployedModuleNames(entryPath, stripped)
        )
    if (compacted === source) continue

    await atomicWriteFile(entryPath, compacted)
    changedFiles += 1
    savedBytes += Buffer.byteLength(source) - Buffer.byteLength(compacted)
  }

  return { changedFiles, savedBytes }
}

async function readOriginalSourceMap(modulePath, source) {
  const match = source.match(/\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/m)
  if (match?.[1].startsWith('data:')) return null

  try {
    const sourceMapPath = match
      ? path.resolve(path.dirname(modulePath), decodeURIComponent(match[1]))
      : `${modulePath}.map`
    const sourceMap = await readFile(sourceMapPath, 'utf8')
    JSON.parse(sourceMap)
    return sourceMap
  } catch {
    return null
  }
}

async function atomicWriteFile(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, contents, 'utf8')
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export async function compactWorkerModule(modulePath) {
  const source = await readFile(modulePath, 'utf8')
  const beforeBytes = Buffer.byteLength(source)
  if (source.includes(WORKER_MODULE_COMPACTION_MARKER)) {
    return { changed: false, beforeBytes, afterBytes: beforeBytes }
  }

  const originalSourceMap = await readOriginalSourceMap(modulePath, source)
  const sourceWithoutMapReference = source.replace(
    /\/\/[#@]\s*sourceMappingURL=[^\s]+\s*$/m,
    ''
  )
  const transformSource = originalSourceMap
    ? `${sourceWithoutMapReference}\n//# source${'MappingURL'}=data:application/json;base64,${
      Buffer.from(originalSourceMap).toString('base64')
    }`
    : sourceWithoutMapReference
  const sourceMapName = `${path.basename(modulePath)}.map`
  const result = await transform(transformSource, {
    sourcefile: path.basename(modulePath),
    loader: 'js',
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    minify: true,
    keepNames: true,
    legalComments: 'none',
    banner: `/* ${WORKER_MODULE_COMPACTION_MARKER} */`,
    sourcemap: 'external',
    sourcesContent: true
  })
  const compacted = `${result.code}//# source${'MappingURL'}=${sourceMapName}\n`
  const afterBytes = Buffer.byteLength(compacted)
  if (afterBytes >= beforeBytes) {
    return { changed: false, beforeBytes, afterBytes: beforeBytes }
  }

  await atomicWriteFile(`${modulePath}.map`, result.map)
  await atomicWriteFile(modulePath, compacted)
  return { changed: true, beforeBytes, afterBytes }
}
