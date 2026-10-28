// Installation is always initiated by a user. Browser support decides the native prompt.
const standalone = matchMedia('(display-mode: standalone)')
let deferredPrompt = null
let installed = false
let panel = null
let returnFocus = null
const wired = new WeakSet()

function isStandalone() {
  return standalone.matches || navigator.standalone === true
}

function refreshButtons() {
  for (const button of document.querySelectorAll('[data-xf-install]')) {
    button.hidden = isStandalone()
    button.disabled = installed
    button.setAttribute('aria-label', installed ? 'App installed' : 'Install this app')
    button.title = installed ? 'Installed' : 'Install app'
    if (installed) {
      const label = button.querySelector('[data-xf-install-label]')
      if (label) label.textContent = 'Installed'
      else if (button.childElementCount === 0) button.textContent = 'Installed'
    }
  }
}

function closeHelp() {
  if (!panel || panel.hidden) return
  panel.hidden = true
  returnFocus?.focus()
}

function helpText() {
  const ua = navigator.userAgent
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/.test(ua)
  const mac = /Macintosh|MacIntel/.test(ua + ' ' + navigator.platform)
  if (safari && mac) {
    return 'In Safari on macOS Sonoma 14 or later, choose File → Add to Dock, then choose Add.'
  }
  if (safari && /iPhone|iPad|iPod/.test(ua)) {
    return 'In Safari, open Share, then choose Add to Home Screen.'
  }
  if (/Chrome|Chromium|CriOS/.test(ua) && !/Edg|OPR/.test(ua)) {
    return 'In Chrome, choose More → Cast, save, and share → Install page as app, then follow the browser’s instructions. You may also see an install icon in the address bar.'
  }
  return 'Use your browser’s menu to install this page as an app or add it to your home screen. On Safari for Mac, use File → Add to Dock.'
}

function showHelp(button, promptFailed = false) {
  if (!panel) {
    panel = document.createElement('section')
    panel.className = 'xf-install-help'
    panel.id = 'xf-install-help'
    panel.hidden = true
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-labelledby', 'xf-install-title')
    const heading = document.createElement('h2')
    heading.id = 'xf-install-title'
    heading.textContent = 'Install this app'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'xf-install-help-close'
    close.textContent = '×'
    close.setAttribute('aria-label', 'Close install instructions')
    close.addEventListener('click', closeHelp)
    const instructions = document.createElement('p')
    instructions.className = 'xf-install-instructions'
    const note = document.createElement('p')
    note.className = 'xf-install-note'
    note.textContent = 'Save or export your current project before opening an installed app. Safari web apps use separate website storage.'
    panel.append(heading, close, instructions, note)
    document.body.append(panel)
  }
  panel.querySelector('.xf-install-instructions').textContent = (promptFailed ? 'The browser did not open its install prompt. ' : '') + helpText()
  returnFocus = button
  panel.hidden = false
  panel.querySelector('button').focus()
}

async function install(button) {
  if (installed || isStandalone()) return
  if (!deferredPrompt) {
    showHelp(button)
    return
  }
  const prompt = deferredPrompt
  deferredPrompt = null
  closeHelp()
  try {
    await prompt.prompt()
    await prompt.userChoice
  } catch {
    showHelp(button, true)
  }
}

function wireButtons() {
  for (const button of document.querySelectorAll('[data-xf-install]')) {
    if (wired.has(button)) continue
    wired.add(button)
    button.setAttribute('aria-haspopup', 'dialog')
    button.setAttribute('aria-controls', 'xf-install-help')
    button.addEventListener('click', () => install(button))
  }
  refreshButtons()
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  deferredPrompt = event
  wireButtons()
})
window.addEventListener('appinstalled', () => {
  installed = true
  deferredPrompt = null
  closeHelp()
  refreshButtons()
})
standalone.addEventListener('change', refreshButtons)
document.addEventListener('xf-dock-ready', wireButtons)
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel && !panel.hidden) {
    event.preventDefault()
    event.stopPropagation()
    closeHelp()
  }
}, true)
document.addEventListener('pointerdown', event => {
  if (panel && !panel.hidden && !panel.contains(event.target) && !event.target.closest?.('[data-xf-install]')) {
    // Outside clicks continue to the editor; closing help must not steal focus back.
    panel.hidden = true
  }
}, true)
wireButtons()
