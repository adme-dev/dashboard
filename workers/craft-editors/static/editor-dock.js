// Shared editor switcher. Editor contents never leave their existing tab.
const XF_DOCK_APPS = {
  photoflow: { name: 'PhotoFlow', short: 'PF', color: '#ea7e39' },
  vectorflow: { name: 'VectorFlow', short: 'VF', color: '#489ae9' },
  effectflow: { name: 'EffectFlow', short: 'EF', color: '#a17aec' },
  filmflow: { name: 'FilmFlow', short: 'FF', color: '#da6b88' },
  soundflow: { name: 'SoundFlow', short: 'SF', color: '#58b99d' },
  figflow: { name: 'FigFlow', short: 'Fig', color: '#e9ad52' },
}

async function mountXeroFlowDock() {
  const current = location.pathname.split('/')[1]
  if (!Object.hasOwn(XF_DOCK_APPS, current) || document.getElementById('xf-editor-dock')) return
  let apps
  try {
    const response = await fetch('/editor-apps.json', { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) return
    const body = await response.text()
    if (body.length > 16384) return
    const config = JSON.parse(body)
    if (!Array.isArray(config.apps) || config.apps.length !== 6) return
    const seen = new Set()
    apps = config.apps.map(app => {
      if (!app || !Object.hasOwn(XF_DOCK_APPS, app.id) || seen.has(app.id)) throw Error('Invalid dock application')
      seen.add(app.id)
      const url = new URL(app.url, location.origin)
      if (url.origin !== location.origin || url.pathname !== `/${app.id}/` || url.search || url.hash || url.username || url.password) {
        throw Error('Invalid dock destination')
      }
      return { id: app.id, url: url.href, ...XF_DOCK_APPS[app.id] }
    })
  } catch { return }

  // Named targets let related app tabs be focused rather than reloaded. No noopener is
  // used for these strictly same-origin, allowlisted destinations, deliberately.
  window.name = `xeroflow-app-${current}`
  const root = document.createElement('nav')
  root.id = 'xf-editor-dock'
  root.className = 'xf-dock'
  root.tabIndex = 0
  root.setAttribute('aria-label', 'XeroFlow application switcher')
  root.dataset.open = 'false'
  const bridge = document.createElement('div')
  bridge.className = 'xf-dock-bridge'
  bridge.setAttribute('aria-hidden', 'true')
  const panel = document.createElement('div')
  panel.id = 'xf-dock-panel'
  panel.className = 'xf-dock-panel'
  const handle = document.createElement('button')
  handle.type = 'button'
  handle.className = 'xf-dock-handle'
  handle.setAttribute('aria-label', 'Show applications')
  handle.setAttribute('aria-controls', panel.id)
  handle.setAttribute('aria-expanded', 'false')
  const handleLine = document.createElement('span')
  handleLine.setAttribute('aria-hidden', 'true')
  handle.append(handleLine)
  let open = false
  let pinned = false
  let lastOutside = null
  let hideTimer = 0
  const links = []
  const setOpen = value => {
    open = value
    root.dataset.open = String(value)
    handle.setAttribute('aria-expanded', String(value))
    handle.setAttribute('aria-label', value ? 'Hide applications' : 'Show applications')
    links.forEach(link => { link.tabIndex = value ? 0 : -1 })
  }
  const close = restoreFocus => {
    pinned = false
    setOpen(false)
    if (restoreFocus) {
      const target = lastOutside?.isConnected ? lastOutside : document.querySelector('canvas')
      if (typeof target?.focus === 'function') target.focus({ preventScroll: true })
    }
  }
  const link = (name, mark, className) => {
    const anchor = document.createElement('a')
    anchor.className = `xf-dock-link ${className}`
    anchor.setAttribute('aria-label', name)
    anchor.tabIndex = -1
    const tile = document.createElement('span')
    tile.className = 'xf-dock-tile'
    tile.textContent = mark
    tile.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    label.className = 'xf-dock-label'
    label.textContent = name
    anchor.append(tile, label)
    links.push(anchor)
    return anchor
  }
  const home = link('Creative suite', 'XF', 'xf-dock-home')
  home.href = '/'
  home.target = 'xeroflow-creative-suite'
  panel.append(home)
  const divider = document.createElement('span')
  divider.className = 'xf-dock-divider'
  divider.setAttribute('aria-hidden', 'true')
  panel.append(divider)
  const appLinks = new Map()
  for (const app of apps) {
    const anchor = link(app.name, app.short, 'xf-dock-app')
    anchor.href = app.url
    const targetName = `xeroflow-app-${app.id}`
    anchor.target = targetName
    anchor.dataset.app = app.id
    anchor.style.setProperty('--xf-dock-color', app.color)
    const tile = anchor.querySelector('.xf-dock-tile')
    const thumbnail = document.createElement('img')
    thumbnail.className = 'xf-dock-thumbnail'
    thumbnail.src = `/images/${app.id}.png`
    thumbnail.alt = ''
    thumbnail.draggable = false
    thumbnail.decoding = 'async'
    const abbreviation = document.createElement('span')
    abbreviation.className = 'xf-dock-abbreviation'
    abbreviation.textContent = app.short
    tile.replaceChildren(thumbnail, abbreviation)
    if (app.id === current) {
      anchor.setAttribute('aria-current', 'page')
      anchor.classList.add('xf-dock-current')
    }
    anchor.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (app.id === current) {
        event.preventDefault()
        close(true)
        return
      }
      // An ordinary targeted anchor would reload an already-open editor. Open an
      // empty URL first, then navigate only a new/wrong target; existing work stays.
      const newTabFallback = () => {
        // A named anchor fallback could reload an existing editor when the browser
        // refuses a WindowProxy. A fresh native tab is safer than losing its work.
        anchor.target = '_blank'
        anchor.rel = 'noopener'
      }
      let target
      try { target = window.open('', targetName) } catch { newTabFallback(); return }
      if (!target) { newTabFallback(); return }
      anchor.target = targetName
      anchor.removeAttribute('rel')
      event.preventDefault()
      try {
        const existing = new URL(target.location.href)
        if (existing.origin !== location.origin || existing.pathname.split('/')[1] !== app.id) target.location.replace(app.url)
      } catch {
        // A target that was taken to another origin cannot expose its state.
        target.location.href = app.url
      }
      target.focus()
      close(false)
    })
    appLinks.set(app.id, anchor)
    panel.append(anchor)
  }
  const install = document.createElement('button')
  install.type = 'button'
  install.className = 'xf-dock-link xf-dock-install'
  install.dataset.xfInstall = ''
  install.tabIndex = -1
  install.setAttribute('aria-label', `Install ${XF_DOCK_APPS[current].name}`)
  const installTile = document.createElement('span')
  installTile.className = 'xf-dock-tile'
  installTile.setAttribute('aria-hidden', 'true')
  installTile.textContent = '↓'
  const installLabel = document.createElement('span')
  installLabel.className = 'xf-dock-label'
  installLabel.dataset.xfInstallLabel = ''
  installLabel.textContent = 'Install app'
  install.append(installTile, installLabel)
  links.push(install)
  panel.append(install)
  // Proximity magnification: neighbouring icons follow the pointer as one smooth wave.
  const magnifyMotion = matchMedia('(min-width:601px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)')
  let magnifyPointer = null, magnifyFrame = 0, magnifyTime = 0
  const magnifyValues = new Map()
  function animateMagnification(time) {
    const controls = [...panel.children].filter(el => el.classList.contains('xf-dock-link') || el.hasAttribute('data-xf-assets')).filter(el => !el.hidden && el.offsetWidth)
    const bounds = panel.getBoundingClientRect()
    const mix = 1 - Math.exp(-Math.min(40, time - (magnifyTime || time - 16)) / 65)
    magnifyTime = time
    let unsettled = false
    const values = controls.map(el => {
      const distance = magnifyPointer === null ? Infinity : Math.abs(magnifyPointer - bounds.left - el.offsetLeft - el.offsetWidth / 2)
      const target = magnifyMotion.matches && distance < 120 ? .30 * (1 + Math.cos(Math.PI * distance / 120)) / 2 : 0
      const previous = magnifyValues.get(el) || 0
      const value = !magnifyMotion.matches || Math.abs(target - previous) < .0005 ? target : previous + (target - previous) * mix
      if (value !== target) unsettled = true
      magnifyValues.set(el, value)
      return { el, value, extra: el.offsetWidth * value }
    })
    const total = values.reduce((sum, entry) => sum + entry.extra, 0)
    let before = 0
    for (const { el, value, extra } of values) {
      el.style.transformOrigin = 'center bottom'
      el.style.transform = total ? `translate3d(${before + extra / 2 - total / 2}px,0,0)` : ''
      const tile = el.querySelector('.xf-dock-tile')
      if (tile) {
        tile.style.transform = value ? `scale(${1 + value})` : ''
      } else {
        el.style.transform += value ? ` scale(${1 + value})` : ''
      }
      before += extra
    }
    magnifyFrame = unsettled ? requestAnimationFrame(animateMagnification) : 0
    if (!magnifyFrame) magnifyTime = 0
  }
  function magnifyAt(x) {
    magnifyPointer = x
    if (!magnifyFrame) magnifyFrame = requestAnimationFrame(animateMagnification)
  }
  panel.addEventListener('pointermove', event => { if (event.pointerType !== 'touch' && magnifyMotion.matches) magnifyAt(event.clientX) })
  panel.addEventListener('pointerleave', () => magnifyAt(null))
  magnifyMotion.addEventListener('change', () => magnifyAt(null))
  root.append(bridge, panel, handle)
  document.body.append(root)
  handle.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') setOpen(true) })
  panel.addEventListener('pointerenter', () => { clearTimeout(hideTimer); setOpen(true) })
  root.addEventListener('pointerleave', () => {
    hideTimer = window.setTimeout(() => { if (!pinned && !root.contains(document.activeElement)) setOpen(false) }, 160)
  })
  root.addEventListener('focusin', event => {
    if (!root.contains(event.relatedTarget)) lastOutside = event.relatedTarget
    clearTimeout(hideTimer)
    setOpen(true)
  })
  root.addEventListener('focusout', () => {
    hideTimer = window.setTimeout(() => { if (!pinned && !root.contains(document.activeElement)) setOpen(false) }, 0)
  })
  handle.addEventListener('click', () => {
    pinned = !pinned
    setOpen(pinned)
  })
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
  })
  document.addEventListener('pointerdown', event => {
    if (open && !root.contains(event.target)) close(false)
  }, true)

  // Presence contains app ids and transient tab ids only, never document state.
  // Heartbeats expire suspended/closed tabs without persistent storage.
  let channel
  let heartbeat = 0
  const peers = new Map()
  const tab = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  const updatePresence = () => {
    const now = Date.now()
    for (const [id, peer] of peers) if (now - peer.at > 180000) peers.delete(id)
    for (const [id, anchor] of appLinks) {
      const running = id === current || [...peers.values()].some(peer => peer.app === id)
      anchor.classList.toggle('xf-dock-running', running)
      anchor.setAttribute('aria-label', `${XF_DOCK_APPS[id].name}${id === current ? ', current app' : running ? ', open in another tab' : ''}`)
    }
  }
  const announce = type => { try { channel?.postMessage({ type, tab, app: current }) } catch { /* Optional presence only. */ } }
  const startPresence = () => {
    if (!channel || heartbeat) return
    announce('hello')
    heartbeat = window.setInterval(() => { announce('alive'); updatePresence() }, 10000)
  }
  try {
    channel = new BroadcastChannel('xeroflow-editor-dock-v1')
    channel.addEventListener('message', event => {
      const data = event.data
      if (!data || typeof data.tab !== 'string' || data.tab.length > 100 || data.tab === tab || !Object.hasOwn(XF_DOCK_APPS, data.app)) return
      if (data.type === 'bye') peers.delete(data.tab)
      else if (['hello', 'alive'].includes(data.type)) peers.set(data.tab, { app: data.app, at: Date.now() })
      else return
      if (data.type === 'hello') announce('alive')
      updatePresence()
    })
    startPresence()
  } catch { /* Browser privacy settings may disable cross-tab presence. */ }
  updatePresence()
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { announce('hello'); updatePresence() }
  })
  window.addEventListener('pagehide', event => {
    announce('bye')
    clearInterval(heartbeat)
    heartbeat = 0
    clearTimeout(hideTimer)
    if (!event.persisted) channel?.close()
  })
  window.addEventListener('pageshow', event => { if (event.persisted) startPresence() })
  document.dispatchEvent(new CustomEvent('xf-dock-ready'))
}

void mountXeroFlowDock()
