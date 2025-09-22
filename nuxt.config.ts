// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  runtimeConfig: {
    xeroClientId: process.env.XERO_CLIENT_ID,
    xeroClientSecret: process.env.XERO_CLIENT_SECRET,
    xeroRedirectUri: process.env.XERO_REDIRECT_URI,
    sessionSecret: process.env.SESSION_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    public: {
      xeroRedirectUri: process.env.XERO_REDIRECT_URI
    }
  },

  nitro: {
    preset: 'netlify'
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  ssr: false, // Enable SPA mode for better client-side experience with auth and real-time data

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
