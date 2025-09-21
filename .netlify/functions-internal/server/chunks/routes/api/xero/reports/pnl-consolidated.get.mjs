import { e as eventHandler, l as getTokenForSession, c as createError, d as getQuery, $ as $fetch } from '../../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

function ensureDateString(d) {
  return d.toISOString().slice(0, 10);
}
function getDefaultRange() {
  const to = /* @__PURE__ */ new Date();
  const from = /* @__PURE__ */ new Date();
  from.setDate(to.getDate() - 30);
  return { from: ensureDateString(from), to: ensureDateString(to) };
}
async function fetchTenants(accessToken) {
  return await $fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
async function fetchPnLForTenant(accessToken, tenantId, from, to) {
  var _a, _b, _c, _d, _e, _f, _g;
  const url = new URL("https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss");
  url.searchParams.set("fromDate", from);
  url.searchParams.set("toDate", to);
  url.searchParams.set("summarizeBy", "Total");
  const report = await $fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId
    }
  });
  function flattenRows(rows2, out = []) {
    if (!rows2) return out;
    for (const row of rows2) {
      out.push(row);
      if (row.Rows) flattenRows(row.Rows, out);
    }
    return out;
  }
  const rows = flattenRows((_b = (_a = report == null ? void 0 : report.Reports) == null ? void 0 : _a[0]) == null ? void 0 : _b.Rows);
  let revenueTotal = 0;
  let expensesTotal = 0;
  let netProfit = 0;
  for (const row of rows) {
    const title = ((_d = (_c = row == null ? void 0 : row.Cells) == null ? void 0 : _c[0]) == null ? void 0 : _d.Value) || (row == null ? void 0 : row.Title) || "";
    const valueStr = (_g = (_f = row == null ? void 0 : row.Cells) == null ? void 0 : _f[((_e = row.Cells) == null ? void 0 : _e.length) - 1]) == null ? void 0 : _g.Value;
    const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
    if (/total\s+revenue/i.test(title)) revenueTotal = numeric;
    if (/total\s+expense/i.test(title) || /total\s+expenses/i.test(title)) expensesTotal = numeric;
    if (/net\s+profit/i.test(title) || /profit\s+for\s+the\s+period/i.test(title)) netProfit = numeric;
  }
  const profitMargin = revenueTotal !== 0 ? netProfit / revenueTotal : 0;
  return { revenueTotal, expensesTotal, netProfit, profitMargin };
}
const pnlConsolidated_get = eventHandler(async (event) => {
  const token = await getTokenForSession(event);
  if (!(token == null ? void 0 : token.access_token)) {
    throw createError({ statusCode: 401, statusMessage: "Not connected" });
  }
  const query = getQuery(event);
  const fromDate = String(query.fromDate || "");
  const toDate = String(query.toDate || "");
  const { from, to } = !fromDate || !toDate ? getDefaultRange() : { from: fromDate, to: toDate };
  const tenants = await fetchTenants(token.access_token);
  const results = [];
  for (const t of tenants) {
    try {
      const pnl = await fetchPnLForTenant(token.access_token, t.tenantId, from, to);
      results.push({ tenantId: t.tenantId, tenantName: t.tenantName, ...pnl });
    } catch {
    }
  }
  const totals = results.reduce((acc, r) => {
    acc.revenueTotal += r.revenueTotal;
    acc.expensesTotal += r.expensesTotal;
    acc.netProfit += r.netProfit;
    return acc;
  }, { revenueTotal: 0, expensesTotal: 0, netProfit: 0 });
  const profitMargin = totals.revenueTotal !== 0 ? totals.netProfit / totals.revenueTotal : 0;
  return { fromDate: from, toDate: to, tenants: results, totals: { ...totals, profitMargin } };
});

export { pnlConsolidated_get as default };
//# sourceMappingURL=pnl-consolidated.get.mjs.map
