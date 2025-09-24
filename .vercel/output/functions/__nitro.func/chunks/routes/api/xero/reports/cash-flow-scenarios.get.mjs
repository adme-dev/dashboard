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
const cashFlowScenarios_get = eventHandler(async (event) => {
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
  const client = await createXeroClient({ tokenSet: token, event });
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
  const [receivables, payables, recentExpenses] = await Promise.all([
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
    client.accountingApi.getInvoices(
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
    ),
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCPAY"&&Status=="PAID"&&Date>=${toXeroDateTime(addDays(today, -90))}`,
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
    )
  ]);
  const totalHistoricalExpenses = (((_f = recentExpenses == null ? void 0 : recentExpenses.body) == null ? void 0 : _f.invoices) || []).reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0);
  const avgDailyExpenses = totalHistoricalExpenses / 90;
  const scenarios = {
    best: {
      receivableMultiplier: 1.2,
      // 20% better collection
      payableMultiplier: 0.9,
      // 10% less expenses
      expenseMultiplier: 0.8,
      // 20% less daily expenses
      collectionSpeedup: 7
      // Collect 7 days earlier
    },
    likely: {
      receivableMultiplier: 1,
      // Normal collection
      payableMultiplier: 1,
      // Normal expenses
      expenseMultiplier: 1,
      // Normal daily expenses
      collectionSpeedup: 0
      // No change in timing
    },
    worst: {
      receivableMultiplier: 0.8,
      // 20% worse collection
      payableMultiplier: 1.2,
      // 20% more expenses
      expenseMultiplier: 1.3,
      // 30% more daily expenses
      collectionSlowdown: 14
      // Collect 14 days later
    }
  };
  const generateScenario = (scenarioConfig) => {
    var _a2, _b2;
    const forecast = [];
    let runningBalance = currentCash;
    for (let i = 0; i <= daysAhead; i++) {
      const forecastDate = addDays(today, i);
      const dateStr = ensureDateString(forecastDate);
      const receivablesForDate = (((_a2 = receivables == null ? void 0 : receivables.body) == null ? void 0 : _a2.invoices) || []).filter((inv) => {
        const dueDate = (inv == null ? void 0 : inv.dueDate) ? new Date(inv.dueDate) : null;
        if (!dueDate) return false;
        const adjustedDate = addDays(dueDate, -scenarioConfig.collectionSpeedup || scenarioConfig.collectionSlowdown || 0);
        return ensureDateString(adjustedDate) === dateStr;
      }).reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.amountDue) || 0), 0) * scenarioConfig.receivableMultiplier;
      const payablesForDate = (((_b2 = payables == null ? void 0 : payables.body) == null ? void 0 : _b2.invoices) || []).filter((inv) => {
        const dueDate = (inv == null ? void 0 : inv.dueDate) ? new Date(inv.dueDate) : null;
        return dueDate && ensureDateString(dueDate) === dateStr;
      }).reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.amountDue) || 0), 0) * scenarioConfig.payableMultiplier;
      const isWeekday = forecastDate.getDay() >= 1 && forecastDate.getDay() <= 5;
      const dailyExpenses = isWeekday ? avgDailyExpenses * scenarioConfig.expenseMultiplier : 0;
      runningBalance += receivablesForDate - payablesForDate - dailyExpenses;
      forecast.push({
        date: dateStr,
        balance: Math.round(runningBalance * 100) / 100,
        inflows: Math.round(receivablesForDate * 100) / 100,
        outflows: Math.round((payablesForDate + dailyExpenses) * 100) / 100,
        netChange: Math.round((receivablesForDate - payablesForDate - dailyExpenses) * 100) / 100
      });
    }
    return forecast;
  };
  const bestCaseForecast = generateScenario(scenarios.best);
  const likelyCaseForecast = generateScenario(scenarios.likely);
  const worstCaseForecast = generateScenario(scenarios.worst);
  const combinedScenarios = likelyCaseForecast.map((item, index) => {
    var _a2, _b2;
    return {
      date: item.date,
      bestCase: ((_a2 = bestCaseForecast[index]) == null ? void 0 : _a2.balance) || item.balance,
      likelyCase: item.balance,
      worstCase: ((_b2 = worstCaseForecast[index]) == null ? void 0 : _b2.balance) || item.balance
    };
  });
  const calculateSummary = (forecast) => {
    var _a2;
    return {
      endBalance: ((_a2 = forecast[forecast.length - 1]) == null ? void 0 : _a2.balance) || currentCash,
      minBalance: Math.min(...forecast.map((f) => f.balance)),
      maxBalance: Math.max(...forecast.map((f) => f.balance)),
      shortfallDays: forecast.filter((f) => f.balance < 0).length,
      totalInflows: forecast.reduce((sum, f) => sum + f.inflows, 0),
      totalOutflows: forecast.reduce((sum, f) => sum + f.outflows, 0)
    };
  };
  return {
    currentCash: Math.round(currentCash * 100) / 100,
    forecastPeriod: daysAhead,
    scenarios: {
      best: bestCaseForecast.filter((_, index) => index % 7 === 0),
      // Weekly data points
      likely: likelyCaseForecast.filter((_, index) => index % 7 === 0),
      worst: worstCaseForecast.filter((_, index) => index % 7 === 0),
      combined: combinedScenarios.filter((_, index) => index % 7 === 0)
    },
    summaries: {
      best: calculateSummary(bestCaseForecast),
      likely: calculateSummary(likelyCaseForecast),
      worst: calculateSummary(worstCaseForecast)
    },
    assumptions: {
      best: {
        description: "Optimistic scenario with improved collections and reduced expenses",
        receivableCollection: "+20% better collection rate",
        expenseReduction: "-20% operating expenses",
        collectionTiming: "7 days faster collection"
      },
      likely: {
        description: "Most probable scenario based on historical patterns",
        receivableCollection: "Normal collection rate",
        expenseReduction: "Normal operating expenses",
        collectionTiming: "Normal collection timing"
      },
      worst: {
        description: "Conservative scenario with delayed collections and increased expenses",
        receivableCollection: "-20% collection rate",
        expenseReduction: "+30% operating expenses",
        collectionTiming: "14 days slower collection"
      }
    }
  };
});

export { cashFlowScenarios_get as default };
//# sourceMappingURL=cash-flow-scenarios.get.mjs.map
