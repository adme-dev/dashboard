import { createApp, ref, h } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import ui from '@nuxt/ui/vue-plugin'
import AssetLibrary from './AssetLibrary.vue'
import './style.css'

const opened = ref(false)
let host, shadow, lastFocus, mounted = false
function close() { opened.value = false; host.hidden = true; lastFocus?.focus() }
function open(button) {
  lastFocus = button
  if (!mounted) {
    host = document.createElement('div'); host.id = 'xf-asset-library'
    shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/asset-library.css'
    const mount = document.createElement('div'); mount.className = 'dark'
    shadow.append(style, mount); document.body.append(host)
    createApp(AssetLibrary, { opened, close, ready: () => shadow.querySelector('input')?.focus() }).use(ui).mount(mount)
    mounted = true
  }
  host.hidden = false; opened.value = true
  setTimeout(() => shadow.querySelector('input')?.focus(), 0)
}
function wireDock() {
  const panel = document.querySelector('.xf-dock-panel')
  if (!panel || panel.querySelector('[data-xf-assets]')) return
  const mount = document.createElement('div'); mount.dataset.xfAssets = ''
  // The launcher action is also a Nuxt UI button, mounted without shared global CSS.
  const buttonHost = mount.attachShadow({ mode: 'open' })
  const style = document.createElement('style'); style.textContent = ':host{display:block}.xf-library-dock-action{display:grid;place-items:center;width:45px;height:45px;border:1px solid #ffffff20;border-radius:11px;background:#ffffff12;color:white;cursor:pointer;font:500 12px system-ui}.xf-library-dock-action:focus-visible{outline:2px solid #67e8f9;outline-offset:3px}@media(max-width:450px){.xf-library-dock-action{width:36px;height:36px;font-size:10px}}@media(max-width:360px){.xf-library-dock-action{width:30px;height:30px;font-size:9px}}'
  const sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/asset-library.css'
  const appMount = document.createElement('div'); appMount.className = 'dark'
  buttonHost.append(sheet, style, appMount); panel.append(mount)
  createApp({ render: () => h(UButton, { class: 'xf-library-dock-action', color: 'neutral', variant: 'ghost', 'aria-label': 'Open Motorstack asset library', 'aria-haspopup': 'dialog', onClick: event => open(event.currentTarget) }, () => 'Assets') }).use(ui).mount(appMount)
}
document.addEventListener('xf-dock-ready', wireDock)
window.addEventListener('keydown', event => { if (opened.value && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close() } }, true)
wireDock()
