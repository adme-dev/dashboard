/**
 * Ad Platform Exporter — builds platform-compliant HTML5 banners and ZIP bundles.
 *
 * Server-side duplicate of platform specs to avoid ~/app import in Nitro.
 * Uses assembleCustomBannerHTML() from customTemplateUtils for base HTML generation.
 */

import JSZip from 'jszip'
import { assembleCustomBannerHTML } from '~~/server/utils/customTemplateUtils'

// --- Platform specs (server-side copy) ---

interface PlatformConfig {
  clickTagVar: string
  maxFileSize: number
  animationLimitSec: number
  allowsExternalCalls: boolean
  allowsLooping: boolean
  requiresExternalLib?: { url: string }
}

const PLATFORMS: Record<string, PlatformConfig> = {
  generic_iab: { clickTagVar: 'clickTag', maxFileSize: 0, animationLimitSec: 0, allowsExternalCalls: true, allowsLooping: true },
  google_ads: { clickTagVar: 'clickTag', maxFileSize: 150 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: false },
  dv360: { clickTagVar: 'clickTag', maxFileSize: 200 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: true },
  google_ad_manager: { clickTagVar: 'clickTag', maxFileSize: 200 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: true },
  cm360: { clickTagVar: 'clickTag', maxFileSize: 200 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: true },
  google_adsense: { clickTagVar: 'clickTag', maxFileSize: 150 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: false },
  amazon_dsp: { clickTagVar: 'clickTag', maxFileSize: 200 * 1024, animationLimitSec: 0, allowsExternalCalls: false, allowsLooping: true },
  trade_desk: { clickTagVar: 'clickTAG', maxFileSize: 200 * 1024, animationLimitSec: 15, allowsExternalCalls: false, allowsLooping: true },
  xandr: { clickTagVar: 'APPNEXUS.getClickTag()', maxFileSize: 200 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: true, requiresExternalLib: { url: 'https://acdn.adnxs.com/html5-lib/1.4.1/appnexus-html5-lib.min.js' } },
  sizmek: { clickTagVar: 'clickTag', maxFileSize: 200 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: true },
  flashtalking: { clickTagVar: 'clickTag', maxFileSize: 200 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: true },
  adroll: { clickTagVar: 'clickTag', maxFileSize: 150 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: false },
  criteo: { clickTagVar: 'clickTag', maxFileSize: 200 * 1024, animationLimitSec: 30, allowsExternalCalls: false, allowsLooping: true },
  yahoo_dsp: { clickTagVar: 'adkit.clicktag()', maxFileSize: 200 * 1024, animationLimitSec: 15, allowsExternalCalls: false, allowsLooping: true, requiresExternalLib: { url: 'https://s.yimg.com/cv/apiv2/adkit/adkit.min.js' } },
}

// --- ClickTag script generation ---

function generateClickTagScript(platformId: string, defaultClickUrl: string): string {
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

    default:
      return `var clickTag = "${safeDefault}";
document.addEventListener("click", function() {
  window.open(clickTag, "_blank");
});`
  }
}

// --- Build platform-compliant HTML ---

interface BuildPlatformHTMLOpts {
  html: string
  css: string
  js: string
  width: number
  height: number
  variables?: { name: string; label: string; type: string; default: string; group?: string }[]
  variableValues?: Record<string, string>
  externalScripts?: string[]
  externalStyles?: string[]
  platformId: string
  clickUrl?: string
}

