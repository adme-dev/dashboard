import { parseFragment, serialize } from 'parse5'

const blocked = new Set(['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'meta', 'base', 'link', 'template', 'svg', 'math'])
// Strip URL control characters before checking the scheme.
// eslint-disable-next-line no-control-regex
const unsafeUrl = (value: string) => /^(?:javascript|vbscript|data|blob):/i.test(value.replace(/[\u0000-\u0020\u007f]/g, ''))
// This protects the editor DOM without rewriting stored OEM/postcard designs.
// In particular, responsive style sheets and class hooks remain intact.
export function sanitizeEmailCanvasHtml(html: string, allowStylesheet = true): string {
  const tree = parseFragment(html)
  let nodes = 0
  function walk(parent: typeof tree | (typeof tree.childNodes)[number], depth = 0) {
    if (!('childNodes' in parent)) return
    parent.childNodes = parent.childNodes.filter((node) => {
      if (++nodes > 50000 || depth > 128) return false
      if (!('tagName' in node)) return true
      if (blocked.has(node.tagName) || (node.tagName === 'style' && (!allowStylesheet || node.childNodes.some(child => 'value' in child && /@import|expression\s*\(|javascript\s*:|vbscript\s*:|\\/i.test(child.value))))) return false
      node.attrs = node.attrs.filter(attr => !/^on/i.test(attr.name) && !['srcdoc', 'formaction'].includes(attr.name) && (!['href', 'src', 'action', 'background', 'poster'].includes(attr.name) || !unsafeUrl(attr.value)))
      walk(node, depth + 1)
      return true
    })
  }
  walk(tree)
  return serialize(tree)
}
