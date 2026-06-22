// server/utils/adReporting/html.ts
import type { AdReportModel } from '~~/server/utils/adReporting/model'

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
function fmtDelta(d: number | null): string {
  if (d == null) return '<span class="d dn">—</span>'
  const sign = d >= 0 ? '+' : ''
  const cls = d >= 0 ? 'du' : 'dd'
  return `<span class="d ${cls}">${sign}${d.toFixed(0)}%</span>`
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

export function buildAdReportHtml(m: AdReportModel): string {
  const k = m.kpis
  const cards: Array<[string, string, number | null]> = [
    ['Spend', fmtMoney(k.spend), m.deltas.spend],
    ['Budget used', `${k.budgetUtilizationPct.toFixed(0)}%`, null],
    ['Clicks', fmtNum(k.clicks), m.deltas.clicks],
    ['Conversions', fmtNum(k.conversions), m.deltas.conversions],
    ['CTR', `${k.ctr.toFixed(2)}%`, null],
    ['CPA', fmtMoney(k.cpa), m.deltas.cpa],
  ]
  const cardsHtml = cards.map(([label, val, d]) =>
    `<div class="card"><div class="lbl">${label}</div><div class="val">${val}</div>${fmtDelta(d)}</div>`,
  ).join('')
  const rowsHtml = m.topCampaigns.map(c =>
    `<tr><td>${esc(c.campaign)}</td><td>${esc(c.platform)}</td><td>${fmtMoney(c.spend)}</td><td>${fmtNum(c.conversions)}</td><td>${fmtMoney(c.cpa)}</td></tr>`,
  ).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;margin:0;padding:24px}
    h1{font-size:20px;margin:0 0 2px} .sub{color:#666;font-size:13px;margin-bottom:20px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
    .card{border:1px solid #eee;border-radius:8px;padding:12px}
    .lbl{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em}
    .val{font-size:22px;font-weight:600;margin:4px 0} .d{font-size:12px} .du{color:#16a34a}.dd{color:#dc2626}.dn{color:#aaa}
    table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:8px;border-bottom:1px solid #eee}
    th{color:#888;font-weight:600;font-size:11px;text-transform:uppercase}
  </style></head><body>
    <h1>${esc(m.clientName)} — Ad performance</h1>
    <div class="sub">${esc(m.periodLabel)}</div>
    <div class="grid">${cardsHtml}</div>
    <table><thead><tr><th>Campaign</th><th>Platform</th><th>Spend</th><th>Conv.</th><th>CPA</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="5">No campaigns in this period.</td></tr>'}</tbody></table>
  </body></html>`
}
