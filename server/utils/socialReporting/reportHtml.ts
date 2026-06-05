// server/utils/socialReporting/reportHtml.ts
// Pure: build a self-contained, print-friendly HTML document for a client's organic report.
// Rendered to PDF by CF Browser Rendering (3c). All caller/platform-supplied strings (client name,
// post captions) are HTML-escaped — they flow into a document that becomes a PDF, so this is an XSS
// / injection boundary even though the output is "just" a PDF.

interface Kpi { value: number; deltaPct: number | null }
export interface ReportHtmlData {
  clientName: string
  periodLabel: string
  kpis: { posts: Kpi; impressions: Kpi; reach: Kpi; engagements: Kpi; clicks: Kpi; engagementRate: Kpi }
  bestContent?: Array<{ content: string; engagements: number; engagementRate: number }>
  aiSummary?: string | null
}

export function escapeReportHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Numbers flow into an HTML doc that becomes a PDF + email body, so even "numeric" fields are coerced
// (Number()) before interpolation — never trust the static type alone at an injection boundary.
function num(v: any): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function fmtNum(v: any): string { const n = num(v); return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }
function delta(d: number | null): string {
  if (d == null) return '<span style="color:#888">—</span>'
  const n = num(d)
  const color = n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : '#888'
  return `<span style="color:${color}">${n > 0 ? '+' : ''}${n}%</span>`
}

export function buildReportHtml(data: ReportHtmlData): string {
  const k = data.kpis
  const cards: Array<[string, string, Kpi]> = [
    ['Posts', String(k.posts.value), k.posts],
    ['Impressions', fmtNum(k.impressions.value), k.impressions],
    ['Reach', fmtNum(k.reach.value), k.reach],
    ['Engagements', fmtNum(k.engagements.value), k.engagements],
    ['Eng. rate', `${k.engagementRate.value}%`, k.engagementRate],
    ['Link clicks', fmtNum(k.clicks.value), k.clicks],
  ]
  const kpiHtml = cards.map(([label, val, kpi]) =>
    `<div class="card"><div class="lbl">${label}</div><div class="val">${val}</div><div class="d">${delta(kpi.deltaPct)}</div></div>`,
  ).join('')

  const best = (data.bestContent ?? []).map(b =>
    `<tr><td>${escapeReportHtml(b.content) || '<em>(no caption)</em>'}</td><td class="num">${num(b.engagements)}</td><td class="num">${num(b.engagementRate)}%</td></tr>`,
  ).join('')

  const summary = data.aiSummary
    ? `<div class="summary"><strong>Summary</strong><p>${escapeReportHtml(data.aiSummary)}</p></div>` : ''

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px;}
    h1{font-size:22px;margin:0 0 2px;} .sub{color:#666;margin:0 0 20px;font-size:13px;}
    .cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;}
    .card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;min-width:120px;}
    .lbl{font-size:11px;color:#666;} .val{font-size:22px;font-weight:600;margin-top:2px;} .d{font-size:11px;margin-top:2px;}
    .summary{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:20px;font-size:13px;}
    table{width:100%;border-collapse:collapse;font-size:13px;} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;}
    td.num,th.num{text-align:right;white-space:nowrap;} h2{font-size:15px;margin:0 0 8px;}
  </style></head><body>
    <h1>${escapeReportHtml(data.clientName)} — Social Performance</h1>
    <p class="sub">${escapeReportHtml(data.periodLabel)}</p>
    <div class="cards">${kpiHtml}</div>
    ${summary}
    ${best ? `<h2>Top content</h2><table><thead><tr><th>Post</th><th class="num">Engagements</th><th class="num">Eng. rate</th></tr></thead><tbody>${best}</tbody></table>` : ''}
  </body></html>`
}
