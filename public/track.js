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
  var RETURN_TO_VEHICLE_MIN_DAYS = 0
  var _funnelSignalsEnabled = true

  // =====================================================
  // sGTM BRIDGE (optional — loads GTM when dealer has it enabled)
  // =====================================================

  var _gtmConfig = null
  var _gtmReady = false
  var _pendingDataLayerPushes = []
  var _scriptOrigin = ''
  var _initialized = false
  // Reuses provider context fields for the same caller-owned submission ID.
  // Each retry still re-emits that ID so the server can recover a lost browser
  // request with its unique (site_id, event_id) deduplication. This is only
  // same-page state, not visitor identity storage.
  var _leadContextByEventId = Object.create(null)
  var _leadCaptureTest = null

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
    vehicle_comparison: 'vehicle_comparison',
    exit_intent: 'exit_intent',
    add_to_wishlist: 'add_to_wishlist',
    cta_visible: 'cta_visible',
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

  // Google Consent Mode v2 — maps our internal categories to the 4 required
  // gtag parameter names. Mandatory for EEA/UK traffic since March 2024:
  // without these, Google Ads/GA4 restrict remarketing and conversion
  // modeling for gated regions rather than erroring loudly. Defaults to
  // denied when no explicit cookie exists yet (safest universal default —
  // the client can't see cf-ipcountry the way the server can, so this
  // mirrors Google's own recommended default-deny-then-update pattern).
  function consentModeParams(consent) {
    var analyticsGranted = !!(consent && consent.analytics)
    var marketingGranted = !!(consent && consent.marketing)
    return {
      ad_storage: marketingGranted ? 'granted' : 'denied',
      analytics_storage: analyticsGranted ? 'granted' : 'denied',
      ad_user_data: marketingGranted ? 'granted' : 'denied',
      ad_personalization: marketingGranted ? 'granted' : 'denied',
    }
  }

  // Equivalent to gtag('consent', command, params) — gtag.js is itself just
  // `function gtag(){dataLayer.push(arguments)}`, so this works whether or
  // not gtag.js/GTM has loaded yet, and independently of our own optional
  // GTM event bridge (a dealer's separately-installed GTM container should
  // still receive consent signals even if that bridge is off for this site).
  function pushConsentToDataLayer(command, consent) {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push(['consent', command, consentModeParams(consent)])
  }

  // Read and parse the consent cookie
  // Returns null if no cookie or parse failure
  function getConsent() {
    var raw = getCookie(CONSENT_COOKIE_NAME)
    if (!raw) return null
    try {
      var parsed = JSON.parse(raw)
      return parsed
    } catch (e) {
      return null
    }
  }

  // First-party consent API for a client banner or preference centre.
  // Client authorization in the XeroFlow portal is separate from this
  // person-level decision and never overrides it.
  function setConsent(preferences) {
    preferences = preferences || {}
    var snapshot = {
      tracking: preferences.tracking === true,
      analytics: preferences.analytics === true,
      marketing: preferences.marketing === true,
      updatedAt: new Date().toISOString(),
      policyVersion: String(preferences.policyVersion || 'client-default-v1').slice(0, 100),
      noticeUrl: preferences.noticeUrl ? String(preferences.noticeUrl).slice(0, 2048) : null,
      decisionMethod: String(preferences.decisionMethod || 'preference_center').slice(0, 80),
    }
    if (!snapshot.analytics) {
      try {
        localStorage.removeItem(VEHICLE_VISITS_STORAGE_KEY)
        sessionStorage.removeItem(SESSION_VEHICLES_STORAGE_KEY)
      } catch (e) {
        /* storage unavailable — ignore */
      }
    }
    setCookie(CONSENT_COOKIE_NAME, JSON.stringify(snapshot), 365)
    pushConsentToDataLayer('update', snapshot)
    track('consent_update', { consent_updated: true })
    return snapshot
  }

  window.XeroFlowConsent = window.XeroFlowConsent || {}
  window.XeroFlowConsent.get = getConsent
  window.XeroFlowConsent.set = setConsent

  // Gate an event against the current consent state.
  // Category lists MUST mirror shouldAllowEvent() in server/api/tracking/collect.post.ts.
  function isEventAllowed(eventName, consent) {
    // Essential events always fire regardless of consent state
    var essentialEvents = ['page_view', 'session_start', 'session_end', 'consent_update']
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
      'return_to_vehicle',
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
      'exit_intent',
      'cta_visible',
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
        key === 'email_click_id' ||
        key === 'xf_qr' || // XeroFlow QR code click id
        key === 'xf_qr_variant' // XeroFlow QR A/B arm
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
    'li_fat_id', 'email_click_id', 'xf_qr', 'xf_qr_variant', 'campaign_id', 'adgroup_id', 'ad_group_id', 'asset_group_id',
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

  // Extract GA4's real client_id from the _ga cookie (format GA1.1.<part1>.<part2>
  // or GA1.2.<part1>.<part2>) so server-side Measurement Protocol hits correlate
  // with the visitor's actual GA4 session instead of creating a disconnected
  // synthetic user. Null when GA4/gtag.js hasn't set the cookie yet, or isn't
  // installed on this site.
  function getGaClientId() {
    var raw = getCookie('_ga')
    if (!raw) return null
    var parts = raw.split('.')
    if (parts.length < 4) return null
    return parts[2] + '.' + parts[3]
  }

  // Send event to server
  function track(eventName, eventData, options) {
    var hasAnonIdOverride = options && Object.prototype.hasOwnProperty.call(options, 'anonId')
    var hasSessionIdOverride = options && Object.prototype.hasOwnProperty.call(options, 'sessionId')
    var clientId = hasAnonIdOverride ? options.anonId : getClientId()
    var sessionId = hasSessionIdOverride ? options.sessionId : getSessionId()
    var touches = getAttributionTouches()
    var hasAttributionOverride = options && Object.prototype.hasOwnProperty.call(options, 'attribution')
    var hasFbCookiesOverride = options && Object.prototype.hasOwnProperty.call(options, 'fbCookies')
    var utmParams = hasAttributionOverride ? options.attribution : (touches.last || getUtmParams())
    var fbCookies = hasFbCookiesOverride ? options.fbCookies : getFbCookies()
    var hasPageUrlOverride = options && Object.prototype.hasOwnProperty.call(options, 'pageUrl')
    var hasReferrerOverride = options && Object.prototype.hasOwnProperty.call(options, 'referrer')
    var hasConsentOverride = options && Object.prototype.hasOwnProperty.call(options, 'consent')
    var gaClientId = getGaClientId()

    var payload = {
      client_id: clientId,
      session_id: sessionId,
      event_name: eventName,
      event_data: eventData || {},
      page_url: hasPageUrlOverride ? options.pageUrl : window.location.href,
      referrer: hasReferrerOverride ? options.referrer : (document.referrer || null),
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      utm_term: utmParams.utm_term,
      utm_content: utmParams.utm_content,
      gclid: utmParams.gclid,
      fbclid: utmParams.fbclid,
      fbc: fbCookies.fbc,
      fbp: fbCookies.fbp,
      ga_client_id: gaClientId,
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
          ga_client_id: payload.ga_client_id,
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
      consent: hasConsentOverride ? options.consent : (getCookie(CONSENT_COOKIE_NAME) || null),
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

  // Built-in generic vehicle-detail-page URL segments. Dealer platforms vary
  // a lot (e.g. one real client's actual URLs are /cars/used-black-2021-...,
  // which none of the original three patterns matched, so that client got
  // zero vehicle_view events). _customVehiclePatterns (below, populated from
  // data-vehicle-patterns / init({ vehiclePatterns }) per site) covers
  // anything this generic list still misses without needing a script change.
  var VEHICLE_PAGE_PATTERNS = [
    'vehicle-for-sale', 'vehicles', 'cars-for-sale', 'cars',
    'inventory', 'vdp', 'stock', 'vehicle-details'
  ]
  var _customVehiclePatterns = []

  // A trailing stock-number-shaped suffix (e.g. -s20544, -stock20544) on the
  // last path segment is a strong, platform-agnostic signal of a vehicle
  // detail page on its own, independent of which path segment precedes it.
  var STOCK_NUMBER_RE = /-(?:s|stock)-?(\d{3,})$/i

  // Detect vehicle context from page URL and structured data
  function getVehicleContext() {
    var path = window.location.pathname
    var ctx = {}
    var segments = path.split('/').filter(Boolean)
    var allPatterns = VEHICLE_PAGE_PATTERNS.concat(_customVehiclePatterns)

    // Check URL patterns for vehicle detail pages
    for (var p = 0; p < allPatterns.length; p++) {
      var pattern = allPatterns[p]
      if (!pattern) continue
      if (path.indexOf('/' + pattern + '/') !== -1) {
        ctx.is_vehicle_page = true
        break
      }
    }

    // Bonus: a stock-number-shaped last segment, regardless of whether a
    // named pattern matched above.
    if (segments.length) {
      var lastSegment = segments[segments.length - 1]
      var stockMatch = STOCK_NUMBER_RE.exec(lastSegment)
      if (stockMatch) {
        ctx.is_vehicle_page = true
        ctx.vehicle_stock_number = stockMatch[1]
      }
    }

    if (ctx.is_vehicle_page && segments.length >= 2) {
      ctx.vehicle_slug = segments.slice(1).join('/')
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

  var VEHICLE_VISITS_STORAGE_KEY = '_xf_vehicle_visits_v1'
  var VEHICLE_VISITS_MAX_ENTRIES = 50

  function vehicleKey(ctx) {
    if (!ctx) return null
    return ctx.vehicle_stock_number || ctx.vehicle_slug || null
  }

  function readVehicleVisits() {
    try {
      var raw = localStorage.getItem(VEHICLE_VISITS_STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  }

  function writeVehicleVisits(visits) {
    try {
      var cutoff = Date.now() - 90 * 86400000
      var keys = Object.keys(visits)
      for (var k = 0; k < keys.length; k++) {
        if (visits[keys[k]] < cutoff) delete visits[keys[k]]
      }
      keys = Object.keys(visits)
      if (keys.length > VEHICLE_VISITS_MAX_ENTRIES) {
        keys.sort(function (a, b) { return visits[a] - visits[b] })
        var toRemove = keys.slice(0, keys.length - VEHICLE_VISITS_MAX_ENTRIES)
        for (var i = 0; i < toRemove.length; i++) delete visits[toRemove[i]]
      }
      localStorage.setItem(VEHICLE_VISITS_STORAGE_KEY, JSON.stringify(visits))
    } catch (e) {
      /* storage unavailable or full — ignore */
    }
  }

  // Fires return_to_vehicle when the same vehicle (by stock number/slug) was
  // last seen in an earlier session — the strongest single purchase-intent
  // signal in automotive retargeting. Always records the visit regardless of
  // whether the event fires, so the *next* visit's gap is measured correctly.
  function trackReturnToVehicle(vehicleCtx) {
    var key = vehicleKey(vehicleCtx)
    if (!key) return
    var visits = readVehicleVisits()
    var lastSeen = visits[key]
    if (lastSeen) {
      var elapsedMs = Date.now() - lastSeen
      var isNewSession = elapsedMs > SESSION_MINUTES * 60 * 1000
      var daysSince = Math.floor(elapsedMs / 86400000)
      if (isNewSession && daysSince >= RETURN_TO_VEHICLE_MIN_DAYS) {
        track('return_to_vehicle', { vehicle_key: key, days_since_last_visit: daysSince })
      }
    }
    visits[key] = Date.now()
    writeVehicleVisits(visits)
  }

  var SESSION_VEHICLES_STORAGE_KEY = '_xf_session_vehicles_v1'
  var SESSION_VEHICLES_MAX_ENTRIES = 20
  var COMPARISON_THRESHOLDS = [2, 3, 5]

  function readSessionVehicles() {
    try {
      var raw = sessionStorage.getItem(SESSION_VEHICLES_STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  }

  // Fires vehicle_comparison when the count of distinct vehicles viewed this
  // session crosses a configured threshold — "viewed 3+ mid-size SUVs" is a
  // materially better retargeting signal than "visited the site."
  function trackCrossShop(vehicleCtx) {
    var key = vehicleKey(vehicleCtx)
    if (!key) return
    var vehicles = readSessionVehicles()
    if (vehicles.indexOf(key) !== -1) return
    vehicles.push(key)
    if (vehicles.length > SESSION_VEHICLES_MAX_ENTRIES) vehicles.shift()
    try {
      sessionStorage.setItem(SESSION_VEHICLES_STORAGE_KEY, JSON.stringify(vehicles))
    } catch (e) {
      /* storage unavailable or full — ignore */
    }
    if (COMPARISON_THRESHOLDS.indexOf(vehicles.length) !== -1) {
      track('vehicle_comparison', {
        distinct_vehicles_viewed: vehicles.length,
        vehicle_keys: vehicles.slice(-10)
      })
    }
  }

  var EXIT_INTENT_SESSION_KEY = '_xf_exit_intent_fired_v1'

  // Desktop-only (mouse trajectory has no reliable mobile equivalent).
  // Debounced to once per session via a sessionStorage flag, not the
  // comparison-set list, since it's unrelated to which vehicles were viewed.
  function setupExitIntentDetection() {
    function onMouseOut(e) {
      if (e.clientY > 0 || e.relatedTarget !== null) return
      if (!isEventAllowed('exit_intent', getConsent())) return
      try {
        if (sessionStorage.getItem(EXIT_INTENT_SESSION_KEY)) return
        sessionStorage.setItem(EXIT_INTENT_SESSION_KEY, '1')
      } catch (err) {
        /* storage unavailable — fall through, worst case a duplicate fire */
      }
      var vehicleCtx = getVehicleContext()
      track('exit_intent', {
        path: window.location.pathname,
        is_vehicle_page: !!vehicleCtx,
        vehicle_key: vehicleKey(vehicleCtx)
      })
    }

    document.addEventListener('mouseout', onMouseOut)
    _behavioralCleanups.push(function () {
      document.removeEventListener('mouseout', onMouseOut)
    })
  }

  var WISHLIST_SELECTORS = ['[data-wishlist]', '.wishlist', '.favourite', '.save-vehicle']
  var WISHLIST_LABEL_RE = /wishlist|favou?rite/i

  function isWishlistElement(el) {
    for (var i = 0; i < WISHLIST_SELECTORS.length; i++) {
      if (el.matches && el.matches(WISHLIST_SELECTORS[i])) return true
    }
    var label = el.getAttribute ? (el.getAttribute('aria-label') || '') : ''
    return WISHLIST_LABEL_RE.test(label)
  }

  // Heuristic detector for save/heart icons near vehicle cards — no dealer
  // CMS convention exists across sites, so this matches a selector list plus
  // aria-label keywords, mirroring the CTA-keyword heuristic in
  // pushToDataLayer(). Walks up to 5 ancestors, matching the phone_click
  // delegation pattern.
  function setupWishlistTracking() {
    function onWishlistClick(e) {
      var target = e.target
      for (var i = 0; i < 5; i++) {
        if (!target) break
        if (isWishlistElement(target)) {
          var vehicleCtx = getVehicleContext()
          var data = {}
          if (vehicleCtx) {
            for (var key in vehicleCtx) {
              if (vehicleCtx.hasOwnProperty(key)) data[key] = vehicleCtx[key]
            }
          }
          track('add_to_wishlist', data)
          return
        }
        target = target.parentElement
      }
    }

    document.addEventListener('click', onWishlistClick)
    _behavioralCleanups.push(function () {
      document.removeEventListener('click', onWishlistClick)
    })
  }

  var CTA_VISIBILITY_SELECTORS = CTA_CLICK_SELECTORS.concat(['[data-price]', '.price', '.vehicle-price'])
  var CTA_VISIBILITY_THRESHOLD = 0.5
  var CTA_VISIBILITY_MAX_ELEMENTS = 20

  function matchedCtaSelector(el) {
    for (var i = 0; i < CTA_VISIBILITY_SELECTORS.length; i++) {
      if (el.matches && el.matches(CTA_VISIBILITY_SELECTORS[i])) return CTA_VISIBILITY_SELECTORS[i]
    }
    return null
  }

  // "Did they actually see the price/CTA" via real visibility, not "did they
  // scroll past the pixel row it's in." Only observes elements present at
  // setup time — dynamically-rendered CTAs on client-side-routed dealer
  // sites are a known limitation, not handled by this pass.
  function setupCtaVisibilityTracking(threshold) {
    if (typeof window.IntersectionObserver === 'undefined') return
    var observer = new window.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i]
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        track('cta_visible', {
          selector: matchedCtaSelector(entry.target),
          text: (entry.target.textContent || '').substring(0, 100)
        })
      }
    }, { threshold: threshold })
    _behavioralCleanups.push(function () {
      observer.disconnect()
    })
    var vehicleCtx = getVehicleContext()
    var selectors = vehicleCtx ? CTA_VISIBILITY_SELECTORS : CTA_CLICK_SELECTORS
    var elements = document.querySelectorAll(selectors.join(','))
    var max = CTA_VISIBILITY_MAX_ELEMENTS
    for (var j = 0; j < elements.length && j < max; j++) observer.observe(elements[j])
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
      if (_funnelSignalsEnabled) {
        trackReturnToVehicle(vehicleCtx)
        trackCrossShop(vehicleCtx)
      }
    }
  }

  // Track clicks on configured selectors (with dead click detection)
  // Shared navigation tracking: installed exactly once so SPA page-view
  // firing and dead-click detection never wrap/restore history.pushState
  // against each other. Each tracked click previously installed its own
  // temporary pushState wrapper and restored the ORIGINAL (not the previous
  // wrapper) 500ms later — two tracked clicks within 500ms of each other
  // would stomp on each other's wrapper, both under- and over-counting
  // dead clicks. A single shared timestamp avoids the race entirely.
  var _lastNavAt = 0
  var _navTrackingInstalled = false

  function setupNavigationTracking(fireSpaPageViews) {
    if (_navTrackingInstalled) return
    _navTrackingInstalled = true

    function onRouteChange() {
      _lastNavAt = Date.now()
      if (fireSpaPageViews) trackPageView()
    }
    function onSubmit() {
      _lastNavAt = Date.now()
    }

    var origPushState = history.pushState
    history.pushState = function () {
      var result = origPushState.apply(history, arguments)
      onRouteChange()
      return result
    }
    window.addEventListener('popstate', onRouteChange)
    window.addEventListener('hashchange', onRouteChange)
    document.addEventListener('submit', onSubmit)
  }

  // An element is "navigational" when a click on it is expected to change
  // the page/route — real links and form-submit buttons. Dead-click
  // detection only applies to these; a plain button/[data-track] element
  // (accordion toggle, modal opener) is not expected to navigate, so
  // checking it against _lastNavAt would misclassify every such click as
  // dead by design, polluting what's meant to be a UX-frustration signal.
  function isNavigational(el) {
    if (el.tagName === 'A' && el.href) return true
    if (el.tagName === 'BUTTON' && el.type === 'submit') return true
    return false
  }

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

            // Dead click detection: if no navigation/submit within 500ms of
            // this click, record dead_click. Only for elements expected to
            // navigate in the first place.
            if (isNavigational(target)) {
              var clickedAt = Date.now()
              setTimeout(function () {
                if (_lastNavAt < clickedAt) {
                  track('dead_click', clickData)
                }
              }, 500)
            }

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
    var fields = leadContextFields(eventId)
    for (var fieldName in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, fieldName)) {
        setTrackingFormField(form, fieldName, fields[fieldName])
      }
    }
  }

  // Returns the non-PII fields a provider integration can carry through its
  // existing server-side CRM webhook. Never read or add visitor form values
  // here: the dealer CRM remains the system of record for that information.
  function leadContextFields(eventId, options) {
    var providerBridge = options && options.providerBridge === true
    var touches = getAttributionTouches()
    var fields = {}

    function addField(name, value) {
      if (value) fields[name] = String(value)
    }

    addField('zeroflow_browser_event_id', eventId)
    if (!providerBridge) {
      addField('zeroflow_anon_id', getClientId())
      addField('zeroflow_session_id', getSessionId())
      addField('zeroflow_landing_page', safeLeadContextUrl(touches.last.landing_page))
      addField('zeroflow_first_referrer', safeLeadContextUrl(touches.first.referrer))
    }

    for (var touchIndex = 0; touchIndex < 2; touchIndex++) {
      var touchName = touchIndex === 0 ? 'first' : 'last'
      var touch = touches[touchName]
      if (!providerBridge) {
        addField('zeroflow_' + touchName + '_landing_page', safeLeadContextUrl(touch.landing_page))
        addField('zeroflow_' + touchName + '_referrer', safeLeadContextUrl(touch.referrer))
      }
      for (var keyIndex = 0; keyIndex < TOUCH_ATTRIBUTION_KEYS.length; keyIndex++) {
        var key = TOUCH_ATTRIBUTION_KEYS[keyIndex]
        var value = providerBridge
          ? safeProviderAttributionValue(key, touch[key])
          : touch[key]
        if (value) {
          addField('zeroflow_' + touchName + '_' + key, value)
          if (touchName === 'last') addField('zeroflow_' + key, value)
        }
      }
    }

    return fields
  }

  // Native form attribution may carry a page URL through a CRM integration.
  // Keep only the origin/path and known attribution parameters so arbitrary
  // URL query values, fragments, and credentials never cross that boundary.
  function safeLeadContextUrl(value) {
    if (typeof value !== 'string' || !value) return null
    try {
      var url = new URL(value, window.location.origin)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      var parameters = new URLSearchParams()
      for (var i = 0; i < TOUCH_ATTRIBUTION_KEYS.length; i++) {
        var key = TOUCH_ATTRIBUTION_KEYS[i]
        var parameter = url.searchParams.get(key)
        if (parameter) parameters.set(key, parameter.slice(0, 512))
      }
      url.username = ''
      url.password = ''
      url.hash = ''
      url.search = parameters.toString()
      return url.toString()
    } catch {
      return null
    }
  }

  // Provider bridges never need a route or referrer to reconcile a lead. URLs
  // can contain customer IDs, one-time tokens, or other private path data, so
  // only the public origin is sent with their correlation candidate.
  function safeProviderContextOrigin(value) {
    if (typeof value !== 'string' || !value) return null
    try {
      var url = new URL(value, window.location.origin)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      return url.origin + '/'
    } catch {
      return null
    }
  }

  function safeProviderAttributionValue(key, value) {
    var minimumLengths = {
      gclid: 20,
      gbraid: 12,
      wbraid: 12,
      fbclid: 20,
      msclkid: 16,
      ttclid: 12,
      li_fat_id: 12
    }
    var minimumLength = minimumLengths[key]
    // All UTM/campaign labels and unrecognised identifiers are arbitrary
    // caller-controlled text, so the provider bridge does not forward them.
    // Recognised platform click IDs must match their opaque token shape.
    if (!minimumLength || typeof value !== 'string') return null
    if (value.length < minimumLength || value.length > 128) return null
    if (!/^[a-z0-9_-]+$/i.test(value)) return null
    return value
  }

  function safeProviderAttribution(touch) {
    var result = {}
    var source = touch || {}
    for (var i = 0; i < TOUCH_ATTRIBUTION_KEYS.length; i++) {
      var key = TOUCH_ATTRIBUTION_KEYS[i]
      var value = safeProviderAttributionValue(key, source[key])
      if (value) result[key] = value
    }
    return result
  }

  function safeProviderGeneratedEventId(value) {
    if (typeof value !== 'string') return null
    var trimmed = value.trim()
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed
    }
    // Fallback format emitted by generateEventId() for browsers without
    // crypto.randomUUID. Do not accept arbitrary caller-provided identifiers.
    return /^\d{13}-[a-z0-9]{9}$/i.test(trimmed) ? trimmed : null
  }

  function providerBridgeEventId(options) {
    var supplied = options && typeof options.eventId === 'string'
      ? safeProviderGeneratedEventId(options.eventId)
      : null
    return supplied || generateEventId()
  }

  // Keep the browser bridge's consent gate visible to the server without
  // copying the cookie itself, which may contain policy URLs or other
  // caller-controlled metadata. Only the consent decisions are needed there.
  function providerBridgeConsent(consent) {
    if (!consent || consent.updatedAt === null || consent.updatedAt === undefined) return null
    return JSON.stringify({
      tracking: consent.tracking === true,
      analytics: consent.analytics === true,
      marketing: consent.marketing === true,
      updatedAt: new Date().toISOString()
    })
  }

  function recordProviderLeadCandidate(eventId, consent) {
    track('form_submit', {
      lead_eligible: true,
      capture_source: 'explicit_provider_bridge'
    }, {
      eventId: eventId,
      anonId: eventId,
      sessionId: null,
      pageUrl: safeProviderContextOrigin(window.location.href),
      referrer: null,
      attribution: safeProviderAttribution(getAttributionTouches().last),
      fbCookies: { fbc: null, fbp: null },
      consent: providerBridgeConsent(consent)
    })
  }

  // Public handoff for JavaScript-managed or third-party provider forms that
  // do not dispatch a native submit event to the dealer page. The provider
  // must forward result.fields unchanged to its existing authenticated CRM
  // webhook; this function deliberately does not receive form PII or secrets.
  function captureLeadContext(options) {
    var opts = options || {}
    var consent = getConsent()
    if (!WRITE_KEY || !isEventAllowed('form_submit', consent)) return null

    var eventId = providerBridgeEventId(opts)
    var result = _leadContextByEventId[eventId]
    if (!result) {
      result = {
        browserEventId: eventId,
        fields: leadContextFields(eventId, { providerBridge: true })
      }
      _leadContextByEventId[eventId] = result
    }

    // Delivery is best-effort and has no acknowledgement. Re-emit the same
    // event ID for a provider retry; the server's event uniqueness constraint
    // makes this safe while repairing a lost initial browser request.
    recordProviderLeadCandidate(eventId, consent)

    return result
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
      consent: getCookie(CONSENT_COOKIE_NAME) || null,
    }
    if (_leadCaptureTest) {
      payload.test_context = {
        run_id: _leadCaptureTest.runId,
        evidence_token: _leadCaptureTest.evidenceToken,
      }
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

  function sendLeadCaptureTestEvidence(stage, outcome, evidenceKey, diagnostic) {
    if (!_leadCaptureTest || !_scriptOrigin || typeof fetch !== 'function') return
    try {
      fetch(_scriptOrigin + '/api/public/lead-capture-test/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: _leadCaptureTest.evidenceToken,
          stage: stage,
          outcome: outcome,
          evidenceKey: String(evidenceKey || '').slice(0, 255),
          diagnostic: diagnostic ? String(diagnostic).slice(0, 1000) : null,
        }),
        keepalive: true,
        mode: 'cors',
      }).catch(function () {})
    } catch (e) {
      // Self-test telemetry must never affect the dealer form.
    }
  }

  function activateLeadCaptureTest() {
    if (!_scriptOrigin || typeof fetch !== 'function') return
    var bootstrapToken = ''
    try {
      var testUrl = new URL(window.location.href)
      bootstrapToken = testUrl.searchParams.get('xf_test_token') || ''
      if (bootstrapToken) {
        testUrl.searchParams.delete('xf_test_token')
        window.history.replaceState(
          window.history.state,
          '',
          testUrl.pathname + testUrl.search + testUrl.hash
        )
      }
    } catch (e) {
      return
    }
    if (!bootstrapToken || bootstrapToken.length > 512) return
    try {
      fetch(_scriptOrigin + '/api/public/lead-capture-test/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: bootstrapToken }),
        mode: 'cors',
      })
        .then(function (response) {
          if (!response.ok) throw new Error('test verification failed')
          return response.json()
        })
        .then(function (result) {
          if (!result || !result.runId || !result.evidenceToken) return
          _leadCaptureTest = {
            runId: result.runId,
            evidenceToken: result.evidenceToken,
            expiresAt: result.expiresAt,
          }
          sendLeadCaptureTestEvidence(
            'tracker_loaded',
            'passed',
            'track-js',
            'XeroFlow tracking tag loaded and verified the origin-bound test token.'
          )
        })
        .catch(function () {})
    } catch (e) {
      // Invalid or unavailable tests leave normal tracking untouched.
    }
  }

  function confirmLead(options) {
    options = options || {}
    var context = captureLeadContext(options)
    if (!context) return null
    var detectionMethod = String(options.detectionMethod || 'explicit_provider_success').slice(0, 100)
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      event: 'xf_lead_confirmed',
      event_id: context.browserEventId,
      form_id: options.formId ? String(options.formId).slice(0, 255) : undefined,
      enquiry_type_candidate: options.enquiryType
        ? String(options.enquiryType).slice(0, 64)
        : undefined,
      detection_method: detectionMethod,
      test_run_id: _leadCaptureTest ? _leadCaptureTest.runId : null,
    })
    if (_leadCaptureTest) {
      sendLeadCaptureTestEvidence(
        'provider_success_observed',
        'passed',
        context.browserEventId,
        'Explicit provider success signal observed; awaiting trusted server receipt.'
      )
    }
    return context
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

  // Cross-origin provider forms do not bubble clicks or submits into the dealer
  // page. A click inside one does, however, move focus to its iframe. Record that
  // as an observed interaction only; it is deliberately not a lead/conversion.
  // Provider webhooks are responsible for confirmed outcomes.
  function setupProviderInteractionTracking() {
    var recorded = {}

    function providerFrame(frame) {
      if (!frame || frame.tagName !== 'IFRAME') return null

      var marker = [
        frame.id || '',
        frame.className || '',
        frame.title || '',
        frame.getAttribute('name') || '',
        frame.getAttribute('data-cy') || '',
      ].join(' ').toLowerCase()
      var src = frame.getAttribute('src') || frame.src || ''
      var host = ''
      try {
        host = new URL(src, window.location.href).hostname.toLowerCase()
      } catch (e) {
        host = ''
      }

      if (host === 'consumer.xtime.net.au' || host.slice(-13) === '.xtime.net.au') {
        return { provider: 'xtime', host: host }
      }
      if (marker.indexOf('podium') !== -1 || host === 'connect.podium.com') {
        return {
          provider: 'podium',
          host: host === 'connect.podium.com' ? host : 'connect.podium.com',
        }
      }
      return null
    }

    window.addEventListener('blur', function () {
      // Browsers update document.activeElement after dispatching blur.
      setTimeout(function () {
        var provider = providerFrame(document.activeElement)
        if (!provider || recorded[provider.provider]) return
        recorded[provider.provider] = true
        track('provider_interaction', {
          provider: provider.provider,
          interaction_type: 'iframe_focus',
          attribution_confidence: 'interaction_observed',
          provider_host: provider.host,
        })
      }, 0)
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
          var data = { duration: interval }
          // VDP dwell time: distinct from generic engagement only in that it
          // carries vehicle context, letting downstream queries filter for
          // "time actually spent on a vehicle detail page."
          if (_funnelSignalsEnabled) {
            var vehicleCtx = getVehicleContext()
            if (vehicleCtx) {
              for (var key in vehicleCtx) {
                if (vehicleCtx.hasOwnProperty(key)) data[key] = vehicleCtx[key]
              }
            }
          }
          track('engagement', data)
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
    var hadWriteKey = !!WRITE_KEY
    if (config.writeKey) WRITE_KEY = config.writeKey

    // GTM and SPA runtimes can execute the same Custom HTML bootstrap more than
    // once. Always accept a late write key, but never install duplicate DOM
    // listeners, history wrappers, timers, or initial page views.
    if (_initialized) {
      if (!hadWriteKey && WRITE_KEY) trackPageView()
      return
    }
    _initialized = true

    // Google Consent Mode v2 default — fire as early as possible, before any
    // GTM tag on the page has a chance to run. Reflects whatever's already in
    // the consent cookie (denied on every category if none exists yet).
    pushConsentToDataLayer('default', getConsent())

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
    if (c.returnToVehicleMinDays !== undefined) RETURN_TO_VEHICLE_MIN_DAYS = c.returnToVehicleMinDays
    if (c.comparisonThresholds) COMPARISON_THRESHOLDS = c.comparisonThresholds
    if (c.ctaVisibilityThreshold !== undefined) CTA_VISIBILITY_THRESHOLD = c.ctaVisibilityThreshold
    if (config.funnelSignals === false) _funnelSignalsEnabled = false

    // Per-site vehicle-detail-page URL patterns, additive to the generic
    // built-in list — set via the install snippet's data-vehicle-patterns
    // attribute (auto-boot) or init({ vehiclePatterns: [...] }) directly.
    if (config.vehiclePatterns && config.vehiclePatterns.length) {
      _customVehiclePatterns = config.vehiclePatterns
    }

    // Accept linked sessions first
    acceptLinkedSession()

    // Resolve script origin so the beacon posts cross-origin to OUR origin.
    // document.currentScript is null inside a DOMContentLoaded callback, so fall
    // back to locating our own tag by src (this file ships as track.js).
    // A GTM readiness poll calls init() from its own inline <script>, so
    // document.currentScript can be truthy while having no tracker src. Only
    // trust currentScript when it is this file; otherwise locate the external
    // tracker element that GTM inserted.
    var scriptEl = document.currentScript
    if (!scriptEl || !scriptEl.src || scriptEl.src.indexOf('track.js') === -1) {
      scriptEl = document.querySelector('script[src*="track.js"]')
    }
    if (scriptEl && scriptEl.src) {
      try {
        _scriptOrigin = new URL(scriptEl.src).origin
      } catch (e) {
        _scriptOrigin = ''
      }
    }

    activateLeadCaptureTest()

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

    // Install shared navigation tracking before anything can click — SPA
    // route changes re-fire trackPageView(); non-SPA sites still get
    // _lastNavAt for dead-click detection.
    setupNavigationTracking(!!config.spa)

    // Track page view
    trackPageView()

    // Setup automatic tracking
    if (config.clicks !== false) {
      setupClickTracking(config.clickSelectors || ['a[href]', 'button', '[data-track]'])
    }
    if (config.forms !== false) {
      setupFormTracking()
    }
    if (config.providerInteractions !== false) {
      setupProviderInteractionTracking()
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

    // Behavioral signals (rage clicks, video engagement, idle/return, form
    // field timing) — on by default, like every other auto-tracked category.
    // Opt out with data-behavioral="false" on the script tag.
    if (config.behavioral !== false) {
      setupRageClickDetection()
      setupVideoTracking()
      setupIdleDetection()
      setupFormFieldTracking()
    }

    // Phase B funnel & intent signals — cross-shop, return-to-vehicle, and
    // VDP dwell hook directly into trackPageView()/setupEngagementTracking()
    // and are gated by _funnelSignalsEnabled instead of a setup call here.
    // On by default. Opt out with data-funnel-signals="false".
    if (_funnelSignalsEnabled) {
      setupExitIntentDetection()
      setupWishlistTracking()
      setupCtaVisibilityTracking(CTA_VISIBILITY_THRESHOLD)
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
    createEventId: generateEventId,
    captureLeadContext: captureLeadContext,
    destroy: destroy,
    linkSession: linkSession,
    getClientId: getClientId,
    getSessionId: getSessionId,
    confirmLead: confirmLead,
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
    var bootWriteKey = script.getAttribute('data-key') || ''
    // GTM Custom HTML rewrites external scripts and may strip custom data
    // attributes from the executable element. Do not initialize an inert
    // tracker in that state: the GTM loader can call xf.init({ writeKey }) once
    // the script is available, without duplicating every automatic listener.
    if (autoInit && bootWriteKey) {
      var bootCfg = {
        writeKey: bootWriteKey,
        spa: script.getAttribute('data-spa') === 'true',
        behavioral: script.getAttribute('data-behavioral') !== 'false',
        funnelSignals: script.getAttribute('data-funnel-signals') !== 'false',
      }
      var bootVehiclePatterns = script.getAttribute('data-vehicle-patterns')
      if (bootVehiclePatterns) {
        try {
          bootCfg.vehiclePatterns = JSON.parse(bootVehiclePatterns)
        } catch (e) {
          /* ignore malformed attribute */
        }
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
