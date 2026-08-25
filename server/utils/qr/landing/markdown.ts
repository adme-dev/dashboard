/** Tiny, safe Markdown subset for landing-page body copy: paragraphs, **bold**, *italic*, links, lists. */
export function escapeQrHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string))
}

const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i

function inline(text: string): string {
  let out = escapeQrHtml(text)
  out = out.replace(/\[([^\]]{1,200})\]\(([^)\s]{1,2048})\)/g, (_m, label, url) =>
    SAFE_URL.test(url) ? `<a href="${escapeQrHtml(url)}" rel="noopener">${label}</a>` : label)
  out = out.replace(/\*\*([^*]{1,500})\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*]{1,500})\*/g, '$1<em>$2</em>')
  return out
}

export function renderMarkdownLite(md: string): string {
  const blocks = md.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  return blocks.map((block) => {
    const lines = block.split('\n')
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`
  }).join('')
}
