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
function getDefaultRange() {
  const to = /* @__PURE__ */ new Date();
  const from = /* @__PURE__ */ new Date();
  from.setDate(to.getDate() - 30);
  return { from: ensureDateString(from), to: ensureDateString(to) };
}
const pnl_get = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const fromDate = String(query.fromDate || "");
  const toDate = String(query.toDate || "");
  const { from, to } = !fromDate || !toDate ? getDefaultRange() : { from: fromDate, to: toDate };
  const client = await createXeroClient({ tokenSet: token });
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
  const reportTable = (_c = (_a = report == null ? void 0 : report.reports) == null ? void 0 : _a[0]) != null ? _c : (_b = report == null ? void 0 : report.Reports) == null ? void 0 : _b[0];
  const tableRows = reportTable ? (_e = (_d = reportTable.rows) != null ? _d : reportTable.Rows) != null ? _e : [] : [];
  const periodLabels = getPeriodLabels(tableRows);
  const columnCount = periodLabels.length;
  const revenueByPeriod = findRowValues(tableRows, /total\s+revenue|total\s+income/i, columnCount);
  const expensesByPeriod = findRowValues(tableRows, /total\s+expense/i, columnCount);
  const netProfitByPeriod = findRowValues(tableRows, /net\s+profit|profit\s+for\s+the\s+period|net\s+income|net\s+loss/i, columnCount);
  const latestIndex = columnCount > 0 ? columnCount - 1 : 0;
  const revenueTotal = (_f = revenueByPeriod[latestIndex]) != null ? _f : 0;
  const expensesTotal = (_g = expensesByPeriod[latestIndex]) != null ? _g : 0;
  const netProfit = (_h = netProfitByPeriod[latestIndex]) != null ? _h : 0;
  const profitMargin = revenueTotal !== 0 ? netProfit / revenueTotal : 0;
  const periods = periodLabels.map((label, index) => {
    var _a2, _b2, _c2;
    const revenue = (_a2 = revenueByPeriod[index]) != null ? _a2 : 0;
    const expenses = (_b2 = expensesByPeriod[index]) != null ? _b2 : 0;
    const net = (_c2 = netProfitByPeriod[index]) != null ? _c2 : 0;
    const margin = revenue !== 0 ? net / revenue : 0;
    return {
      label,
      revenue,
      expenses,
      netProfit: net,
      profitMargin: margin
    };
  });
  const expensesByCategory = extractExpenseBreakdown(tableRows, latestIndex);
  return {
    fromDate: from,
    toDate: to,
    revenueTotal,
    expensesTotal,
    netProfit,
    profitMargin,
    periods,
    expensesByCategory
  };
});
function getRowType(row) {
  return (row.RowType || row.rowType || "").toString();
}
function getRows(row) {
  if (!row) return [];
  return row.Rows || row.rows || [];
}
function getCells(row) {
  if (!row) return [];
  return row.Cells || row.cells || [];
}
function getCellValue(cell) {
  var _a;
  const raw = (_a = cell == null ? void 0 : cell.Value) != null ? _a : cell == null ? void 0 : cell.value;
  return raw === void 0 || raw === null ? "" : String(raw);
}
function getRowTitle(row) {
  if (!row) return "";
  return row.Title || row.title || getCellValue(getCells(row)[0]) || "";
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
function getPeriodLabels(rows) {
  const headerRow = rows.find((row) => getRowType(row).toLowerCase() === "header");
  if (headerRow) {
    const [, ...cells] = getCells(headerRow);
    const labels = cells.map((cell) => getCellValue(cell));
    if (labels.length > 0) {
      return labels;
    }
  }
  for (const row of rows) {
    const cells = getCells(row);
    if (cells.length > 1) {
      return cells.slice(1).map((_, index) => `Period ${index + 1}`);
    }
  }
  return [];
}
function findRowValues(rows, matcher, columnCount) {
  let match = null;
  const visit = (row) => {
    if (match) return;
    const title = getRowTitle(row);
    if (matcher.test(title)) {
      const cells = getCells(row);
      const values = cells.slice(1).map((cell) => {
        var _a;
        return parseNumeric((_a = cell == null ? void 0 : cell.Value) != null ? _a : cell == null ? void 0 : cell.value);
      });
      match = values;
      return;
    }
    for (const child of getRows(row)) {
      visit(child);
      if (match) return;
    }
  };
  rows.forEach((row) => visit(row));
  if (!match) {
    return Array.from({ length: columnCount }, () => 0);
  }
  if (columnCount > 0 && match.length !== columnCount) {
    const values = match.slice(0, columnCount);
    while (values.length < columnCount) values.push(0);
    return values;
  }
  return match;
}
function extractExpenseBreakdown(rows, valueIndex) {
  const categories = /* @__PURE__ */ new Map();
  const visit = (row, inExpensesSection) => {
    var _a, _b;
    const title = getRowTitle(row);
    const rowType = getRowType(row).toLowerCase();
    const matchesExpenseSection = /expense/i.test(title);
    const isSummary = rowType === "summaryrow";
    const nextInExpenses = inExpensesSection || rowType === "section" && matchesExpenseSection;
    if (nextInExpenses && rowType === "row" && !isSummary) {
      const cells = getCells(row);
      const cell = cells[valueIndex + 1];
      const numeric = Math.abs(parseNumeric((_a = cell == null ? void 0 : cell.Value) != null ? _a : cell == null ? void 0 : cell.value));
      if (numeric > 0 && title) {
        const label = title.replace(/total\s+/i, "").trim();
        categories.set(label, ((_b = categories.get(label)) != null ? _b : 0) + numeric);
      }
    }
    for (const child of getRows(row)) {
      visit(child, nextInExpenses);
    }
  };
  rows.forEach((row) => visit(row, false));
  const entries = Array.from(categories.entries()).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  return entries.slice(0, 8).map(([name, value]) => ({
    name,
    value
  }));
}

export { pnl_get as default };
//# sourceMappingURL=pnl.get.mjs.map
