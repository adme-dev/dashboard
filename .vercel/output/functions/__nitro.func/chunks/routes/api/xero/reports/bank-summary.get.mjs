import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, b as getQuery, d as createXeroClient } from '../../../../nitro/nitro.mjs';
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
const bankSummary_get = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const date = String(query.date || ensureDateString(/* @__PURE__ */ new Date()));
  const client = await createXeroClient({ tokenSet: token, event });
  try {
    let flattenRows = function(rows2, out = []) {
      if (!rows2) return out;
      for (const row of rows2) {
        out.push(row);
        const child = (row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows);
        if (child) flattenRows(child, out);
      }
      return out;
    };
    const toDate = new Date(date);
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - 30);
    const { body: report } = await client.accountingApi.getReportBankSummary(
      tenantId,
      ensureDateString(fromDate),
      ensureDateString(toDate),
      void 0,
      false
    );
    const reportRows = (report == null ? void 0 : report.reports) || (report == null ? void 0 : report.Reports);
    const rows = flattenRows(((_a = reportRows == null ? void 0 : reportRows[0]) == null ? void 0 : _a.rows) || ((_b = reportRows == null ? void 0 : reportRows[0]) == null ? void 0 : _b.Rows));
    let totalBalance = 0;
    for (const row of rows) {
      const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
      const title = ((_c = cells == null ? void 0 : cells[0]) == null ? void 0 : _c.Value) || ((_d = cells == null ? void 0 : cells[0]) == null ? void 0 : _d.value) || (row == null ? void 0 : row.Title) || (row == null ? void 0 : row.title) || "";
      const lastCell = cells == null ? void 0 : cells[cells.length - 1];
      const valueStr = (_e = lastCell == null ? void 0 : lastCell.Value) != null ? _e : lastCell == null ? void 0 : lastCell.value;
      const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
      if (/total/i.test(title)) {
        totalBalance = numeric;
      }
    }
    if (!totalBalance) {
      totalBalance = rows.reduce((acc, row) => {
        var _a2;
        const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
        const lastCell = cells == null ? void 0 : cells[cells.length - 1];
        const valueStr = (_a2 = lastCell == null ? void 0 : lastCell.Value) != null ? _a2 : lastCell == null ? void 0 : lastCell.value;
        const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
        return acc + (Number.isFinite(numeric) ? numeric : 0);
      }, 0);
    }
    return { date, totalBalance };
  } catch {
    let flattenRows = function(rows2, out = []) {
      if (!rows2) return out;
      for (const row of rows2) {
        out.push(row);
        const child = (row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows);
        if (child) flattenRows(child, out);
      }
      return out;
    };
    const { body: report } = await client.accountingApi.getReportBalanceSheet(
      tenantId,
      date,
      void 0,
      void 0,
      false
    );
    const reportRows = (report == null ? void 0 : report.reports) || (report == null ? void 0 : report.Reports);
    const rows = flattenRows(((_f = reportRows == null ? void 0 : reportRows[0]) == null ? void 0 : _f.rows) || ((_g = reportRows == null ? void 0 : reportRows[0]) == null ? void 0 : _g.Rows));
    let totalBalance = 0;
    for (const row of rows) {
      const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
      const title = (((_h = cells == null ? void 0 : cells[0]) == null ? void 0 : _h.Value) || ((_i = cells == null ? void 0 : cells[0]) == null ? void 0 : _i.value) || (row == null ? void 0 : row.Title) || (row == null ? void 0 : row.title) || "").toLowerCase();
      const lastCell = cells == null ? void 0 : cells[cells.length - 1];
      const valueStr = (_j = lastCell == null ? void 0 : lastCell.Value) != null ? _j : lastCell == null ? void 0 : lastCell.value;
      const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
      if (/bank|cash\s+and\s+cash\s+equivalents|cash$/i.test(title)) {
        totalBalance += Number.isFinite(numeric) ? numeric : 0;
      }
    }
    return { date, totalBalance };
  }
});

export { bankSummary_get as default };
//# sourceMappingURL=bank-summary.get.mjs.map
