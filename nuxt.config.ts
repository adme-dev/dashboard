// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,

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

    // R2 Storage
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: process.env.R2_BUCKET_NAME || 'agency-files',
    
    // Durable Objects
    taskRooms: process.env.TASK_ROOMS || '',

    // Public keys (exposed to client-side)
    public: {
      appName: process.env.APP_NAME || 'XeroFlow Agency',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      xeroRedirectUri: process.env.XERO_REDIRECT_URI || '/api/xero/callback',
      zeroServerUrl: process.env.NUXT_PUBLIC_ZERO_SERVER_URL || 'http://localhost:4848'
    }
  },

  nitro: {
    preset: 'cloudflare_pages',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },
    rollupConfig: {
      external: ['@react-email/render']
    }
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  typescript: {
    strict: false
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
