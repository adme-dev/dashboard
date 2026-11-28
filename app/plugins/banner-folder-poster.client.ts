import { preloadFirstPoster } from '~/utils/banner-poster-preload'

export default defineNuxtPlugin({
  name: 'banner-folder-poster',
  enforce: 'pre',
  setup() {
    if (!/^\/(agency|creative)\/banner-studio\/folders(?:\/|$)/.test(location.pathname)) return
    // Warm the route's real modules while its creative-access middleware is running.
    if (location.pathname.startsWith('/agency/')) {
      void import('~/layouts/agency.vue').catch(() => {})
      void import('~/pages/agency/banner-studio/index.vue').catch(() => {})
    }
    const layout = useCookie<string>('banner-library-view').value === 'grid' ? 'grid' : 'list'
    preloadFirstPoster(location.pathname + location.search, layout)
  }
})
