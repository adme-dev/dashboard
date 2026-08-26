(function searchAuthorityMenuAgent(global) {
  'use strict'

  var MARKER = 'data-xeroflow-search-authority-menu'
  var FEATURE_MARKER = 'data-xeroflow-search-authority-feature'
  var VERSION = 'v1'
  var FEATURE_STYLE_ID = 'xeroflow-search-authority-feature-style'
  var FEATURE_STYLES = '.xf-sa-feature{margin:1.5rem 0;padding:1rem;border:1px solid var(--xf-sa-border,#e5e7eb);border-radius:var(--xf-sa-radius,12px);background:var(--xf-sa-bg,transparent);font-family:inherit}.xf-sa-feature h2{margin:0 0 .75rem;font-size:1.125rem;color:var(--xf-sa-heading,inherit)}.xf-sa-feature ul{list-style:none;margin:0;padding:0;display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}.xf-sa-feature a{display:block;padding:.75rem;border-radius:8px;text-decoration:none;color:inherit;background:var(--xf-sa-card,rgba(0,0,0,.03))}.xf-sa-feature a strong{display:block;margin-bottom:.25rem;color:var(--xf-sa-link,inherit)}.xf-sa-feature a span{display:block;font-size:.875rem;opacity:.8}'
  var OBSERVER_WINDOW_MS = 30000
  var REFRESH_MS = 60000
  var state = global.XeroFlowSearchAuthorityMenuState || {
    observer: null,
    observerTimer: null,
    refreshTimer: null,
    reconcileTimer: null,
    config: null,
    configUrl: null,
    observed: false,
    generation: 0
  }
  if (typeof state.generation !== 'number') state.generation = 0
  global.XeroFlowSearchAuthorityMenuState = state

  function removeInserted() {
    document.querySelectorAll('[' + MARKER + '="' + VERSION + '"]').forEach(function (node) {
      node.remove()
    })
    removeFeature()
  }

  function removeFeature() {
    document.querySelectorAll('[' + FEATURE_MARKER + '="' + VERSION + '"]').forEach(function (node) {
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

  function validHref(value) {
    try {
      var url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch (_error) {
      return false
    }
  }

  function validFeature(value) {
    if (value === undefined || value === null) return true
    if (typeof value !== 'object' || typeof value.enabled !== 'boolean') return false
    if (!value.enabled) return true
    if (!validSelector(value.selector)) return false
    if (['prepend', 'append', 'before', 'after'].indexOf(value.position) === -1) return false
    if (typeof value.heading !== 'string' || value.heading.length < 1 || value.heading.length > 80 || /[<>]/.test(value.heading)) return false
    if (!Array.isArray(value.items) || value.items.length > 3) return false
    return value.items.every(function (item) {
      return item && typeof item === 'object'
        && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 300
        && typeof item.excerpt === 'string' && item.excerpt.length <= 200
        && typeof item.href === 'string' && validHref(item.href)
    })
  }

  function validConfig(value) {
    if (!value || typeof value !== 'object' || typeof value.enabled !== 'boolean') return false
    if (!validFeature(value.feature)) return false
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

  function ensureFeatureStyles() {
    if (document.getElementById(FEATURE_STYLE_ID)) return
    var style = document.createElement('style')
    style.id = FEATURE_STYLE_ID
    style.setAttribute(FEATURE_MARKER, VERSION)
    style.textContent = FEATURE_STYLES
    document.head.appendChild(style)
  }

  function createFeatureBlock(feature) {
    var section = document.createElement('section')
    section.className = 'xf-sa-feature'
    section.setAttribute(FEATURE_MARKER, VERSION)
    section.setAttribute('data-xeroflow-search-authority-target', 'feature')
    var heading = document.createElement('h2')
    heading.textContent = feature.heading
    section.appendChild(heading)
    var list = document.createElement('ul')
    feature.items.forEach(function (item) {
      var li = document.createElement('li')
      var anchor = document.createElement('a')
      anchor.href = item.href
      anchor.setAttribute('data-xeroflow-search-authority-link', VERSION)
      var title = document.createElement('strong')
      title.textContent = item.title
      anchor.appendChild(title)
      if (item.excerpt) {
        var excerpt = document.createElement('span')
        excerpt.textContent = item.excerpt
        anchor.appendChild(excerpt)
      }
      li.appendChild(anchor)
      list.appendChild(li)
    })
    section.appendChild(list)
    return section
  }

  function reconcileFeature(config) {
    var feature = config && config.feature
    var existing = document.querySelectorAll('section[' + FEATURE_MARKER + '="' + VERSION + '"]')
    if (!feature || !feature.enabled || feature.items.length === 0) {
      existing.forEach(function (node) { node.remove() })
      return false
    }
    var target
    try {
      target = document.querySelector(feature.selector)
    } catch (_error) {
      return false
    }
    if (!target) {
      existing.forEach(function (node) { node.remove() })
      return false
    }
    var keep = null
    existing.forEach(function (node) {
      var attached = feature.position === 'prepend' || feature.position === 'append'
        ? node.parentElement === target
        : node.parentElement === target.parentElement
      if (!keep && attached) keep = node
      else node.remove()
    })
    if (keep) return true
    ensureFeatureStyles()
    var block = createFeatureBlock(feature)
    if (feature.position === 'prepend') target.insertBefore(block, target.firstChild)
    else if (feature.position === 'append') target.appendChild(block)
    else if (feature.position === 'before' && target.parentElement) target.parentElement.insertBefore(block, target)
    else if (feature.position === 'after' && target.parentElement) target.parentElement.insertBefore(block, target.nextSibling)
    else return false
    return true
  }

  function reconcile() {
    var config = state.config
    if (!config || !config.enabled) {
      // The menu switch is the master kill switch; the feature block never outlives it.
      removeInserted()
      return
    }
    var featureActive = reconcileFeature(config)
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
    if (!state.observed && (Object.keys(active).length > 0 || featureActive) && state.configUrl) {
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

  async function loadConfig(observeRerenders, generation) {
    if (!state.configUrl || generation !== state.generation) return
    try {
      var response = await fetch(state.configUrl, { mode: 'cors', cache: 'no-store' })
      if (!response.ok) throw new Error('Configuration unavailable')
      var next = await response.json()
      if (generation !== state.generation) return
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
      if (generation !== state.generation) return
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
    state.generation += 1
    var generation = state.generation
    state.configUrl = url.href.replace(/\/$/, '')
    state.observed = false
    await loadConfig(true, generation)
    if (generation !== state.generation) return
    if (state.refreshTimer) clearInterval(state.refreshTimer)
    state.refreshTimer = setInterval(function () { loadConfig(false, generation) }, REFRESH_MS)
  }

  function destroy() {
    state.generation += 1
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
