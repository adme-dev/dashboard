import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, d as createXeroClient } from '../../nitro/nitro.mjs';
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
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function dtExpr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `DateTime(${y},${m},${day})`;
}
const kpisAdvanced_get = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const today = /* @__PURE__ */ new Date();
  const monthStart = getMonthStart(today);
  new Date(today.getFullYear(), 0, 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const client = await createXeroClient({ tokenSet: token, event });
  const [
    currentCashResponse,
    currentMonthInvoicesResponse,
    lastMonthInvoicesResponse,
    currentMonthExpensesResponse,
    lastMonthExpensesResponse,
    outstandingInvoicesResponse,
    overdueInvoicesResponse,
    balanceSheetResponse
  ] = await Promise.allSettled([
    // Current cash position - need date range for bank summary
    client.accountingApi.getReportBankSummary(tenantId, ensureDateString(addDays(today, -30)), ensureDateString(today)),
    // Current month revenue
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCREC"&&Status=="PAID"&&Date>=${dtExpr(monthStart)}&&Date<=${dtExpr(today)}`,
      "Date DESC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      500
    ),
    // Last month revenue (for comparison)
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCREC"&&Status=="PAID"&&Date>=${dtExpr(lastMonth)}&&Date<=${dtExpr(lastMonthEnd)}`,
      "Date DESC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      500
    ),
    // Current month expenses
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(monthStart)}&&Date<=${dtExpr(today)}`,
      "Date DESC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      500
    ),
    // Last month expenses (for comparison)
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(lastMonth)}&&Date<=${dtExpr(lastMonthEnd)}`,
      "Date DESC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      500
    ),
    // Outstanding receivables
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      'Type=="ACCREC"&&Status=="AUTHORISED"',
      "DueDate ASC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      200
    ),
    // Overdue receivables
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCREC"&&Status=="AUTHORISED"&&DueDate<${dtExpr(today)}`,
      "DueDate ASC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      200
    ),
    // Balance sheet for financial ratios
    client.accountingApi.getReportBalanceSheet(tenantId, ensureDateString(today))
  ]);
  function extractData(result) {
    return result.status === "fulfilled" ? result.value : null;
  }
  let currentCash = 0;
  const cashData = extractData(currentCashResponse);
  if ((_c = (_b = (_a = cashData == null ? void 0 : cashData.body) == null ? void 0 : _a.reports) == null ? void 0 : _b[0]) == null ? void 0 : _c.rows) {
    let flattenRows = function(rows, out = []) {
      for (const row of rows) {
        out.push(row);
        if ((row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows)) {
          flattenRows(row.Rows || row.rows, out);
        }
      }
      return out;
    };
    const allRows = flattenRows(cashData.body.reports[0].rows);
    for (const row of allRows) {
      const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
      const lastCell = cells[cells.length - 1];
      const value = (_d = lastCell == null ? void 0 : lastCell.Value) != null ? _d : lastCell == null ? void 0 : lastCell.value;
      if (typeof value === "number") {
        currentCash += value;
      } else if (typeof value === "string") {
        const parsed = Number(value);
        if (!isNaN(parsed)) currentCash += parsed;
      }
    }
  }
  const currentMonthRevenue = ((_g = (_f = (_e = extractData(currentMonthInvoicesResponse)) == null ? void 0 : _e.body) == null ? void 0 : _f.invoices) == null ? void 0 : _g.reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0)) || 0;
  const lastMonthRevenue = ((_j = (_i = (_h = extractData(lastMonthInvoicesResponse)) == null ? void 0 : _h.body) == null ? void 0 : _i.invoices) == null ? void 0 : _j.reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0)) || 0;
  const currentMonthExpenses = ((_m = (_l = (_k = extractData(currentMonthExpensesResponse)) == null ? void 0 : _k.body) == null ? void 0 : _l.invoices) == null ? void 0 : _m.reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0)) || 0;
  const lastMonthExpenses = ((_p = (_o = (_n = extractData(lastMonthExpensesResponse)) == null ? void 0 : _n.body) == null ? void 0 : _o.invoices) == null ? void 0 : _p.reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0)) || 0;
  const outstandingInvoices = ((_r = (_q = extractData(outstandingInvoicesResponse)) == null ? void 0 : _q.body) == null ? void 0 : _r.invoices) || [];
  const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.amountDue) || 0), 0);
  const overdueInvoices = ((_t = (_s = extractData(overdueInvoicesResponse)) == null ? void 0 : _s.body) == null ? void 0 : _t.invoices) || [];
  const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.amountDue) || 0), 0);
  const balanceSheet = ((_w = (_v = (_u = extractData(balanceSheetResponse)) == null ? void 0 : _u.body) == null ? void 0 : _v.reports) == null ? void 0 : _w[0]) || null;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  if (balanceSheet == null ? void 0 : balanceSheet.rows) {
    let flattenRows = function(rows2, out = []) {
      for (const row of rows2) {
        out.push(row);
        if ((row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows)) {
          flattenRows(row.Rows || row.rows, out);
        }
      }
      return out;
    };
    const rows = flattenRows(balanceSheet.rows);
    for (const row of rows) {
      const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
      const title = ((_x = cells == null ? void 0 : cells[0]) == null ? void 0 : _x.Value) || ((_y = cells == null ? void 0 : cells[0]) == null ? void 0 : _y.value) || "";
      const lastCell = cells[cells.length - 1];
      const numeric = Number((_z = lastCell == null ? void 0 : lastCell.Value) != null ? _z : lastCell == null ? void 0 : lastCell.value) || 0;
      if (/total\s+assets/i.test(title)) totalAssets = numeric;
      if (/total\s+liabilit/i.test(title)) totalLiabilities = numeric;
      if (/total\s+equity/i.test(title) || /net\s+assets/i.test(title)) totalEquity = numeric;
    }
  }
  const currentProfit = currentMonthRevenue - currentMonthExpenses;
  const lastMonthProfit = lastMonthRevenue - lastMonthExpenses;
  const profitMargin = currentMonthRevenue > 0 ? currentProfit / currentMonthRevenue * 100 : 0;
  const revenueGrowth = lastMonthRevenue > 0 ? (currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100 : 0;
  const expenseGrowth = lastMonthExpenses > 0 ? (currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses * 100 : 0;
  const profitGrowth = lastMonthProfit !== 0 ? (currentProfit - lastMonthProfit) / Math.abs(lastMonthProfit) * 100 : 0;
  const currentRatio = totalLiabilities > 0 ? totalAssets / totalLiabilities : 0;
  const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : 0;
  const workingCapital = totalAssets - totalLiabilities;
  const daysInMonth = today.getDate();
  const dailyBurnRate = currentMonthExpenses / daysInMonth;
  const cashRunway = dailyBurnRate > 0 ? currentCash / dailyBurnRate : 999;
  const averageInvoiceValue = outstandingInvoices.length > 0 ? totalOutstanding / outstandingInvoices.length : 0;
  const overdueRate = totalOutstanding > 0 ? totalOverdue / totalOutstanding * 100 : 0;
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    period: {
      current: {
        from: ensureDateString(monthStart),
        to: ensureDateString(today)
      },
      comparison: {
        from: ensureDateString(lastMonth),
        to: ensureDateString(lastMonthEnd)
      }
    },
    // Core financial metrics
    revenue: {
      current: Math.round(currentMonthRevenue * 100) / 100,
      lastMonth: Math.round(lastMonthRevenue * 100) / 100,
      growth: Math.round(revenueGrowth * 100) / 100,
      trend: revenueGrowth > 5 ? "up" : revenueGrowth < -5 ? "down" : "stable"
    },
    expenses: {
      current: Math.round(currentMonthExpenses * 100) / 100,
      lastMonth: Math.round(lastMonthExpenses * 100) / 100,
      growth: Math.round(expenseGrowth * 100) / 100,
      trend: expenseGrowth > 5 ? "up" : expenseGrowth < -5 ? "down" : "stable"
    },
    profit: {
      current: Math.round(currentProfit * 100) / 100,
      lastMonth: Math.round(lastMonthProfit * 100) / 100,
      margin: Math.round(profitMargin * 100) / 100,
      growth: Math.round(profitGrowth * 100) / 100,
      trend: profitGrowth > 5 ? "up" : profitGrowth < -5 ? "down" : "stable"
    },
    // Cash and liquidity
    cash: {
      current: Math.round(currentCash * 100) / 100,
      dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
      runway: Math.round(cashRunway),
      status: cashRunway > 90 ? "healthy" : cashRunway > 30 ? "warning" : "critical"
    },
    // Receivables
    receivables: {
      total: Math.round(totalOutstanding * 100) / 100,
      overdue: Math.round(totalOverdue * 100) / 100,
      overdueRate: Math.round(overdueRate * 100) / 100,
      count: outstandingInvoices.length,
      overdueCount: overdueInvoices.length,
      averageValue: Math.round(averageInvoiceValue * 100) / 100
    },
    // Financial health ratios
    ratios: {
      currentRatio: Math.round(currentRatio * 100) / 100,
      debtToEquity: Math.round(debtToEquity * 100) / 100,
      workingCapital: Math.round(workingCapital * 100) / 100,
      healthScore: Math.min(100, Math.max(
        0,
        (currentRatio > 1.5 ? 25 : currentRatio * 16.67) + (debtToEquity < 0.5 ? 25 : Math.max(0, 25 - debtToEquity * 25)) + (profitMargin > 10 ? 25 : Math.max(0, profitMargin * 2.5)) + (cashRunway > 90 ? 25 : Math.max(0, cashRunway * 0.28))
      ))
    },
    // Alerts and insights
    alerts: [
      ...cashRunway < 30 ? [{
        type: "cash_flow",
        severity: "critical",
        message: `Critical: Only ${Math.round(cashRunway)} days of cash remaining`
      }] : [],
      ...overdueRate > 20 ? [{
        type: "collections",
        severity: "warning",
        message: `${overdueRate.toFixed(1)}% of receivables are overdue`
      }] : [],
      ...expenseGrowth > revenueGrowth + 10 ? [{
        type: "profitability",
        severity: "warning",
        message: "Expenses growing faster than revenue"
      }] : [],
      ...currentRatio < 1 ? [{
        type: "liquidity",
        severity: "warning",
        message: "Current assets less than current liabilities"
      }] : []
    ],
    // Performance indicators
    indicators: {
      revenueVelocity: revenueGrowth,
      expenseControl: -expenseGrowth,
      // Negative growth is good for expenses
      cashEfficiency: currentCash / currentMonthExpenses,
      collectionEfficiency: 100 - overdueRate
    }
  };
});

export { kpisAdvanced_get as default };
//# sourceMappingURL=kpis-advanced.get.mjs.map
