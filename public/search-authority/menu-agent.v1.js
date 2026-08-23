(function searchAuthorityMenuAgent(global) {
  'use strict'

  var MARKER = 'data-xeroflow-search-authority-menu'
  var VERSION = 'v1'
  var OBSERVER_WINDOW_MS = 30000
  var REFRESH_MS = 60000
  var state = global.XeroFlowSearchAuthorityMenuState || {
    observer: null,
    observerTimer: null,
    refreshTimer: null,
    reconcileTimer: null,
    config: null,
    configUrl: null,
    observed: false
  }
  global.XeroFlowSearchAuthorityMenuState = state

  function removeInserted() {
    document.querySelectorAll('[' + MARKER + '="' + VERSION + '"]').forEach(function (node) {
      node.remove()
    })
  }

  function validSelector(value) {
    return typeof value === 'string'
      && value.length > 0
      && value.length <= 200
      && !/[,:(){}\\]/.test(value)
      && /^[a-zA-Z0-9_#.\-[\]="' >+~]+$/.test(value)
  }

  function validConfig(value) {
    if (!value || typeof value !== 'object' || typeof value.enabled !== 'boolean') return false
    if (!value.enabled) return true
    if (typeof value.label !== 'string' || value.label.length < 1 || value.label.length > 60 || /[<>]/.test(value.label)) return false
    if (!validSelector(value.desktopSelector) || !validSelector(value.mobileSelector)) return false
    if (value.insertion !== 'append' && value.insertion !== 'before-last') return false
    try {
      var url = new URL(value.href)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch (_error) {
      return false
    }
  }

  function createItem(target, key, config) {
    var anchor = document.createElement('a')
    anchor.href = config.href
    anchor.textContent = config.label
    anchor.setAttribute('data-xeroflow-search-authority-link', VERSION)
    var item = anchor
    if (target.tagName === 'UL' || target.tagName === 'OL') {
      item = document.createElement('li')
      item.appendChild(anchor)
    }
    item.setAttribute(MARKER, VERSION)
    item.setAttribute('data-xeroflow-search-authority-target', key)
    if (config.insertion === 'before-last' && target.lastElementChild) {
      target.insertBefore(item, target.lastElementChild)
    } else {
      target.appendChild(item)
    }
  }

  function reconcile() {
    var config = state.config
    if (!config || !config.enabled) {
      removeInserted()
      return
    }
    var targets = [
      ['desktop', config.desktopSelector],
      ['mobile', config.mobileSelector]
    ]
    var active = {}
    var seenTargets = []
    targets.forEach(function (entry) {
      var key = entry[0]
      var selector = entry[1]
      var target
      try {
        target = document.querySelector(selector)
      } catch (_error) {
        return
      }
      if (!target) return
      if (seenTargets.indexOf(target) !== -1) return
      seenTargets.push(target)
      active[key] = true
      var nodes = document.querySelectorAll('[' + MARKER + '="' + VERSION + '"][data-xeroflow-search-authority-target="' + key + '"]')
      var inside = null
      nodes.forEach(function (node) {
        if (!inside && node.parentElement === target) inside = node
        else node.remove()
      })
      if (!inside) createItem(target, key, config)
    })
    document.querySelectorAll('[' + MARKER + '="' + VERSION + '"]').forEach(function (node) {
      if (!active[node.getAttribute('data-xeroflow-search-authority-target')]) node.remove()
    })
    if (!state.observed && Object.keys(active).length > 0 && state.configUrl) {
      state.observed = true
      fetch(state.configUrl + '/observed', { method: 'POST', mode: 'cors', keepalive: true }).catch(function () {})
    }
  }

  function scheduleReconcile() {
    if (state.reconcileTimer) return
    state.reconcileTimer = setTimeout(function () {
      state.reconcileTimer = null
      reconcile()
    }, 50)
  }

  function startObserver() {
    if (state.observer) state.observer.disconnect()
    if (state.observerTimer) clearTimeout(state.observerTimer)
    state.observer = new MutationObserver(scheduleReconcile)
    state.observer.observe(document.documentElement, { childList: true, subtree: true })
    state.observerTimer = setTimeout(function () {
      if (state.observer) state.observer.disconnect()
      state.observer = null
    }, OBSERVER_WINDOW_MS)
  }

  async function loadConfig(observeRerenders) {
    if (!state.configUrl) return
    try {
      var response = await fetch(state.configUrl, { mode: 'cors', cache: 'no-store' })
      if (!response.ok) throw new Error('Configuration unavailable')
      var next = await response.json()
      if (!validConfig(next)) throw new Error('Configuration rejected')
      state.config = next
      if (!next.enabled) {
        removeInserted()
        if (state.observer) state.observer.disconnect()
        return
      }
      if (observeRerenders) startObserver()
      reconcile()
    } catch (_error) {
      state.config = null
      removeInserted()
    }
  }

  async function init(options) {
    if (!options || typeof options.configUrl !== 'string') return
    var url
    try {
      url = new URL(options.configUrl)
    } catch (_error) {
      return
    }
    if (url.protocol !== 'https:' || url.username || url.password) return
    state.configUrl = url.href.replace(/\/$/, '')
    state.observed = false
    await loadConfig(true)
    if (state.refreshTimer) clearInterval(state.refreshTimer)
    state.refreshTimer = setInterval(function () { loadConfig(false) }, REFRESH_MS)
  }

  function destroy() {
    if (state.observer) state.observer.disconnect()
    if (state.observerTimer) clearTimeout(state.observerTimer)
    if (state.refreshTimer) clearInterval(state.refreshTimer)
    if (state.reconcileTimer) clearTimeout(state.reconcileTimer)
    state.observer = null
    state.observerTimer = null
    state.refreshTimer = null
    state.reconcileTimer = null
    state.config = null
    removeInserted()
  }

  global.XeroFlowSearchAuthorityMenu = { init: init, destroy: destroy }
  var script = document.currentScript
  if (script && script.dataset && script.dataset.configUrl) {
    init({ configUrl: script.dataset.configUrl })
  }
})(window)
