// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: true,

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  runtimeConfig: {
    // Private keys (only available on server-side)
    // These are automatically populated from Cloudflare Pages Environment Variables
    
    // Database
    databaseUrl: process.env.DATABASE_URL || '',
    
    // Security
    jwtSecret: process.env.JWT_SECRET || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    cronSecret: process.env.CRON_SECRET || '',
    
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
    
    // Monday.com
    mondayApiToken: process.env.MONDAY_API_TOKEN || '',

    // Meta (Facebook/Instagram) Ads
    metaAppId: process.env.META_APP_ID || '',
    metaAppSecret: process.env.META_APP_SECRET || '',
    metaRedirectUri: process.env.META_REDIRECT_URI || '/api/agency/social/meta/callback',

    // Google Ads
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '/api/agency/social/google/callback',
    googleDeveloperToken: process.env.GOOGLE_DEVELOPER_TOKEN || '',

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
      xeroRedirectUri: process.env.XERO_REDIRECT_URI || '/api/xero/callback',
      zeroServerUrl: process.env.NUXT_PUBLIC_ZERO_SERVER_URL || 'http://localhost:4848'
    }
  },

  components: [
    { path: '~/components/neubrutalism', pathPrefix: false },
    '~/components'
  ],

  nitro: {
    preset: 'cloudflare_pages',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },
    prerender: {
      crawlLinks: true,
      // Ignore auth-gated routes and API endpoints during prerendering
      ignore: ['/agency', '/portal', '/admin', '/settings', '/api', '/chat', '/invoices', '/customers', '/insights', '/profit-loss', '/expenses', '/cashflow', '/reports', '/anomalies', '/recommendations', '/xeroflow', '/review', '/approve', '/intake'],
    },
    rollupConfig: {
      external: ['@react-email/render', '@cloudflare/puppeteer', 'puppeteer', 'gifenc', 'pngjs']
    }
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/api/**': { cors: true },

    // Prerender static marketing pages at build time
    '/': { prerender: true },
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
    '/resources': { prerender: true },
    '/resources/**': { prerender: true },
    '/platform/**': { prerender: true },
    '/banner-studio': { prerender: true },
    '/auth/**': { prerender: true },
    '/sign-in': { prerender: true },

    // Keep all auth-gated routes as client-only SPA
    '/agency/**': { ssr: false },
    '/portal/**': { ssr: false },
    '/admin/**': { ssr: false },
    '/settings/**': { ssr: false },
    '/chat/**': { ssr: false },
    '/invoices/**': { ssr: false },
    '/customers/**': { ssr: false },
    '/insights/**': { ssr: false },
    '/profit-loss/**': { ssr: false },
    '/expenses/**': { ssr: false },
    '/cashflow/**': { ssr: false },
    '/reports/**': { ssr: false },
    '/anomalies/**': { ssr: false },
    '/recommendations/**': { ssr: false },
    '/xeroflow/**': { ssr: false },
    '/review/**': { ssr: false },
    '/approve/**': { ssr: false },
    '/intake/**': { ssr: false },
  },

  typescript: {
    strict: false
  },

  colorMode: {
    preference: 'dark'
  },

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Environment variable validation helper
  // This ensures required vars are set in production
  hooks: {
    'nitro:config'(nitroConfig) {
      // Log warning if critical env vars are missing in production
      if (process.env.NODE_ENV === 'production') {
        const required = ['DATABASE_URL', 'JWT_SECRET', 'SESSION_SECRET']
        const missing = required.filter(key => !process.env[key])
        if (missing.length > 0) {
          console.warn(`⚠️  Missing required environment variables: ${missing.join(', ')}`)
        }
      }
    }
  }
})
