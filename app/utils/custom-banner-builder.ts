/**
 * Client-side HTML assembly for custom HTML banner preview + variable utilities.
 */

const VAR_REGEX = /\{\{([A-Z][A-Z0-9_]*)\}\}/g

/** Extract unique variable names from code */
export function extractVariableNames(html: string, css: string, js: string): string[] {
  const source = [html, css, js].join('\n')
  const names = new Set<string>()
  let match: RegExpExecArray | null
  const regex = new RegExp(VAR_REGEX.source, 'g')
  while ((match = regex.exec(source)) !== null) {
    names.add(match[1])
  }
  return Array.from(names)
}

/** Replace {{VAR}} placeholders with values, fallback to defaults */
export function substituteVariables(
  source: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
): string {
  return source.replace(VAR_REGEX, (_m, name: string) => {
    return values[name] ?? defaults[name] ?? ''
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface CustomBannerPreviewOptions {
  html: string
  css: string
  js: string
  width: number
  height: number
  variableValues?: Record<string, string>
  variableDefaults?: Record<string, string>
  externalScripts?: string[]
  externalStyles?: string[]
  /** Auto-inject GSAP CDN for animation support */
  includeGsap?: boolean
  /** Pre-fetched GSAP source to inline (avoids CDN loading issues in sandboxed iframes) */
  gsapSource?: string
  /** Inject console/error relay script for parent-frame error console */
  enableConsoleRelay?: boolean
}

/** Build a full HTML document for live iframe preview (srcdoc) */
export function buildCustomBannerPreviewHTML(opts: CustomBannerPreviewOptions): string {
  const values = opts.variableValues || {}
  const defaults = opts.variableDefaults || {}

  const html = substituteVariables(opts.html, values, defaults)
  const css = substituteVariables(opts.css, values, defaults)
  const js = substituteVariables(opts.js, values, defaults)

  const scriptTags: string[] = []

  // GSAP: inline pre-fetched source (avoids CDN issues in sandboxed srcdoc iframes)
  // Falls back to CDN <script src> if source not provided
  if (opts.includeGsap) {
    if (opts.gsapSource) {
      scriptTags.push(`<script>${opts.gsapSource}<\/script>`)
    } else {
      scriptTags.push(`<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"><\/script>`)
    }
  }

  // External scripts from template
  for (const u of opts.externalScripts || []) {
    if (/^https:\/\//.test(u)) {
      scriptTags.push(`<script src="${escapeHtml(u)}"><\/script>`)
    }
  }

  const styles = (opts.externalStyles || [])
    .filter(u => /^https:\/\//.test(u))
    .map(u => `<link rel="stylesheet" href="${escapeHtml(u)}">`)
    .join('\n  ')

  // Console/error relay — intercepts console.* and errors, posts to parent
  const consoleRelay = opts.enableConsoleRelay ? `<script>
    (function(){
      var _post = function(level, args) {
        try {
          var msg = Array.prototype.slice.call(args).map(function(a) {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch(e) { return String(a); }
          }).join(' ');
          parent.postMessage({ type: 'preview-console', level: level, message: msg, timestamp: Date.now() }, '*');
        } catch(e) {}
      };
      var _log = console.log, _warn = console.warn, _error = console.error, _info = console.info;
      console.log = function() { _post('log', arguments); _log.apply(console, arguments); };
      console.warn = function() { _post('warn', arguments); _warn.apply(console, arguments); };
      console.error = function() { _post('error', arguments); _error.apply(console, arguments); };
      console.info = function() { _post('info', arguments); _info.apply(console, arguments); };
      window.onerror = function(msg, src, line, col) {
        _post('error', [msg + (line ? ' (line ' + line + (col ? ':' + col : '') + ')' : '')]);
      };
      window.addEventListener('unhandledrejection', function(e) {
        _post('error', ['Unhandled promise rejection: ' + (e.reason && e.reason.message || e.reason || 'unknown')]);
      });
    })();
  <\/script>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${opts.width}">
  ${styles}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; background: #fff; }
    ${css}
  </style>
  ${consoleRelay}
</head>
<body>
  ${html}
  ${scriptTags.join('\n  ')}
  <script>
    ${js}
  <\/script>
</body>
</html>`
}
