import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import App from './Preview.vue'
import AiReferenceOrb from './components/ReferenceOrb.vue'
import AiOrbLauncher from './components/OrbLauncher.vue'
import './style.css'
createApp(App).use(ui).component('AiReferenceOrb', AiReferenceOrb).component('AiOrbLauncher', AiOrbLauncher).mount('#app')
