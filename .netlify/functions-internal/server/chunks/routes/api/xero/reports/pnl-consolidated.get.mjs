import { e as eventHandler, g as getActiveTokenForSession, d as createXeroClient, b as getQuery } from '../../../../nitro/nitro.mjs';
import 'xero-node';
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
async function fetchTenants(client) {
  return await client.updateTenants(false);
}
async function fetchPnLForTenant(client, tenantId, from, to) {
  var _a, _b, _c, _d, _e;
  const { body: report } = await client.accountingApi.getReportProfitAndLoss(
    tenantId,
    from,
    to,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    void 0,
    false
  );
  function flattenRows(rows2, out = []) {
    if (!rows2) return out;
    for (const row of rows2) {
      out.push(row);
      const child = (row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows);
      if (child) flattenRows(child, out);
    }
    return out;
  }
  const reportRows = (report == null ? void 0 : report.reports) || (report == null ? void 0 : report.Reports);
  const rows = flattenRows(((_a = reportRows == null ? void 0 : reportRows[0]) == null ? void 0 : _a.rows) || ((_b = reportRows == null ? void 0 : reportRows[0]) == null ? void 0 : _b.Rows));
  let revenueTotal = 0;
  let expensesTotal = 0;
  let netProfit = 0;
  for (const row of rows) {
    const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
    const title = ((_c = cells == null ? void 0 : cells[0]) == null ? void 0 : _c.Value) || ((_d = cells == null ? void 0 : cells[0]) == null ? void 0 : _d.value) || (row == null ? void 0 : row.Title) || (row == null ? void 0 : row.title) || "";
    const lastCell = cells == null ? void 0 : cells[cells.length - 1];
    const valueStr = (_e = lastCell == null ? void 0 : lastCell.Value) != null ? _e : lastCell == null ? void 0 : lastCell.value;
    const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
    if (/total\s+revenue/i.test(title)) revenueTotal = numeric;
    if (/total\s+expense/i.test(title) || /total\s+expenses/i.test(title)) expensesTotal = numeric;
    if (/net\s+profit/i.test(title) || /profit\s+for\s+the\s+period/i.test(title)) netProfit = numeric;
  }
  const profitMargin = revenueTotal !== 0 ? netProfit / revenueTotal : 0;
  return { revenueTotal, expensesTotal, netProfit, profitMargin };
}
const pnlConsolidated_get = eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event);
  const client = await createXeroClient({ tokenSet: token });
  const query = getQuery(event);
  const fromDate = String(query.fromDate || "");
  const toDate = String(query.toDate || "");
  const { from, to } = !fromDate || !toDate ? getDefaultRange() : { from: fromDate, to: toDate };
  const tenants = await fetchTenants(client);
  const results = [];
  for (const t of tenants) {
    if (!t.tenantId || !t.tenantName) continue;
    try {
      const pnl = await fetchPnLForTenant(client, t.tenantId, from, to);
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
