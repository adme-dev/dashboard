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
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function toXeroDateTime(date) {
  return `DateTime(${date.getUTCFullYear()}, ${date.getUTCMonth() + 1}, ${date.getUTCDate()})`;
}
const cashFlowForecast_get = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e, _f;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const daysAhead = Number(query.days) || 90;
  const today = /* @__PURE__ */ new Date();
  addDays(today, daysAhead);
  const client = await createXeroClient({ tokenSet: token });
  const fromDate = addDays(today, -30);
  const { body: bankReport } = await client.accountingApi.getReportBankSummary(
    tenantId,
    ensureDateString(fromDate),
    ensureDateString(today),
    void 0,
    false
  );
  let currentCash = 0;
  const reportRows = ((_b = (_a = bankReport == null ? void 0 : bankReport.reports) == null ? void 0 : _a[0]) == null ? void 0 : _b.rows) || ((_d = (_c = bankReport == null ? void 0 : bankReport.Reports) == null ? void 0 : _c[0]) == null ? void 0 : _d.Rows) || [];
  function flattenRows(rows, out = []) {
    for (const row of rows) {
      out.push(row);
      if ((row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows)) {
        flattenRows(row.Rows || row.rows, out);
      }
    }
    return out;
  }
  const allRows = flattenRows(reportRows);
  for (const row of allRows) {
    const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
    const lastCell = cells[cells.length - 1];
    const value = (_e = lastCell == null ? void 0 : lastCell.Value) != null ? _e : lastCell == null ? void 0 : lastCell.value;
    if (typeof value === "number") {
      currentCash += value;
    } else if (typeof value === "string") {
      const parsed = Number(value);
      if (!isNaN(parsed)) currentCash += parsed;
    }
  }
  const { body: receivables } = await client.accountingApi.getInvoices(
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
  );
  const { body: payables } = await client.accountingApi.getInvoices(
    tenantId,
    void 0,
    'Type=="ACCPAY"&&Status=="AUTHORISED"',
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
  );
  const pastDate = addDays(today, -90);
  const { body: recentExpenses } = await client.accountingApi.getInvoices(
    tenantId,
    void 0,
    `Type=="ACCPAY"&&Status=="PAID"&&Date>=${toXeroDateTime(pastDate)}`,
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
  );
  const totalHistoricalExpenses = ((recentExpenses == null ? void 0 : recentExpenses.invoices) || []).reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0);
  const avgDailyExpenses = totalHistoricalExpenses / 90;
  const forecast = [];
  let runningBalance = currentCash;
  for (let i = 0; i <= daysAhead; i++) {
    const forecastDate = addDays(today, i);
    const dateStr = ensureDateString(forecastDate);
    const receivablesForDate = ((receivables == null ? void 0 : receivables.invoices) || []).filter((inv) => {
      const dueDate = (inv == null ? void 0 : inv.dueDate) ? new Date(inv.dueDate) : null;
      return dueDate && ensureDateString(dueDate) === dateStr;
    }).reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.amountDue) || 0), 0);
    const payablesForDate = ((payables == null ? void 0 : payables.invoices) || []).filter((inv) => {
      const dueDate = (inv == null ? void 0 : inv.dueDate) ? new Date(inv.dueDate) : null;
      return dueDate && ensureDateString(dueDate) === dateStr;
    }).reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.amountDue) || 0), 0);
    const isWeekday = forecastDate.getDay() >= 1 && forecastDate.getDay() <= 5;
    const dailyExpenses = isWeekday ? avgDailyExpenses : 0;
    runningBalance += receivablesForDate - payablesForDate - dailyExpenses;
    forecast.push({
      date: dateStr,
      balance: Math.round(runningBalance * 100) / 100,
      inflows: Math.round(receivablesForDate * 100) / 100,
      outflows: Math.round((payablesForDate + dailyExpenses) * 100) / 100,
      netChange: Math.round((receivablesForDate - payablesForDate - dailyExpenses) * 100) / 100
    });
  }
  const minBalance = Math.min(...forecast.map((f) => f.balance));
  const maxBalance = Math.max(...forecast.map((f) => f.balance));
  const endBalance = ((_f = forecast[forecast.length - 1]) == null ? void 0 : _f.balance) || currentCash;
  const shortfallDates = forecast.filter((f) => f.balance < 0).map((f) => f.date);
  const weeklyOutflows = forecast.slice(0, 7).reduce((sum, f) => sum + f.outflows, 0);
  const burnRate = weeklyOutflows / 7;
  return {
    currentCash: Math.round(currentCash * 100) / 100,
    forecastPeriod: daysAhead,
    projectedEndBalance: endBalance,
    minProjectedBalance: minBalance,
    maxProjectedBalance: maxBalance,
    dailyBurnRate: Math.round(burnRate * 100) / 100,
    shortfallDates,
    forecast: forecast.filter((_, index) => index % 7 === 0),
    // Weekly data points for chart
    dailyForecast: forecast
    // Full daily data for detailed analysis
  };
});

export { cashFlowForecast_get as default };
//# sourceMappingURL=cash-flow-forecast.get.mjs.map
