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
function getDefaultToDate() {
  const to = /* @__PURE__ */ new Date();
  return ensureDateString(to);
}
const balanceSheet_get = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const toDate = String(query.toDate || getDefaultToDate());
  const client = await createXeroClient({ tokenSet: token, event });
  const { body: report } = await client.accountingApi.getReportBalanceSheet(
    tenantId,
    toDate,
    void 0,
    void 0,
    false
  );
  const reportTable = (_c = (_a = report == null ? void 0 : report.reports) == null ? void 0 : _a[0]) != null ? _c : (_b = report == null ? void 0 : report.Reports) == null ? void 0 : _b[0];
  const tableRows = reportTable ? (_e = (_d = reportTable.rows) != null ? _d : reportTable.Rows) != null ? _e : [] : [];
  const rows = flattenRows(tableRows);
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  for (const row of rows) {
    const cells = getCells(row);
    const title = getRowTitle(row);
    const lastCell = cells[cells.length - 1];
    const numeric = parseNumeric(getCellValue(lastCell));
    if (/total\s+assets/i.test(title)) totalAssets = numeric;
    if (/total\s+liabilit/i.test(title)) totalLiabilities = numeric;
    if (/total\s+equity/i.test(title) || /net\s+assets/i.test(title)) totalEquity = numeric;
  }
  const workingCapital = totalAssets - totalLiabilities;
  const debtToEquity = totalEquity !== 0 ? totalLiabilities / totalEquity : 0;
  const equityRatio = totalAssets !== 0 ? totalEquity / totalAssets : 0;
  return {
    date: toDate,
    totalAssets,
    totalLiabilities,
    totalEquity,
    workingCapital,
    debtToEquity,
    equityRatio
  };
});
function flattenRows(rows, out = []) {
  if (!rows) return out;
  for (const row of rows) {
    out.push(row);
    const child = row.Rows || row.rows;
    if (child) flattenRows(child, out);
  }
  return out;
}
function getCells(row) {
  if (!row) return [];
  return row.Cells || row.cells || [];
}
function getRowTitle(row) {
  if (!row) return "";
  return row.Title || row.title || getCellValue(getCells(row)[0]) || "";
}
function getCellValue(cell) {
  var _a;
  const raw = (_a = cell == null ? void 0 : cell.Value) != null ? _a : cell == null ? void 0 : cell.value;
  return raw === void 0 || raw === null ? "" : String(raw);
}
function parseNumeric(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const isNegative = /^\(.*\)$/.test(trimmed);
    const normalized = trimmed.replace(/[(),]/g, "").replace(/[^0-9.-]/g, "");
    const numeric = Number(normalized);
    if (Number.isNaN(numeric)) return 0;
    return isNegative ? -numeric : numeric;
  }
  return 0;
}

export { balanceSheet_get as default };
//# sourceMappingURL=balance-sheet.get.mjs.map
