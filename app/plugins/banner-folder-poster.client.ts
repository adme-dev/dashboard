import { preloadFirstPoster } from '~/utils/banner-poster-preload'

export default defineNuxtPlugin({
  name: 'banner-folder-poster',
  enforce: 'pre',
  setup() {
    if (!/^\/(agency|creative)\/banner-studio\/folders(?:\/|$)/.test(location.pathname)) return
    const layout = useCookie<string>('banner-library-view').value === 'grid' ? 'grid' : 'list'
    preloadFirstPoster(location.pathname + location.search, layout)
  }
})
