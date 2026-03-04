/**
 * Ad Platform Specifications — clickTag patterns, constraints, and validation rules
 * for HTML5 banner export across 14 ad platforms.
 */

export interface AdPlatformSpec {
  id: string
  name: string
  icon: string
  maxFileSize: number         // bytes, 0 = no limit
  clickTagVar: string
  animationLimitSec: number   // 0 = unlimited
  allowsExternalCalls: boolean
  allowsLooping: boolean
  requiresExternalLib?: { url: string; note: string }
  notes: string
}

export const AD_PLATFORMS: Record<string, AdPlatformSpec> = {
  generic_iab: {
    id: 'generic_iab',
    name: 'Generic / IAB Standard',
    icon: 'i-lucide-globe',
    maxFileSize: 0,
    clickTagVar: 'clickTag',
    animationLimitSec: 0,
    allowsExternalCalls: true,
    allowsLooping: true,
    notes: 'Standard IAB-compliant HTML5 ad with no platform-specific restrictions.',
  },
  google_ads: {
    id: 'google_ads',
    name: 'Google Ads',
    icon: 'i-lucide-megaphone',
    maxFileSize: 150 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: false,
    notes: 'Strict 150KB limit. No external calls. Animation must stop after 30s. No looping.',
  },
  dv360: {
    id: 'dv360',
    name: 'Display & Video 360',
    icon: 'i-lucide-monitor-play',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. No external calls. 30s animation limit. Looping allowed.',
  },
  google_ad_manager: {
    id: 'google_ad_manager',
    name: 'Google Ad Manager',
    icon: 'i-lucide-layout-dashboard',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. Limited external calls. 30s animation limit.',
  },
  cm360: {
    id: 'cm360',
    name: 'Campaign Manager 360',
    icon: 'i-lucide-target',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. No external calls. 30s animation limit.',
  },
  google_adsense: {
    id: 'google_adsense',
    name: 'Google AdSense',
    icon: 'i-lucide-badge-dollar-sign',
    maxFileSize: 150 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: false,
    notes: 'Strict 150KB limit. No external calls. No looping.',
  },
  amazon_dsp: {
    id: 'amazon_dsp',
    name: 'Amazon DSP',
    icon: 'i-lucide-shopping-cart',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 0,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. No external calls. No animation time limit.',
  },
  trade_desk: {
    id: 'trade_desk',
    name: 'The Trade Desk',
    icon: 'i-lucide-bar-chart-3',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTAG',
    animationLimitSec: 15,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. Case-sensitive clickTAG (uppercase TAG). 15s animation limit.',
  },
  xandr: {
    id: 'xandr',
    name: 'Xandr (AppNexus)',
    icon: 'i-lucide-network',
    maxFileSize: 200 * 1024,
    clickTagVar: 'APPNEXUS.getClickTag()',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: true,
    requiresExternalLib: {
      url: 'https://acdn.adnxs.com/html5-lib/1.4.1/appnexus-html5-lib.min.js',
      note: 'AppNexus HTML5 library required for click tracking.',
    },
    notes: '200KB limit. Requires AppNexus HTML5 library. Uses APPNEXUS.getClickTag().',
  },
  sizmek: {
    id: 'sizmek',
    name: 'Sizmek',
    icon: 'i-lucide-layers',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. Limited external calls. 30s animation limit.',
  },
  flashtalking: {
    id: 'flashtalking',
    name: 'Flashtalking',
    icon: 'i-lucide-zap',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. Limited external calls. 30s animation limit.',
  },
  adroll: {
    id: 'adroll',
    name: 'AdRoll',
    icon: 'i-lucide-repeat',
    maxFileSize: 150 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: false,
    notes: 'Strict 150KB limit. No external calls. No looping.',
  },
  criteo: {
    id: 'criteo',
    name: 'Criteo',
    icon: 'i-lucide-mouse-pointer-click',
    maxFileSize: 200 * 1024,
    clickTagVar: 'clickTag',
    animationLimitSec: 30,
    allowsExternalCalls: false,
    allowsLooping: true,
    notes: '200KB limit. No external calls. 30s animation limit.',
  },
  yahoo_dsp: {
    id: 'yahoo_dsp',
    name: 'Yahoo DSP',
    icon: 'i-lucide-radio',
    maxFileSize: 200 * 1024,
    clickTagVar: 'adkit.clicktag()',
    animationLimitSec: 15,
    allowsExternalCalls: false,
    allowsLooping: true,
    requiresExternalLib: {
      url: 'https://s.yimg.com/cv/apiv2/adkit/adkit.min.js',
      note: 'Yahoo AdKit library required for click tracking and ad lifecycle.',
    },
    notes: '200KB limit. Requires Yahoo AdKit library. 15s animation limit.',
  },
}

export const AD_PLATFORM_LIST: AdPlatformSpec[] = Object.values(AD_PLATFORMS)

/**
 * Generate platform-specific clickTag script to inject into HTML5 banner.
 * The script handles click tracking via the platform's ad server macro.
 */
export function generateClickTagScript(platformId: string, defaultClickUrl: string): string {
  const safeDefault = defaultClickUrl || 'https://example.com'

  switch (platformId) {
    case 'google_ads':
    case 'dv360':
    case 'google_ad_manager':
    case 'cm360':
    case 'google_adsense':
      return `var clickTag = "${safeDefault}";
document.addEventListener("click", function() {
  window.open(clickTag, "_blank");
});`

    case 'trade_desk':
      return `var clickTAG = "${safeDefault}";
document.addEventListener("click", function() {
  window.open(clickTAG, "_blank");
});`

    case 'xandr':
      return `document.addEventListener("click", function() {
  window.open(APPNEXUS.getClickTag(), "_blank");
});`

    case 'yahoo_dsp':
      return `adkit.onReady(function() {
  document.addEventListener("click", function() {
    adkit.clicktag();
  });
});`

    case 'sizmek':
    case 'flashtalking':
    case 'amazon_dsp':
    case 'adroll':
    case 'criteo':
    case 'generic_iab':
    default:
      return `var clickTag = "${safeDefault}";
document.addEventListener("click", function() {
  window.open(clickTag, "_blank");
});`
  }
}
