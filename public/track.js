/**
 * XeroFlow First-Party Tracking Tag (ships as /track.js)
 *
 * Usage (raw, or via GTM Custom HTML — All Pages):
 * <script src="https://<dashboard-origin>/track.js" data-key="xf_..." async></script>
 * Optional: data-spa="true" for SPA route-change page_views.
 */
;(function (window, document) {
  'use strict'

  // Defaults (overridable via init({ config: { ... } }))
  var COOKIE_NAME = '_engagr_id'
  var SESSION_COOKIE = '_engagr_session'
  var COOKIE_DAYS = 365
  var SESSION_MINUTES = 30
  var ENDPOINT = '/api/public/track' // resolved against _scriptOrigin at send time
  var WRITE_KEY = '' // per-site public key from the script tag's data-key attr
  var SCROLL_DEPTHS = [25, 50, 75, 90]
  var ENGAGEMENT_INTERVALS = [30, 60, 120, 300]
  var ENGAGEMENT_CHECK_MS = 5000
  var SCROLL_DEBOUNCE_MS = 100
  var RAGE_WINDOW_MS = 1000
  var RAGE_THRESHOLD = 5
  var RAGE_RADIUS = 50
  var VIDEO_MILESTONES = [25, 50, 75, 100]
  var IDLE_TIMEOUT_MS = 60000
  var IDLE_EXTENDED_THRESHOLDS = [120, 300]
  var IDLE_ACTIVITY_DEBOUNCE_MS = 500

  // =====================================================
  // sGTM BRIDGE (optional — loads GTM when dealer has it enabled)
  // =====================================================

  var _gtmConfig = null
  var _gtmReady = false
  var _pendingDataLayerPushes = []
  var _scriptOrigin = ''

  // Events that should push to dataLayer (ad platform value)
  var DATALAYER_EVENTS = {
    page_view: 'page_view',
    lead: 'generate_lead',
    generate_lead: 'generate_lead',
    form_submit: 'form_submit',
    test_drive: 'test_drive_booking',
    purchase: 'purchase',
    vehicle_view: 'view_item',
    form_start: 'form_start',
    form_abandonment: 'form_abandonment',
    search: 'search',
    filter_change: 'filter_change',
    phone_click: 'phone_click',
    trade_in_start: 'trade_in_start',
    trade_in_complete: 'trade_in_complete',
    video_play: 'video_play',
    finance_calculator_interact: 'finance_calculator_interact',
    return_to_vehicle: 'return_to_vehicle',
    competitive_referrer: 'competitive_referrer',
    vdp_scroll_depth: 'vdp_scroll_depth',
  }

  // Events with thresholds (only push above certain values)
  var DATALAYER_THRESHOLD_EVENTS = {
    scroll: { field: 'depth', min: 75, dlEvent: 'scroll' },
    video_progress: { field: 'milestone', min: 50, dlEvent: 'video_progress' },
    engagement: { field: 'duration', min: 60, dlEvent: 'user_engagement' },
  }

  // CTA click selectors for dataLayer
  var CTA_CLICK_SELECTORS = ['[data-track]', 'button[type="submit"]', '.cta', '[data-cta]']

  // Fetch GTM config with sessionStorage cache (5 min TTL)
  function fetchGtmConfig(origin, callback) {
    try {
      var cached = sessionStorage.getItem('_engagr_gtm_config')
      if (cached) {
        var parsed = JSON.parse(cached)
        if (parsed && parsed._ts && Date.now() - parsed._ts < 300000) {
          callback(parsed.data)
          return
        }
      }
    } catch (e) {
      // sessionStorage unavailable or parse error — continue to fetch
    }

    var controller = null
    var timeoutId = null

    try {
      controller = new AbortController()
      timeoutId = setTimeout(function () {
        controller.abort()
      }, 2000)
    } catch (e) {
      controller = null
    }

    var fetchOpts = {
      method: 'GET',
      credentials: 'same-origin',
    }
    if (controller) {
      fetchOpts.signal = controller.signal
    }

    fetch(origin + '/api/tracking/config', fetchOpts)
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then(function (data) {
        try {
          sessionStorage.setItem(
            '_engagr_gtm_config',
            JSON.stringify({ _ts: Date.now(), data: data })
          )
        } catch (e) {
          // quota exceeded — ignore
        }
        callback(data)
      })
      .catch(function () {
        if (timeoutId) clearTimeout(timeoutId)
        callback(null)
      })
  }

  // Inject GTM script tag — Phase 65 CUTOVER-01: always loads from Google CDN.
  // Previously routed through {sgtmDomain}/gtm.js when sgtmEnabled; that branch is removed
  // to bank the GCP Cloud Run sGTM saving day-1. The 4 true-custom-domain dealers
  // temporarily lose first-party benefit until Phase 70 v2 cutover replaces GTM entirely
  // with the Nitro+Worker tracking pipeline. config.gtm.sgtmEnabled and sgtmDomain are
  // still received from /api/tracking/config but ignored here (deprecated; full removal
  // in a Phase 70+ cleanup).
  function injectGtmScript(config, origin) {
    if (!config || !config.gtm || !config.gtm.enabled || !config.gtm.containerId) return

    _gtmConfig = config

    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      'gtm.start': new Date().getTime(),
      event: 'gtm.js',
    })

    var containerId = config.gtm.containerId
    var scriptUrl = 'https://www.googletagmanager.com/gtm.js?id=' + containerId

    var s = document.createElement('script')
    s.async = true
    s.src = scriptUrl
    var firstScript = document.getElementsByTagName('script')[0]
    firstScript.parentNode.insertBefore(s, firstScript)

    _gtmReady = true

    // Flush pending pushes
    for (var i = 0; i < _pendingDataLayerPushes.length; i++) {
      window.dataLayer.push(_pendingDataLayerPushes[i])
    }
    _pendingDataLayerPushes = []
  }

  // Generate a dedup-safe event ID
  function generateEventId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return Date.now() + '-' + Math.random().toString(36).substring(2, 11)
  }

  function resolveEventId(options) {
    var supplied = options && typeof options.eventId === 'string'
      ? options.eventId.trim()
      : ''
    return supplied && supplied.length <= 128 ? supplied : generateEventId()
  }

  // Use the site's already-installed GTM container without fetching Zero's
  // GTM config or injecting another container script.
  function enableExistingDataLayerBridge() {
    _gtmConfig = { gtm: { enabled: true } }
    _gtmReady = true
    window.dataLayer = window.dataLayer || []

    for (var i = 0; i < _pendingDataLayerPushes.length; i++) {
      window.dataLayer.push(_pendingDataLayerPushes[i])
    }
    _pendingDataLayerPushes = []
  }

  // Push qualifying events to dataLayer for GTM/sGTM
  function pushToDataLayer(eventName, eventData, eventId) {
    if (!_gtmConfig || !_gtmConfig.gtm || !_gtmConfig.gtm.enabled) return

    var dlEvent = null
    var payload = {}

    // Check direct event mapping
    if (DATALAYER_EVENTS[eventName]) {
      dlEvent = DATALAYER_EVENTS[eventName]
    }

    // Check threshold events
    if (!dlEvent && DATALAYER_THRESHOLD_EVENTS[eventName]) {
      var threshold = DATALAYER_THRESHOLD_EVENTS[eventName]
      if (eventData && eventData[threshold.field] >= threshold.min) {
        dlEvent = threshold.dlEvent
      }
    }

    // Check click events for CTA qualification
    if (!dlEvent && eventName === 'click') {
      var isCta = false

      // Check selector match against CTA selectors
      if (eventData && eventData.selector) {
        for (var i = 0; i < CTA_CLICK_SELECTORS.length; i++) {
          if (eventData.selector.indexOf(CTA_CLICK_SELECTORS[i]) !== -1) {
            isCta = true
            break
          }
        }
      }

      // Check text content for CTA keywords
      if (!isCta && eventData && eventData.text) {
        var lowerText = eventData.text.toLowerCase()
        var ctaKeywords = ['enquir', 'book', 'call', 'contact', 'get quote', 'test drive']
        for (var j = 0; j < ctaKeywords.length; j++) {
          if (lowerText.indexOf(ctaKeywords[j]) !== -1) {
            isCta = true
            break
          }
        }
      }

      if (isCta) {
        dlEvent = 'cta_click'
      }
    }

    if (!dlEvent) return

    // Build payload
    payload.event = dlEvent

    // Copy relevant data fields
    if (eventData) {
      if (eventData.vehicle_make) payload.vehicle_make = eventData.vehicle_make
      if (eventData.vehicle_model) payload.vehicle_model = eventData.vehicle_model
      if (eventData.vehicle_name) payload.vehicle_name = eventData.vehicle_name
      if (eventData.vehicle_id) payload.vehicle_id = eventData.vehicle_id
      if (eventData.form_id) payload.form_id = eventData.form_id
      if (eventData.form_name) payload.form_name = eventData.form_name
      if (eventData.text) payload.link_text = eventData.text
      if (eventData.href) payload.link_url = eventData.href
      if (eventData.depth) payload.percent_scrolled = eventData.depth
      if (eventData.milestone) payload.video_percent = eventData.milestone
      if (eventData.video_id) payload.video_id = eventData.video_id
      if (eventData.title) payload.page_title = eventData.title
      if (eventData.path) payload.page_path = eventData.path
    }

    // Add event_id and Facebook cookies for conversion events
    if (dlEvent === 'generate_lead' || dlEvent === 'test_drive_booking' || dlEvent === 'purchase') {
      payload.event_id = eventId
      var fbCookies = getFbCookies()
      if (fbCookies.fbc) payload.fbc = fbCookies.fbc
      if (fbCookies.fbp) payload.fbp = fbCookies.fbp
    }

    // Push or queue
    if (_gtmReady && window.dataLayer) {
      window.dataLayer.push(payload)
    } else {
      _pendingDataLayerPushes.push(payload)
    }
  }

  // Get or create client ID (first-party cookie)
  function getClientId() {
    var id = getCookie(COOKIE_NAME)
    if (!id) {
      id = generateId()
      setCookie(COOKIE_NAME, id, COOKIE_DAYS)
    }
    return id
  }

  // Get or create session ID
  function getSessionId() {
    var id = getCookie(SESSION_COOKIE)
    if (!id) {
      id = generateId()
    }
    // Refresh session cookie on each page
    setCookie(SESSION_COOKIE, id, SESSION_MINUTES / (24 * 60))
    return id
  }

  // Generate unique ID
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      var v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  // Consent cookie name — MUST match the server (track.post.ts reads '_xf_consent').
  var CONSENT_COOKIE_NAME = '_xf_consent'
  var _explicitConsentCookieValue = null

  function getConsentCookieValue() {
    return _explicitConsentCookieValue || getCookie(CONSENT_COOKIE_NAME)
  }

  // Read and parse the consent cookie
  // Returns null if no cookie or parse failure
  function getConsent() {
    var raw = getConsentCookieValue()
    if (!raw) return null
    try {
      var parsed = JSON.parse(raw)
      return parsed
    } catch (e) {
      return null
    }
  }

  function pushConsentUpdate(snapshot) {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      event: 'xeroflow_consent_update',
      xeroflow_consent: {
        tracking: snapshot.tracking ? 'granted' : 'denied',
        analytics: snapshot.analytics ? 'granted' : 'denied',
        marketing: snapshot.marketing ? 'granted' : 'denied',
      },
    })
  }

  // Stable bridge for a site-owned consent manager. The browser records only an
  // explicit choice; regional defaults and the immutable per-event snapshot
  // remain server responsibilities.
  function setConsent(choice) {
    if (
      !choice
      || typeof choice.tracking !== 'boolean'
      || typeof choice.analytics !== 'boolean'
      || typeof choice.marketing !== 'boolean'
    ) {
      throw new TypeError(
        'XeroFlow consent requires tracking, analytics and marketing booleans'
      )
    }

    var snapshot = {
      tracking: choice.tracking,
      analytics: choice.analytics,
      marketing: choice.marketing,
      updatedAt: new Date().toISOString(),
    }
    _explicitConsentCookieValue = JSON.stringify(snapshot)
    setCookie(CONSENT_COOKIE_NAME, _explicitConsentCookieValue, COOKIE_DAYS)
    pushConsentUpdate(snapshot)
    return snapshot
  }

  // Gate an event against the current consent state.
  // Category lists MUST mirror shouldAllowEvent() in server/api/tracking/collect.post.ts.
  function isEventAllowed(eventName, consent) {
    // Essential events always fire regardless of consent state
    var essentialEvents = ['page_view', 'session_start', 'session_end']
    for (var e = 0; e < essentialEvents.length; e++) {
      if (essentialEvents[e] === eventName) return true
    }

    // No explicit consent cookie. Slice 1 sites run consent_mode 'off' (AU
    // opt-out): the server stores every first-party event and snapshots consent
    // per-row to govern ad-platform fan-out later — so behaviour is captured by
    // default here. An explicit cookie (branches below) still lets a visitor
    // opt out per-category; EU/opt-in sites must deploy that cookie.
    if (!consent || consent.updatedAt === null || consent.updatedAt === undefined) return true

    // Marketing events require marketing consent
    var marketingEvents = [
      'lead',
      'test_drive',
      'trade_in',
      'finance_application',
      'purchase',
      'add_to_wishlist',
      'chat_submission',
    ]
    for (var m = 0; m < marketingEvents.length; m++) {
      if (marketingEvents[m] === eventName) return !!consent.marketing
    }

    // Analytics events require analytics consent
    var analyticsEvents = [
      'vehicle_view',
      'vehicle_list_view',
      'search',
      'filter_change',
      'form_engagement',
      'media_interaction',
      'cta_click',
      'vehicle_comparison',
      'rage_click',
      'video_depth',
      'idle_extended',
      'form_field_focus',
      'form_abandonment',
    ]
    for (var a = 0; a < analyticsEvents.length; a++) {
      if (analyticsEvents[a] === eventName) return !!consent.analytics
    }

    // All other events require base tracking consent
    return !!consent.tracking
  }

  // Cookie helpers
  function setCookie(name, value, days) {
    var expires = ''
    if (days) {
      var date = new Date()
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
      expires = '; expires=' + date.toUTCString()
    }
    document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax'
  }

  function getCookie(name) {
    var nameEQ = name + '='
    var ca = document.cookie.split(';')
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i]
      while (c.charAt(0) === ' ') c = c.substring(1)
      if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length))
    }
    return null
  }

  // Parse UTM parameters
  function getUtmParams() {
    var params = {}
    var search = window.location.search.substring(1)
    if (!search) return params

    var pairs = search.split('&')
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split('=')
      var key = decodeURIComponent(pair[0])
      if (key.indexOf('utm_') === 0) {
        params[key] = decodeURIComponent(pair[1] || '')
      }
      // Capture click IDs (Google, Facebook, TikTok, Microsoft, LinkedIn)
      if (
        key === 'gclid' ||
        key === 'fbclid' ||
        key === 'ttclid' ||
        key === 'msclkid' ||
        key === 'gbraid' ||
        key === 'wbraid' ||
        key === 'li_fat_id' ||
        key === 'email_click_id'
      ) {
        params[key] = decodeURIComponent(pair[1] || '')
      }
    }
    return params
  }

  var FIRST_TOUCH_STORAGE_KEY = '_xf_first_touch_v1'
  var LAST_TOUCH_STORAGE_KEY = '_xf_last_touch_v1'
  var TOUCH_ATTRIBUTION_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid',
    'li_fat_id', 'email_click_id', 'campaign_id', 'adgroup_id', 'ad_group_id', 'asset_group_id',
    'adset_id', 'ad_set_id', 'ad_id', 'creative_id'
  ]
  var _memoryFirstTouch = null
  var _memoryLastTouch = null

  function currentTouch() {
    var params = getUtmParams()
    var touch = {
      landing_page: window.location.href,
      referrer: document.referrer || '',
      captured_at: new Date().toISOString(),
    }
    for (var i = 0; i < TOUCH_ATTRIBUTION_KEYS.length; i++) {
      var key = TOUCH_ATTRIBUTION_KEYS[i]
      if (params[key]) touch[key] = params[key]
    }
    return touch
  }

  function hasCampaignTouch(touch) {
    for (var i = 0; i < TOUCH_ATTRIBUTION_KEYS.length; i++) {
      if (touch[TOUCH_ATTRIBUTION_KEYS[i]]) return true
    }
    return false
  }

  function readTouch(storage, key, fallback) {
    try {
      var raw = storage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch (e) {
      return fallback
    }
  }

  function writeTouch(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value))
    } catch (e) {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }

  function getAttributionTouches() {
    var current = currentTouch()
    var first = readTouch(localStorage, FIRST_TOUCH_STORAGE_KEY, _memoryFirstTouch)
    if (!first) {
      first = current
      _memoryFirstTouch = first
      writeTouch(localStorage, FIRST_TOUCH_STORAGE_KEY, first)
    }

    var last = readTouch(sessionStorage, LAST_TOUCH_STORAGE_KEY, _memoryLastTouch)
    if (!last || hasCampaignTouch(current)) {
      last = current
      _memoryLastTouch = last
      writeTouch(sessionStorage, LAST_TOUCH_STORAGE_KEY, last)
    }

    return { first: first, last: last }
  }

  // Get Facebook cookies
  function getFbCookies() {
    return {
      fbc: getCookie('_fbc'),
      fbp: getCookie('_fbp'),
    }
  }

  // Send event to server
  function track(eventName, eventData, options) {
    var clientId = getClientId()
    var sessionId = getSessionId()
    var touches = getAttributionTouches()
    var utmParams = touches.last || getUtmParams()
    var fbCookies = getFbCookies()

    var payload = {
      client_id: clientId,
      session_id: sessionId,
      event_name: eventName,
      event_data: eventData || {},
      page_url: window.location.href,
      referrer: document.referrer || null,
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      utm_term: utmParams.utm_term,
      utm_content: utmParams.utm_content,
      gclid: utmParams.gclid,
      fbclid: utmParams.fbclid,
      fbc: fbCookies.fbc,
      fbp: fbCookies.fbp,
      ttclid: utmParams.ttclid,
      msclkid: utmParams.msclkid,
      gbraid: utmParams.gbraid,
      wbraid: utmParams.wbraid,
      li_fat_id: utmParams.li_fat_id,
      email_click_id: utmParams.email_click_id,
      timestamp: new Date().toISOString(),
    }

    // Consent gate: suppress non-consented events before any network request
    var consent = getConsent()
    if (!isEventAllowed(eventName, consent)) return

    // No write key → nothing to send to. Never throw (beacon must be silent).
    if (!WRITE_KEY) {
      if (window.console && console.warn) console.warn('[track] missing data-key — event dropped')
      return
    }

    // Generate once and reuse across the browser data layer and server batch.
    // Meta deduplicates only when browser eventID and server event_id match.
    var eventId = resolveEventId(options)

    // Reshape the flat payload into the Slice-1 batch shape the public collect
    // endpoint expects: { events: [{ event_id, anon_id, session_id, occurred_at,
    // attribution: {...}, event_data }] }. event_id is browser-canonical (dedup).
    var batch = {
      events: [{
        event_id: eventId,
        event_name: payload.event_name,
        anon_id: payload.client_id,
        session_id: payload.session_id,
        page_url: payload.page_url,
        referrer: payload.referrer,
        occurred_at: Date.now(),
        attribution: {
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
          utm_term: payload.utm_term,
          utm_content: payload.utm_content,
          gclid: payload.gclid,
          gbraid: payload.gbraid,
          wbraid: payload.wbraid,
          fbclid: payload.fbclid,
          fbc: payload.fbc,
          fbp: payload.fbp,
          ttclid: payload.ttclid,
          msclkid: payload.msclkid,
          li_fat_id: payload.li_fat_id,
          email_click_id: payload.email_click_id,
        },
        event_data: payload.event_data || {},
      }],
      // Forward the raw consent cookie value: it lives on the dealer domain, so
      // our cross-origin endpoint can't read it — relaying it here keeps the
      // server-stored consent snapshot accurate. null when not set.
      consent: getConsentCookieValue() || null,
    }

    // POST cross-origin to OUR origin with the write key on the query string.
    // Prefer fetch with keepalive: some browsers leave cross-origin JSON
    // sendBeacon requests pending indefinitely after a successful preflight.
    // Retain sendBeacon as a best-effort fallback for network-level failures
    // and older browsers without fetch.
    var url = (_scriptOrigin || '') + ENDPOINT + '?k=' + encodeURIComponent(WRITE_KEY)
    var data = JSON.stringify(batch)

    function sendBeaconFallback() {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }))
      }
    }

    if (typeof fetch === 'function') {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true,
          mode: 'cors',
        }).catch(sendBeaconFallback)
      } catch (e) {
        sendBeaconFallback()
      }
    } else {
      sendBeaconFallback()
    }

    // Push to dataLayer for sGTM (if GTM is enabled and event qualifies)
    pushToDataLayer(eventName, eventData, eventId)
    return eventId
  }

  // Detect vehicle context from page URL and structured data
  function getVehicleContext() {
    var path = window.location.pathname
    var ctx = {}

    // Check URL patterns for vehicle detail pages
    if (/\/(vehicle-for-sale|vehicles|cars-for-sale)\//.test(path)) {
      ctx.is_vehicle_page = true

      // Extract vehicle slug from URL path segments
      var segments = path.split('/').filter(Boolean)
      if (segments.length >= 2) {
        ctx.vehicle_slug = segments.slice(1).join('/')
      }
    }

    // Check JSON-LD structured data for vehicle info
    var ldScripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (var i = 0; i < ldScripts.length; i++) {
      try {
        var ld = JSON.parse(ldScripts[i].textContent || '')
        if (ld['@type'] === 'Vehicle' || ld['@type'] === 'Car' || ld['@type'] === 'Product') {
          if (ld.vehicleIdentificationNumber) ctx.vehicle_id = ld.vehicleIdentificationNumber
          if (ld.brand && ld.brand.name) ctx.vehicle_make = ld.brand.name
          if (ld.model) ctx.vehicle_model = ld.model
          if (ld.name) ctx.vehicle_name = ld.name
          break
        }
      } catch (e) {
        /* ignore parse errors */
      }
    }

    // Check meta tags as fallback
    if (!ctx.vehicle_make) {
      var metaMake = document.querySelector(
        'meta[property="vehicle:make"], meta[name="vehicle:make"]'
      )
      if (metaMake) ctx.vehicle_make = metaMake.getAttribute('content')
    }
    if (!ctx.vehicle_model) {
      var metaModel = document.querySelector(
        'meta[property="vehicle:model"], meta[name="vehicle:model"]'
      )
      if (metaModel) ctx.vehicle_model = metaModel.getAttribute('content')
    }

    return Object.keys(ctx).length > 0 ? ctx : null
  }

  // Auto-track page views
  function trackPageView() {
    var data = {
      title: document.title,
      path: window.location.pathname,
    }

    // Merge vehicle context if on a vehicle page
    var vehicleCtx = getVehicleContext()
    if (vehicleCtx) {
      for (var key in vehicleCtx) {
        if (vehicleCtx.hasOwnProperty(key)) {
          data[key] = vehicleCtx[key]
        }
      }
    }

    track('page_view', data)

    // Fire separate vehicle_view for dynamic remarketing (maps to view_item in dataLayer)
    if (vehicleCtx) {
      track('vehicle_view', vehicleCtx)
    }
  }

  // Track clicks on configured selectors (with dead click detection)
  function setupClickTracking(selectors) {
    if (!selectors || !selectors.length) return

    document.addEventListener('click', function (e) {
      var target = e.target
      for (var i = 0; i < 5; i++) {
        // Check up to 5 parent levels
        if (!target) break
        for (var j = 0; j < selectors.length; j++) {
          if (target.matches && target.matches(selectors[j])) {
            var clickData = {
              selector: selectors[j],
              text: (target.textContent || '').substring(0, 100),
              href: target.href || null,
            }
            track('click', clickData)

            // Dead click detection: if no navigation/submit within 500ms, record dead_click
            var navigated = false
            function onNav() {
              navigated = true
            }
            window.addEventListener('popstate', onNav)
            window.addEventListener('hashchange', onNav)
            var origPush = history.pushState
            history.pushState = function () {
              navigated = true
              return origPush.apply(history, arguments)
            }
            document.addEventListener('submit', onNav)

            setTimeout(function () {
              window.removeEventListener('popstate', onNav)
              window.removeEventListener('hashchange', onNav)
              history.pushState = origPush
              document.removeEventListener('submit', onNav)
              if (!navigated) {
                track('dead_click', clickData)
              }
            }, 500)

            return
          }
        }
        target = target.parentElement
      }
    })
  }

  // Track form submissions
  function setTrackingFormField(form, name, value) {
    if (!value || !form) return
    var existing = form.elements && form.elements.namedItem
      ? form.elements.namedItem(name)
      : null
    if (existing && typeof existing.value !== 'undefined') {
      existing.value = value
      return
    }
    var input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    input.setAttribute('data-zeroflow-attribution', 'true')
    form.appendChild(input)
  }

  function attachFormAttribution(form, eventId) {
    var touches = getAttributionTouches()
    setTrackingFormField(form, 'zeroflow_browser_event_id', eventId)
    setTrackingFormField(form, 'zeroflow_anon_id', getClientId())
    setTrackingFormField(form, 'zeroflow_session_id', getSessionId())
    setTrackingFormField(form, 'zeroflow_landing_page', touches.last.landing_page)
    setTrackingFormField(form, 'zeroflow_first_referrer', touches.first.referrer)

    for (var touchIndex = 0; touchIndex < 2; touchIndex++) {
      var touchName = touchIndex === 0 ? 'first' : 'last'
      var touch = touches[touchName]
      setTrackingFormField(form, 'zeroflow_' + touchName + '_landing_page', touch.landing_page)
      setTrackingFormField(form, 'zeroflow_' + touchName + '_referrer', touch.referrer)
      for (var keyIndex = 0; keyIndex < TOUCH_ATTRIBUTION_KEYS.length; keyIndex++) {
        var key = TOUCH_ATTRIBUTION_KEYS[keyIndex]
        if (touch[key]) {
          setTrackingFormField(form, 'zeroflow_' + touchName + '_' + key, touch[key])
          if (touchName === 'last') setTrackingFormField(form, 'zeroflow_' + key, touch[key])
        }
      }
    }
  }

  function leadIntentField(form, kind) {
    if (!form) return ''
    var fields = form.querySelectorAll
      ? form.querySelectorAll('input, select, textarea')
      : form.elements
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i]
      if (!field || field.disabled || !field.value) continue
      var type = String(field.type || '').toLowerCase()
      if (type === 'password' || type === 'file') continue
      var identity = [
        field.name || '',
        field.id || '',
        field.autocomplete || '',
        type
      ].join(' ').toLowerCase()
      if (kind === 'email' && (type === 'email' || /(^|[^a-z])(e-?mail)([^a-z]|$)/.test(identity))) {
        return String(field.value).trim().slice(0, 320)
      }
      if (kind === 'phone' && (type === 'tel' || /(phone|mobile|telephone|cell)/.test(identity))) {
        return String(field.value).trim().slice(0, 64)
      }
      if (kind === 'vehicle' && /(stock[_ -]?(number|no)?|vehicle[_ -]?id|vin)/.test(identity)) {
        return String(field.value).trim().slice(0, 128)
      }
    }
    return ''
  }

  function leadSubmissionIdentity(form) {
    return {
      email: leadIntentField(form, 'email'),
      phone: leadIntentField(form, 'phone'),
    }
  }

  function isLeadSubmissionForm(form, identity) {
    if (!form || !identity || (!identity.email && !identity.phone)) return false

    var explicit = String(form.getAttribute('data-zeroflow-lead') || '').toLowerCase()
    if (explicit === 'false' || form.hasAttribute('data-zeroflow-ignore')) return false
    if (explicit === 'true') return true

    if (String(form.getAttribute('role') || '').toLowerCase() === 'search') return false
    if (form.querySelector && form.querySelector('input[type="password"]')) return false

    var descriptor = [
      form.id || '',
      form.name || '',
      form.action || '',
      form.className || '',
      form.getAttribute('aria-label') || '',
    ].join(' ').toLowerCase()
    if (/(^|[^a-z])(search|filter|sort|login|log-in|sign-in|signin|password|newsletter|subscribe|unsubscribe|checkout|payment)([^a-z]|$)/.test(descriptor)) {
      return false
    }

    var method = String(form.method || 'get').toLowerCase()
    if (
      method === 'get'
      && form.querySelector
      && form.querySelector('input[type="search"], input[name*="search" i], input[name="q" i], input[name="query" i]')
    ) {
      return false
    }

    return true
  }

  function intentAttribution(touches) {
    var result = {}
    for (var touchIndex = 0; touchIndex < 2; touchIndex++) {
      var touchName = touchIndex === 0 ? 'first' : 'last'
      var touch = touches[touchName] || {}
      if (touch.landing_page) result[touchName + '_landing_page'] = touch.landing_page
      if (touch.referrer) result[touchName + '_referrer'] = touch.referrer
      for (var keyIndex = 0; keyIndex < TOUCH_ATTRIBUTION_KEYS.length; keyIndex++) {
        var key = TOUCH_ATTRIBUTION_KEYS[keyIndex]
        if (touch[key]) result[touchName + '_' + key] = touch[key]
      }
    }
    var last = touches.last || {}
    for (var i = 0; i < TOUCH_ATTRIBUTION_KEYS.length; i++) {
      var attributionKey = TOUCH_ATTRIBUTION_KEYS[i]
      if (last[attributionKey]) result[attributionKey] = last[attributionKey]
    }
    if (last.landing_page) result.landing_page = last.landing_page
    return result
  }

  function sendLeadSubmissionIntent(form, eventId, identity) {
    if (!WRITE_KEY) return
    var consent = getConsent()
    if (consent && consent.updatedAt !== null && consent.updatedAt !== undefined && !consent.tracking) return
    var email = identity && identity.email ? identity.email : ''
    var phone = identity && identity.phone ? identity.phone : ''
    if (!email && !phone) return

    var payload = {
      browser_event_id: eventId,
      occurred_at: Date.now(),
      form_id: form.id || form.name || null,
      page_url: window.location.href,
      vehicle_reference: leadIntentField(form, 'vehicle') || null,
      identity: {
        email: email || undefined,
        phone: phone || undefined,
      },
      attribution: intentAttribution(getAttributionTouches()),
      consent: getConsentCookieValue() || null,
    }
    var url = (_scriptOrigin || '') + '/api/public/lead-intent?k=' + encodeURIComponent(WRITE_KEY)
    var body = JSON.stringify(payload)

    function beaconFallback() {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      }
    }

    if (typeof fetch === 'function') {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
          mode: 'cors',
        }).catch(beaconFallback)
      } catch (e) {
        beaconFallback()
      }
    } else {
      beaconFallback()
    }
  }

  function setupFormTracking() {
    function onTrackedFormSubmit(e) {
      var form = e.target
      if (form.tagName !== 'FORM') return
      var eventId = resolveEventId()
      var identity = leadSubmissionIdentity(form)
      var leadEligible = isLeadSubmissionForm(form, identity)
      if (leadEligible) {
        attachFormAttribution(form, eventId)
        sendLeadSubmissionIntent(form, eventId, identity)
      }

      track('form_submit', {
        form_id: form.id || null,
        form_name: form.name || null,
        form_action: form.action || null,
        lead_eligible: leadEligible,
      }, { eventId: eventId, event_id: eventId })
    }
    document.addEventListener('submit', onTrackedFormSubmit, true)
    _behavioralCleanups.push(function () {
      document.removeEventListener('submit', onTrackedFormSubmit, true)
    })
  }

  // Track scroll depth
  function setupScrollTracking() {
    var depths = SCROLL_DEPTHS
    var tracked = {}

    function checkScroll() {
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop
      var docHeight = document.documentElement.scrollHeight - window.innerHeight
      var percent = Math.round((scrollTop / docHeight) * 100)

      for (var i = 0; i < depths.length; i++) {
        var depth = depths[i]
        if (percent >= depth && !tracked[depth]) {
          tracked[depth] = true
          track('scroll', { depth: depth })
        }
      }
    }

    var scrollTimer
    window.addEventListener('scroll', function () {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(checkScroll, SCROLL_DEBOUNCE_MS)
    })
  }

  // Track time on page
  function setupEngagementTracking() {
    var startTime = Date.now()
    var intervals = ENGAGEMENT_INTERVALS
    var tracked = {}

    _engagementInterval = setInterval(function () {
      var elapsed = Math.floor((Date.now() - startTime) / 1000)
      for (var i = 0; i < intervals.length; i++) {
        var interval = intervals[i]
        if (elapsed >= interval && !tracked[interval]) {
          tracked[interval] = true
          track('engagement', { duration: interval })
        }
      }
    }, ENGAGEMENT_CHECK_MS)
  }

  // Cross-domain session linking
  function linkSession(targetDomain) {
    var clientId = getClientId()
    var sessionId = getSessionId()
    return targetDomain + '?_engagr_link=' + encodeURIComponent(clientId + ':' + sessionId)
  }

  // Accept linked session from another domain
  function acceptLinkedSession() {
    var params = new URLSearchParams(window.location.search)
    var link = params.get('_engagr_link')
    if (link) {
      var parts = link.split(':')
      if (parts.length === 2) {
        setCookie(COOKIE_NAME, parts[0], COOKIE_DAYS)
        setCookie(SESSION_COOKIE, parts[1], SESSION_MINUTES / (24 * 60))
      }
    }
  }

  // =====================================================
  // BEHAVIORAL SIGNALS (opt-in via config.behavioral)
  // =====================================================

  // State for cleanup
  var _engagementInterval = null
  var _behavioralCleanups = []

  // -- Rage Click Detection --
  function setupRageClickDetection() {
    var clickBuffer = []

    function getSelector(el) {
      if (!el || !el.tagName) return 'unknown'
      if (el.id) return '#' + el.id
      var tag = el.tagName.toLowerCase()
      var cls =
        el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : ''
      return tag + cls
    }

    function onRageClick(e) {
      var now = Date.now()
      clickBuffer.push({ t: now, x: e.clientX, y: e.clientY })

      // Prune old entries
      while (clickBuffer.length > 0 && now - clickBuffer[0].t > RAGE_WINDOW_MS) {
        clickBuffer.shift()
      }

      if (clickBuffer.length >= RAGE_THRESHOLD) {
        var first = clickBuffer[0]
        var allClose = true
        for (var i = 1; i < clickBuffer.length; i++) {
          var dx = clickBuffer[i].x - first.x
          var dy = clickBuffer[i].y - first.y
          if (Math.sqrt(dx * dx + dy * dy) > RAGE_RADIUS) {
            allClose = false
            break
          }
        }

        if (allClose) {
          var target = e.target
          track('rage_click', {
            selector: getSelector(target),
            click_count: clickBuffer.length,
            text: ((target && target.textContent) || '').substring(0, 100),
          })
          clickBuffer.length = 0
        }
      }
    }

    document.addEventListener('click', onRageClick)
    _behavioralCleanups.push(function () {
      document.removeEventListener('click', onRageClick)
    })
  }

  // -- Video Engagement Depth --
  function setupVideoTracking() {
    var videoMilestones = {} // keyed by video src/id
    var MILESTONES = VIDEO_MILESTONES

    function getVideoKey(video) {
      return video.id || video.src || video.currentSrc || 'unknown'
    }

    function onTimeUpdate(e) {
      var video = e.target
      if (!video || !video.duration) return

      var key = getVideoKey(video)
      var percent = Math.round((video.currentTime / video.duration) * 100)

      if (!videoMilestones[key]) {
        videoMilestones[key] = {}
      }

      for (var i = 0; i < MILESTONES.length; i++) {
        var milestone = MILESTONES[i]
        if (percent >= milestone && !videoMilestones[key][milestone]) {
          videoMilestones[key][milestone] = true
          track('video_progress', {
            video_id: key,
            milestone: milestone,
            duration: Math.round(video.duration),
            progress: percent,
          })
        }
      }
    }

    // Listen on existing and future video elements via event delegation
    document.addEventListener('timeupdate', onTimeUpdate, true)
    _behavioralCleanups.push(function () {
      document.removeEventListener('timeupdate', onTimeUpdate, true)
    })
  }

  // -- Idle State Detection --
  function setupIdleDetection() {
    var idleTimer = null
    var idleStartTime = null
    var extendedFired = {}
    var extendedTimers = []
    var activityDebounce = null

    function clearExtendedTimers() {
      for (var i = 0; i < extendedTimers.length; i++) {
        clearTimeout(extendedTimers[i])
      }
      extendedTimers = []
      extendedFired = {}
    }

    function onActivity() {
      if (activityDebounce) return
      activityDebounce = setTimeout(function () {
        activityDebounce = null
      }, IDLE_ACTIVITY_DEBOUNCE_MS)

      // If idle, fire idle_end
      if (idleStartTime !== null) {
        var duration = Math.round((Date.now() - idleStartTime) / 1000)
        track('idle_end', { idle_duration_seconds: duration })
        idleStartTime = null
        clearExtendedTimers()
      }

      if (idleTimer) clearTimeout(idleTimer)

      idleTimer = setTimeout(function () {
        idleStartTime = Date.now()
        track('idle_start', { timestamp: new Date(idleStartTime).toISOString() })

        // Schedule extended idle events
        for (var i = 0; i < IDLE_EXTENDED_THRESHOLDS.length; i++) {
          ;(function (threshold) {
            extendedTimers.push(
              setTimeout(
                function () {
                  if (idleStartTime && !extendedFired[threshold]) {
                    extendedFired[threshold] = true
                    track('idle_extended', { threshold_seconds: threshold })
                  }
                },
                (threshold - 60) * 1000
              )
            )
          })(IDLE_EXTENDED_THRESHOLDS[i])
        }
      }, IDLE_TIMEOUT_MS)
    }

    var events = ['scroll', 'click', 'mousemove', 'keypress']
    for (var i = 0; i < events.length; i++) {
      window.addEventListener(events[i], onActivity, { passive: true })
    }
    // Start idle timer immediately
    onActivity()

    _behavioralCleanups.push(function () {
      for (var i = 0; i < events.length; i++) {
        window.removeEventListener(events[i], onActivity)
      }
      if (idleTimer) clearTimeout(idleTimer)
      if (activityDebounce) clearTimeout(activityDebounce)
      clearExtendedTimers()
    })
  }

  // -- Form Field Focus Time & Abandonment --
  function setupFormFieldTracking() {
    var formInteractions = {} // keyed by form id/action
    var fieldTimings = {} // keyed by form key -> field name -> ms

    function getFormKey(form) {
      return form.id || form.action || 'form_' + Array.prototype.indexOf.call(document.forms, form)
    }

    function onFocusIn(e) {
      var el = e.target
      if (!el || !el.form) return
      var formKey = getFormKey(el.form)
      var fieldName = el.name || el.id || el.type || 'unknown'

      // Mark form as interacted
      if (!formInteractions[formKey]) {
        formInteractions[formKey] = { startTime: Date.now(), fields: {}, submitted: false }
      }
      formInteractions[formKey].fields[fieldName] = true

      // Record focus start for timing
      if (!fieldTimings[formKey]) fieldTimings[formKey] = {}
      el._engagrFocusStart = Date.now()
    }

    function onFocusOut(e) {
      var el = e.target
      if (!el || !el.form || !el._engagrFocusStart) return
      var formKey = getFormKey(el.form)
      var fieldName = el.name || el.id || el.type || 'unknown'

      var elapsed = Date.now() - el._engagrFocusStart
      delete el._engagrFocusStart

      if (!fieldTimings[formKey]) fieldTimings[formKey] = {}
      fieldTimings[formKey][fieldName] = (fieldTimings[formKey][fieldName] || 0) + elapsed
    }

    function onSubmit(e) {
      var form = e.target
      if (!form || form.tagName !== 'FORM') return
      var formKey = getFormKey(form)
      if (formInteractions[formKey]) {
        formInteractions[formKey].submitted = true

        // Include field timings in form_submit event
        if (fieldTimings[formKey]) {
          track('form_field_timings', {
            form_id: form.id || null,
            form_action: form.action || null,
            field_timings: fieldTimings[formKey],
            total_time: Math.round((Date.now() - formInteractions[formKey].startTime) / 1000),
          })
        }
      }
    }

    function onBeforeUnload() {
      for (var formKey in formInteractions) {
        var interaction = formInteractions[formKey]
        if (interaction.submitted) continue
        if (!Object.keys(interaction.fields).length) continue

        var totalTime = Math.round((Date.now() - interaction.startTime) / 1000)
        var fields = Object.keys(interaction.fields)

        // Route through track() so the event gets the write-key URL, absolute
        // origin and Slice-1 batch shape. Its keepalive transport is eligible
        // to finish during unload. Never post the old flat shape to a bare path.
        track('form_abandonment', {
          form_key: formKey,
          fields_interacted: fields,
          field_count: fields.length,
          total_time_seconds: totalTime,
          field_timings: fieldTimings[formKey] || {},
        })
      }
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('submit', onSubmit)
    window.addEventListener('beforeunload', onBeforeUnload)

    _behavioralCleanups.push(function () {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('submit', onSubmit)
      window.removeEventListener('beforeunload', onBeforeUnload)
    })
  }

  // =====================================================
  // INITIALIZATION & PUBLIC API
  // =====================================================

  // Initialize
  function init(config) {
    config = config || {}

    // Write key may arrive via the auto-init boot config (read from data-key in
    // the footer, where document.currentScript is reliable) or a manual init().
    if (config.writeKey) WRITE_KEY = config.writeKey

    // Apply config overrides to module-level defaults
    var c = config.constants || {}
    if (c.cookieDays) COOKIE_DAYS = c.cookieDays
    if (c.sessionMinutes) SESSION_MINUTES = c.sessionMinutes
    if (c.scrollDepths) SCROLL_DEPTHS = c.scrollDepths
    if (c.engagementIntervals) ENGAGEMENT_INTERVALS = c.engagementIntervals
    if (c.engagementCheckMs) ENGAGEMENT_CHECK_MS = c.engagementCheckMs
    if (c.scrollDebounceMs) SCROLL_DEBOUNCE_MS = c.scrollDebounceMs
    if (c.rageWindowMs) RAGE_WINDOW_MS = c.rageWindowMs
    if (c.rageThreshold) RAGE_THRESHOLD = c.rageThreshold
    if (c.rageRadius) RAGE_RADIUS = c.rageRadius
    if (c.videoMilestones) VIDEO_MILESTONES = c.videoMilestones
    if (c.idleTimeoutMs) IDLE_TIMEOUT_MS = c.idleTimeoutMs
    if (c.idleExtendedThresholds) IDLE_EXTENDED_THRESHOLDS = c.idleExtendedThresholds
    if (c.idleActivityDebounceMs) IDLE_ACTIVITY_DEBOUNCE_MS = c.idleActivityDebounceMs

    // Accept linked sessions first
    acceptLinkedSession()

    // Resolve script origin so the beacon posts cross-origin to OUR origin.
    // document.currentScript is null inside a DOMContentLoaded callback, so fall
    // back to locating our own tag by src (this file ships as track.js).
    var scriptEl = document.currentScript || document.querySelector('script[src*="track.js"]')
    if (scriptEl && scriptEl.src) {
      try {
        _scriptOrigin = new URL(scriptEl.src).origin
      } catch (e) {
        _scriptOrigin = ''
      }
    }

    // GTM auto-injection bridge is OFF by default in Slice 1 (we do not serve
    // /api/tracking/config; dealers install this tag VIA GTM, not vice-versa).
    // Opt in with init({ gtmBridge: true }) only if a config endpoint exists.
    if (config.dataLayerBridge) {
      enableExistingDataLayerBridge()
    } else if (config.gtmBridge && _scriptOrigin) {
      fetchGtmConfig(_scriptOrigin, function (configData) {
        injectGtmScript(configData, _scriptOrigin)
      })
    }

    // Track page view
    trackPageView()

    // Setup automatic tracking
    if (config.clicks !== false) {
      setupClickTracking(config.clickSelectors || ['a[href]', 'button', '[data-track]'])
    }
    if (config.forms !== false) {
      setupFormTracking()
    }

    // Track phone number clicks (tel: links)
    document.addEventListener('click', function (e) {
      var target = e.target
      for (var i = 0; i < 5; i++) {
        if (!target) break
        if (target.tagName === 'A' && target.href && target.href.indexOf('tel:') === 0) {
          track('phone_click', {
            phone_number: target.href.replace('tel:', '').trim(),
            link_text: (target.textContent || '').substring(0, 100),
          })
          return
        }
        target = target.parentElement
      }
    })

    // Competitive referrer detection
    var AUTOMOTIVE_PLATFORMS = {
      'carsales.com.au': 'carsales',
      'cargurus.com.au': 'cargurus',
      'autotrader.com.au': 'autotrader',
      'facebook.com': 'facebook_marketplace',
      'gumtree.com.au': 'gumtree',
      'drive.com.au': 'drive',
      'caradvice.com.au': 'caradvice',
      'redbook.com.au': 'redbook',
    }
    var ref = document.referrer
    if (ref) {
      try {
        var refHost = new URL(ref).hostname
        for (var domain in AUTOMOTIVE_PLATFORMS) {
          if (refHost.indexOf(domain) !== -1) {
            var compKey = '_engagr_comp_ref'
            if (!sessionStorage.getItem(compKey)) {
              sessionStorage.setItem(compKey, AUTOMOTIVE_PLATFORMS[domain])
              track('competitive_referrer', {
                source_platform: AUTOMOTIVE_PLATFORMS[domain],
                landing_page: window.location.pathname,
              })
            }
            break
          }
        }
      } catch (e) {
        /* ignore */
      }
    }

    if (config.scroll !== false) {
      setupScrollTracking()
    }
    if (config.engagement !== false) {
      setupEngagementTracking()
    }

    // Behavioral signals (opt-in)
    if (config.behavioral) {
      setupRageClickDetection()
      setupVideoTracking()
      setupIdleDetection()
      setupFormFieldTracking()
    }

    // Handle SPA navigation
    if (config.spa) {
      var pushState = history.pushState
      history.pushState = function () {
        pushState.apply(history, arguments)
        trackPageView()
      }
      window.addEventListener('popstate', trackPageView)
    }
  }

  // Destroy and cleanup all listeners
  function destroy() {
    for (var i = 0; i < _behavioralCleanups.length; i++) {
      _behavioralCleanups[i]()
    }
    _behavioralCleanups = []
    if (_engagementInterval) {
      clearInterval(_engagementInterval)
      _engagementInterval = null
    }
  }

  // Expose API under a distinct global so we never collide with any pre-existing
  // Engagr tag on the dealer site (window.engagrTrack).
  window.xf = {
    init: init,
    track: track,
    setConsent: setConsent,
    createEventId: generateEventId,
    destroy: destroy,
    linkSession: linkSession,
    getClientId: getClientId,
    getSessionId: getSessionId,
  }

  // Auto-init from the script tag's data attributes. document.currentScript is
  // null when the tag is injected dynamically (e.g. GTM Custom HTML appends an
  // async <script>), so fall back to locating our own tag by its data-key (then
  // by src). Without this, GTM-installed sites would never call init().
  var script = document.currentScript
    || document.querySelector('script[data-key][src*="track.js"]')
    || document.querySelector('script[src*="track.js"]')
  if (script) {
    var autoInit = script.getAttribute('data-auto') !== 'false'
    if (autoInit) {
      var bootCfg = {
        writeKey: script.getAttribute('data-key') || '',
        spa: script.getAttribute('data-spa') === 'true',
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          init(bootCfg)
        })
      } else {
        init(bootCfg)
      }
    }
  }
})(window, document)