export function buildPlatformHTML(opts: BuildPlatformHTMLOpts): string {
  const platform = PLATFORMS[opts.platformId]
  if (!platform) throw new Error(`Unknown platform: ${opts.platformId}`)

  // Filter external resources if platform doesn't allow them
  const filteredScripts = platform.allowsExternalCalls
    ? (opts.externalScripts || [])
    : []
  const filteredStyles = platform.allowsExternalCalls
    ? (opts.externalStyles || [])
    : []

  // Build base HTML without click wrapper (platform clickTag handles clicks)
  let baseHtml = assembleCustomBannerHTML({
    html: opts.html,
    css: opts.css,
    js: opts.js,
    width: opts.width,
    height: opts.height,
    variables: opts.variables as any,
    variableValues: opts.variableValues,
    externalScripts: filteredScripts,
    externalStyles: filteredStyles,
    // No clickUrl/impressionPixel/clickPixel — platform handles tracking
  })

  // Inject platform-required external library into <head>
  if (platform.requiresExternalLib) {
    const libScript = `<script src="${platform.requiresExternalLib.url}"><\/script>`
    baseHtml = baseHtml.replace('</head>', `  ${libScript}\n</head>`)
  }

  // Inject clickTag script before </body>
  const clickTagScript = generateClickTagScript(opts.platformId, opts.clickUrl || 'https://example.com')
  const clickTagBlock = `<script>\n    ${clickTagScript}\n  <\/script>`
  baseHtml = baseHtml.replace('</body>', `  ${clickTagBlock}\n</body>`)

  return baseHtml
}

// --- Validation ---

export interface PlatformValidationWarning {
  rule: string
  message: string
  severity: 'error' | 'warning'
}

export interface PlatformValidationResult {
  valid: boolean
  warnings: PlatformValidationWarning[]
  htmlSize: number
}

export function validateForPlatform(html: string, platformId: string): PlatformValidationResult {
  const platform = PLATFORMS[platformId]
  if (!platform) return { valid: false, warnings: [{ rule: 'platform', message: 'Unknown platform', severity: 'error' }], htmlSize: 0 }

  const warnings: PlatformValidationWarning[] = []
  const htmlSize = new TextEncoder().encode(html).length

  // File size check
  if (platform.maxFileSize > 0 && htmlSize > platform.maxFileSize) {
    const maxKB = Math.round(platform.maxFileSize / 1024)
    const actualKB = Math.round(htmlSize / 1024)
    warnings.push({
      rule: 'file_size',
      message: `File size ${actualKB}KB exceeds ${maxKB}KB limit`,
      severity: 'error',
    })
  }

  // External resource check
  if (!platform.allowsExternalCalls) {
    // Check for external script/link tags that aren't the platform's own lib
    const libUrl = platform.requiresExternalLib?.url || ''
    const scriptPattern = /<script\s+src="(https?:\/\/[^"]+)"/gi
    let match
    while ((match = scriptPattern.exec(html)) !== null) {
      if (match[1] !== libUrl) {
        warnings.push({
          rule: 'external_calls',
          message: `External script "${match[1]}" may not be allowed`,
          severity: 'warning',
        })
      }
    }
    const linkPattern = /<link[^>]+href="(https?:\/\/[^"]+)"/gi
    while ((match = linkPattern.exec(html)) !== null) {
      warnings.push({
        rule: 'external_calls',
        message: `External stylesheet "${match[1]}" may not be allowed`,
        severity: 'warning',
      })
    }
  }

  // Looping check — look for GSAP repeat:-1 or CSS animation-iteration-count: infinite
  if (!platform.allowsLooping) {
    if (/repeat\s*:\s*-1/.test(html) || /animation-iteration-count\s*:\s*infinite/i.test(html)) {
      warnings.push({
        rule: 'looping',
        message: 'Infinite looping detected — this platform does not allow animation loops',
        severity: 'warning',
      })
    }
  }

  // Animation time limit
  if (platform.animationLimitSec > 0) {
    warnings.push({
      rule: 'animation_time',
      message: `Animation must stop after ${platform.animationLimitSec}s on this platform`,
      severity: 'warning',
    })
  }

  const valid = !warnings.some(w => w.severity === 'error')
  return { valid, warnings, htmlSize }
}

// --- ZIP generation ---

export async function buildExportZip(html: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('index.html', html)
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
  return buf
}
