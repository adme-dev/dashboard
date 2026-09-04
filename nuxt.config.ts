// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { NUXT_PAYLOAD_EXTRACTION, shouldIgnorePrerenderRoute } from './lib/prerender-ignore'

// @flyhub/* email-builder packages are CLIENT-ONLY (the visual editor runs in the
// browser). Alias them to a stub in the Nitro/Workers server bundle so the heavy
// builder packages never ship server-side — the server renders email HTML via the
// pure-TS pipeline in server/utils/email-marketing/render (no @flyhub dependency).
const flyhubStub = fileURLToPath(new URL('./lib/flyhub-stub.ts', import.meta.url))
const flyhubServerAlias = Object.fromEntries(
  [
    '@flyhub/email-builder',
    '@flyhub/email-core',
    '@flyhub/email-document-core',
    '@flyhub/email-block-avatar',
    '@flyhub/email-block-button',
    '@flyhub/email-block-columns-container',
    '@flyhub/email-block-container',
    '@flyhub/email-block-divider',
    '@flyhub/email-block-heading',
    '@flyhub/email-block-html',
    '@flyhub/email-block-image',
    '@flyhub/email-block-spacer',
    '@flyhub/email-block-text'
  ].map(pkg => [pkg, flyhubStub])
)

const devWatcherIgnored = [
  '**/.claude/worktrees/**',
  '**/.worktrees/**',
  '**/.wrangler/**',
  'coverage/**',
  'dist/**',
  '**/node_modules/.cache/**',
  '**/node_modules/.vite/**'
]

const isKnownThirdPartyRollupWarning = (warning: {
  code?: string
  id?: string
  message?: string
}) => {
  const id = warning.id || ''
  if (warning.code === 'INVALID_ANNOTATION' && id.includes('/node_modules/') && id.includes('@vueuse/core')) {
    return true
  }
  if (warning.code === 'THIS_IS_UNDEFINED' && id.includes('/node_modules/')
    && (id.includes('groq-sdk') || id.includes('@opentelemetry/api'))) {
    return true
  }
  if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message?.includes('/node_modules/')) {
    return true
  }
  return false
}

export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],
  ssr: true,

  components: [
    { path: '~/components/neubrutalism', pathPrefix: false },
    '~/components'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark'
  },

  runtimeConfig: {
    // Private keys (only available on server-side)
    // These are automatically populated from Cloudflare Pages Environment Variables

    // Database
    databaseUrl: process.env.DATABASE_URL || '',

    // Security
    jwtSecret: process.env.JWT_SECRET || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    cronSecret: process.env.CRON_SECRET || '',
    agencyWorkflowsSmokeSharedSecretSha256: process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256 || '',
    // Secret for signing public render links (V1.4). Unset → public render links fail closed in prod.
    renderLinkSecret: process.env.RENDER_LINK_SECRET || '',

    // Xero OAuth
    xeroClientId: process.env.XERO_CLIENT_ID || '',
    xeroClientSecret: process.env.XERO_CLIENT_SECRET || '',
    xeroRedirectUri: process.env.XERO_REDIRECT_URI || '/api/xero/callback',

    // Email (Resend)
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'noreply@localhost',

    // AI (Groq) — routed through Cloudflare AI Gateway when AI_GATEWAY_URL is set
    groqApiKey: process.env.GROQ_API_KEY || '',
    aiGatewayUrl: process.env.AI_GATEWAY_URL || '',
    aiGatewayAuthToken: process.env.AI_GATEWAY_AUTH_TOKEN || '',
    // Anthropic — dormant escape hatch for the tool-calling loop (prod-only; needs key + gateway)
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

    // AI tool-calling (Slice 1) — OFF by default; flip per-env to enable the loop
    aiToolsEnabled: process.env.AI_TOOLS_ENABLED === 'true',
    aiLoopModel: process.env.AI_LOOP_MODEL || 'groq/openai/gpt-oss-120b', // Option 2: Groq open-source default
    // Fallback was kimi-k2 but Groq returns 404 for it (not on the account) — gpt-oss-20b is the valid sibling.
    aiLoopFallbackModel: process.env.AI_LOOP_FALLBACK_MODEL || 'groq/openai/gpt-oss-20b',
    // Inferred personal-memory distillation (Phase-0 WS-A.8b) — OFF by default. When enabled, the
    // chat engine distils ≤3 durable memories per turn fire-and-forget. Hard gate per the build loop.
    aiMemoryDistillEnabled: process.env.AI_MEMORY_DISTILL_ENABLED === 'true',
    // L2 traffic-controller supervisor (Phase 3) — OFF by default. When enabled, cross-domain requests
    // fan out to ≥2 specialist skill-packs and synthesize one answer. Adds latency + cost; hard gate.
    aiControllerL2Enabled: process.env.AI_CONTROLLER_L2_ENABLED === 'true',
    // Observe & Learn W-2 (observe-and-learn spec §4) — OFF by default. When enabled, a daily cron
    // distils each staff member's OWN recurring routines into source='observed', user-scoped memories.
    // Read only at the cron boundary (observe-and-learn.post.ts checks process.env directly). Hard gate.
    aiObserveEnabled: process.env.AI_OBSERVE_ENABLED === 'true',
    // Observe & Learn W-4 proactive suggestion — HELD for explicit sign-off; DOUBLY dormant (also needs
    // AI_OBSERVE_ENABLED). No proactive routine suggestion fires until this is on. Hard gate.
    aiObserveProactiveEnabled: process.env.AI_OBSERVE_PROACTIVE_ENABLED === 'true',
    // Visuals → Knowledge trigger — OFF by default. When on, new image proof-assets are captioned (Workers
    // AI vision) into UNPUBLISHED KB drafts fire-and-forget. Read at the trigger via process.env. Hard gate.
    visualsToKnowledgeEnabled: process.env.VISUALS_TO_KNOWLEDGE_ENABLED === 'true',
    // MCP server expose layer (mcp-server-phase1 spec) — OFF by default. When on, the /api/internal/mcp/*
    // endpoints serve the standalone mcp-server Worker (read-only tools over MCP to ChatGPT/Claude/Cursor).
    // Endpoints also require x-mcp-secret == MCP_INTERNAL_SECRET. Read via process.env. Hard gate.
    mcpServerEnabled: process.env.MCP_SERVER_ENABLED === 'true',
    // Client-portal co-pilot (portal-agent spec) — OFF by default. Its OWN gate so enabling the
    // agency chat (AI_TOOLS_ENABLED) never auto-exposes the customer-facing surface. Hard gate per §8.
    aiPortalEnabled: process.env.AI_PORTAL_ENABLED === 'true',
    // Portal Tier 2 own-data WRITES (e.g. respond_to_approval) — OFF by default, DOUBLY dormant
    // (also needs AI_PORTAL_ENABLED). Write tools are absent from the portal toolset until this is on.
    aiPortalWritesEnabled: process.env.AI_PORTAL_WRITES_ENABLED === 'true',
    // Send workspace slice — disabled until its staged rollout is explicitly enabled.
    sendEnabled: process.env.SEND_ENABLED === 'true',
    sendWorkspaceMaxTransferBytes: Number(process.env.SEND_WORKSPACE_MAX_TRANSFER_BYTES || 2 * 1024 * 1024 * 1024),
    sendWorkspaceMaxFileBytes: Number(process.env.SEND_WORKSPACE_MAX_FILE_BYTES || 2 * 1024 * 1024 * 1024),
    sendWorkspaceMaxFiles: Number(process.env.SEND_WORKSPACE_MAX_FILES || 20),
    sendWorkspaceDefaultRetentionDays: Number(process.env.SEND_WORKSPACE_DEFAULT_RETENTION_DAYS || 7),
    sendWorkspaceMaxRetentionDays: Number(process.env.SEND_WORKSPACE_MAX_RETENTION_DAYS || 30),
    sendWorkspaceMaxRecipients: Number(process.env.SEND_WORKSPACE_MAX_RECIPIENTS || 20),
    sendWorkspaceMaxDownloads: Number(process.env.SEND_WORKSPACE_MAX_DOWNLOADS || 100),
    sendWorkspaceUploadIntentTtlSeconds: Number(process.env.SEND_WORKSPACE_UPLOAD_INTENT_TTL_SECONDS || 900),
    sendWorkspaceMultipartThresholdBytes: Number(process.env.SEND_WORKSPACE_MULTIPART_THRESHOLD_BYTES || 100 * 1024 * 1024),
    sendWorkspaceMultipartPartSizeBytes: Number(process.env.SEND_WORKSPACE_MULTIPART_PART_SIZE_BYTES || 16 * 1024 * 1024),
    // Verified-public Send beta. Independent server/UI flags stay false until
    // scanner, email, rate-limit and rollback gates pass in production.
    sendPublicEnabled: process.env.SEND_PUBLIC_ENABLED === 'true',
    sendPublicMaxTransferBytes: Number(process.env.SEND_PUBLIC_MAX_TRANSFER_BYTES || 250 * 1024 * 1024),
    sendPublicMaxFileBytes: Number(process.env.SEND_PUBLIC_MAX_FILE_BYTES || 100 * 1024 * 1024),
    sendPublicMaxFiles: Number(process.env.SEND_PUBLIC_MAX_FILES || 10),
    sendPublicDefaultRetentionDays: Number(process.env.SEND_PUBLIC_DEFAULT_RETENTION_DAYS || 3),
    sendPublicMaxRetentionDays: Number(process.env.SEND_PUBLIC_MAX_RETENTION_DAYS || 3),
    sendPublicMaxDownloads: Number(process.env.SEND_PUBLIC_MAX_DOWNLOADS || 20),
    // Sonnet 4.6 = dormant prod escape hatch via 'anthropic/claude-sonnet-4-6' (needs ANTHROPIC_API_KEY + gateway)
    aiGateBudgetUsd: Number(process.env.AI_LOOP_BUDGET_USD || '0.25'), // per-turn cost cap

    // Monday.com
    mondayApiToken: process.env.MONDAY_API_TOKEN || '',

    // Meta (Facebook/Instagram) Ads
    metaAppId: process.env.META_APP_ID || '',
    metaAppSecret: process.env.META_APP_SECRET || '',
    metaRedirectUri: process.env.META_REDIRECT_URI || '/api/agency/social/meta/callback',
    metaGraphApiVersion: process.env.META_GRAPH_API_VERSION || 'v25.0',

    // Google Ads
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '/api/agency/social/google/callback',
    ga4RedirectUri: process.env.GA4_REDIRECT_URI || '/api/agency/social/ga4/callback',
    googleDeveloperToken: process.env.GOOGLE_DEVELOPER_TOKEN || '',
    // Manager (MCC) account id sent as login-customer-id when querying client
    // ad accounts accessed via a manager link. Without it the Google Ads API
    // returns 403 USER_PERMISSION_DENIED for child accounts.
    googleAdsLoginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '',

    // Google Business Profile publishing
    googleBusinessPublishingEnabled: process.env.GOOGLE_BUSINESS_PUBLISHING_ENABLED === 'true',
    googleBusinessClientId: process.env.GOOGLE_BUSINESS_CLIENT_ID || '',
    googleBusinessClientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET || '',
    googleBusinessRedirectUri: process.env.GOOGLE_BUSINESS_REDIRECT_URI || '/api/agency/social/publishing/accounts/callback/google-business',

    // TikTok Ads
    tiktokAppId: process.env.TIKTOK_APP_ID || '',
    tiktokAppSecret: process.env.TIKTOK_APP_SECRET || '',
    tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI || '/api/agency/social/tiktok/callback',

    // LinkedIn Ads
    linkedinClientId: process.env.LINKEDIN_CLIENT_ID || '',
    linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    linkedinRedirectUri: process.env.LINKEDIN_REDIRECT_URI || '/api/agency/social/linkedin/callback',

    // Pinterest Ads
    pinterestAppId: process.env.PINTEREST_APP_ID || '',
    pinterestAppSecret: process.env.PINTEREST_APP_SECRET || '',
    pinterestRedirectUri: process.env.PINTEREST_REDIRECT_URI || '/api/agency/social/pinterest/callback',

    // Snapchat Ads
    snapchatClientId: process.env.SNAPCHAT_CLIENT_ID || '',
    snapchatClientSecret: process.env.SNAPCHAT_CLIENT_SECRET || '',
    snapchatRedirectUri: process.env.SNAPCHAT_REDIRECT_URI || '/api/agency/social/snapchat/callback',

    // X (Twitter) Ads
    twitterClientId: process.env.TWITTER_CLIENT_ID || '',
    twitterClientSecret: process.env.TWITTER_CLIENT_SECRET || '',
    twitterRedirectUri: process.env.TWITTER_REDIRECT_URI || '/api/agency/social/twitter/callback',

    // Microsoft Ads (Bing)
    microsoftAdsClientId: process.env.MICROSOFT_ADS_CLIENT_ID || '',
    microsoftAdsClientSecret: process.env.MICROSOFT_ADS_CLIENT_SECRET || '',
    microsoftAdsRedirectUri: process.env.MICROSOFT_ADS_REDIRECT_URI || '/api/agency/social/microsoft_ads/callback',
    microsoftAdsDeveloperToken: process.env.MICROSOFT_ADS_DEVELOPER_TOKEN || '',

    // R2 Storage
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: process.env.R2_BUCKET_NAME || 'agency-files',

    // Durable Objects
    taskRooms: process.env.TASK_ROOMS || '',

    // Cloudflare API (for LoRA adapter management)
    cfAccountId: process.env.CF_ACCOUNT_ID || '',
    cfApiToken: process.env.CF_API_TOKEN || '',

    // HuggingFace API (for SAM2 segmentation in Banner Dissector)
    hfApiToken: process.env.HF_API_TOKEN || '',

    // Gemini API (for high-quality vision analysis in Banner Dissector)
    geminiApiKey: process.env.GEMINI_API_KEY || '',

    // Perplexity API (for AI web research in action plans)
    perplexityApiKey: process.env.PERPLEXITY_API_KEY || '',

    // Public keys (exposed to client-side)
    public: {
      appName: process.env.APP_NAME || 'XeroFlow Agency',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      zeroServerUrl: process.env.NUXT_PUBLIC_ZERO_SERVER_URL || 'http://localhost:4848',
      sendEnabled: process.env.NUXT_PUBLIC_SEND_ENABLED === 'true',
      sendPublicEnabled: process.env.NUXT_PUBLIC_SEND_PUBLIC_ENABLED === 'true',
      // Cloudflare Turnstile site key for the public email subscribe form. Empty
      // until the operator creates a widget — the widget + server check stay
      // inert (form works without it) while unset.
      turnstileSiteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || '',
      // Client-visible mirror of the private `aiToolsEnabled` flag, used ONLY to gate
      // agentic-AI UI (e.g. the chat persona picker) so it stays hidden until the loop
      // is live. The real authorization boundary is the server-side flag + RBAC; this is
      // a non-sensitive boolean for presentation only.
      aiToolsEnabled: process.env.AI_TOOLS_ENABLED === 'true',
      // Client-visible mirror of VIDEO_STUDIO_ENABLED — gates ONLY the "Render video"
      // button in the AV editor (the server endpoint is the real boundary; it 404s when off).
      videoStudioEnabled: process.env.VIDEO_STUDIO_ENABLED === 'true',
      videoGenerationEnabled: process.env.VIDEO_GENERATION_ENABLED === 'true',
      videoAssetHarnessEnabled: process.env.VIDEO_ASSET_HARNESS_ENABLED === 'true' || process.env.VIDEO_GENERATION_ENABLED === 'true',
      // Client-visible mirror of GOOGLE_BUSINESS_PUBLISHING_ENABLED. Server endpoints
      // remain the real boundary; this keeps the dormant channel hidden until approval.
      googleBusinessPublishingEnabled: process.env.GOOGLE_BUSINESS_PUBLISHING_ENABLED === 'true',
      // Client-visible mirror of AI_PORTAL_ENABLED — gates ONLY the portal co-pilot launcher.
      // The /api/portal/ai/* endpoints 404 when off; this just hides the UI until go-live.
      aiPortalEnabled: process.env.AI_PORTAL_ENABLED === 'true',
      // Client-visible mirrors of the Planner flags. Gate ONLY the board/AI UI; the
      // campaigns/board/generate-plan endpoints are the real boundary (they 404/empty when off).
      socialPlannerEnabled: process.env.SOCIAL_PLANNER_ENABLED === 'true',
      socialPlannerAiEnabled: process.env.SOCIAL_PLANNER_AI_ENABLED === 'true'
    }
  },

  ignore: devWatcherIgnored,

  routeRules: {
    // Keep `/` dynamic so host-aware server middleware can route
    // `app.xeroflow.io` to the admin surface while `xeroflow.io` continues
    // to serve the public website.
    '/pricing': { prerender: true },
    '/features': { prerender: true },
    '/features/**': { prerender: true },
    '/terms': { prerender: true },
    '/privacy': { prerender: true },
    '/support': { prerender: true },
    '/about': { prerender: true },
    '/landing': { prerender: true },
    '/creativity': { prerender: true },
    '/ai-training': { prerender: true },
    '/voice-ai': { prerender: true },
    '/resources': { prerender: true },
    '/resources/**': { prerender: true },
    '/platform/**': { prerender: true },
    '/banner-studio': { prerender: true },
    '/sign-in': { prerender: true },

    // Keep auth and auth-gated routes as client-only SPA
    '/auth/**': { ssr: false },
    '/agency': { ssr: false },
    '/agency/**': { ssr: false },
    '/portal': { ssr: false },
    '/portal/**': { ssr: false },
    '/admin': { ssr: false },
    '/admin/**': { ssr: false },
    '/settings': { ssr: false },
    '/settings/**': { ssr: false },
    '/chat': { ssr: false },
    '/chat/**': { ssr: false },
    '/office': { ssr: false },
    '/l/**': { ssr: false },
    '/lobby/**': { ssr: false },
    '/lobby-room/**': { ssr: false },
    '/invoices': { ssr: false },
    '/invoices/**': { ssr: false },
    '/customers': { ssr: false },
    '/customers/**': { ssr: false },
    '/insights': { ssr: false },
    '/insights/**': { ssr: false },
    '/profit-loss': { ssr: false },
    '/profit-loss/**': { ssr: false },
    '/expenses': { ssr: false },
    '/expenses/**': { ssr: false },
    '/cashflow': { ssr: false },
    '/cashflow/**': { ssr: false },
    '/reports': { ssr: false },
    '/reports/**': { ssr: false },
    '/anomalies': { ssr: false },
    '/anomalies/**': { ssr: false },
    '/recommendations': { ssr: false },
    '/recommendations/**': { ssr: false },
    '/xeroflow': { ssr: false },
    '/xeroflow/**': { ssr: false },
    '/review': { ssr: false },
    '/review/**': { ssr: false },
    '/approve': { ssr: false },
    '/approve/**': { ssr: false },
    '/intake': { ssr: false },
    '/intake/**': { ssr: false }
  },

  experimental: {
    appManifest: false,
    // The public pages contain static content, while protected app routes are
    // client-only. Inline route state so Nuxt never prefetches empty
    // `_payload.json` files that are not emitted for every prerendered route.
    payloadExtraction: NUXT_PAYLOAD_EXTRACTION
  },

  compatibilityDate: '2024-12-01',

  nitro: {
    preset: 'cloudflare_pages',
    // Keep @flyhub/* out of the server bundle (client-only editor packages).
    alias: flyhubServerAlias,
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },
    prerender: {
      crawlLinks: true,
      // Nitro treats string ignore rules as prefixes, so a literal '/' would
      // suppress every public route. Use an explicit marketing allowlist to
      // keep auth-gated, API, development and utility surfaces dynamic.
      ignore: [shouldIgnorePrerenderRoute]
    },
    rollupConfig: {
      external: ['@react-email/render', '@cloudflare/puppeteer', 'puppeteer', 'gifenc', 'pngjs', 'pg-native'],
      onwarn(warning, warn) {
        if (isKnownThirdPartyRollupWarning(warning)) return
        warn(warning)
      }
    }
    // Lead-maintenance crons run via the dedicated `leads-cron` companion Worker
    // (workers/leads-cron) — its scheduled() handler POSTs to the
    // /api/leads/_internal/* endpoints. Cloudflare Pages can't run Nitro
    // scheduledTasks (no scheduled handler), so they are intentionally omitted here.
  },

  vite: {
    build: {
      // The app has several intentionally lazy, feature-heavy route chunks. Keep
      // the warning threshold aligned with the current route-level split while
      // still flagging unusually large future chunks.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        onwarn(warning, warn) {
          if (isKnownThirdPartyRollupWarning(warning)) return
          warn(warning)
        }
      }
    },
    server: {
      watch: {
        ignored: devWatcherIgnored
      }
    }
  },

  typescript: {
    strict: false
  },

  // Environment variable validation helper
  // This ensures required vars are set in production
  hooks: {
    'build:manifest'(manifest) {
      // Route chunks are already discovered and loaded by the client entry.
      // Repeating every non-entry script throughout Nuxt's server-side preload
      // graph adds about 1 MiB to the Cloudflare Function without changing
      // correctness. Keep entry scripts and CSS preload metadata intact.
      for (const resource of Object.values(manifest)) {
        if (resource.resourceType === 'script' && !resource.isEntry) {
          resource.preload = false
        }
      }
    },
    'nitro:config'() {
      // Runtime secrets are injected by Cloudflare Pages and are often absent
      // during local production builds. Enable this in CI/release validation with
      // NUXT_VALIDATE_REQUIRED_ENV=true so local deploy builds stay signal-only.
      if (process.env.NUXT_VALIDATE_REQUIRED_ENV === 'true') {
        const required = ['DATABASE_URL', 'JWT_SECRET', 'SESSION_SECRET']
        const missing = required.filter(key => !process.env[key])
        if (missing.length > 0) {
          console.warn(`⚠️  Missing required environment variables: ${missing.join(', ')}`)
        }
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
