import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, b as getQuery, d as createXeroClient } from '../../../nitro/nitro.mjs';
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
function dtExpr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `DateTime(${y},${m},${day})`;
}
function calculateStandardDeviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}
function isAnomaly(value, mean, stdDev, threshold = 2) {
  return Math.abs(value - mean) > threshold * stdDev;
}
const anomalyDetection_get = eventHandler(async (event) => {
  var _a, _b, _c;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const daysBack = Number(query.days) || 90;
  const sensitivity = Number(query.sensitivity) || 2;
  const today = /* @__PURE__ */ new Date();
  const startDate = addDays(today, -daysBack);
  const client = await createXeroClient({ tokenSet: token });
  let accountsMap = /* @__PURE__ */ new Map();
  try {
    const { body } = await client.accountingApi.getAccounts(tenantId);
    const accounts = (body == null ? void 0 : body.accounts) || [];
    for (const account of accounts) {
      if (account.accountID && account.name) {
        accountsMap.set(account.accountID, account.name);
        if (account.code) {
          accountsMap.set(account.code, account.name);
        }
      }
    }
  } catch (err) {
    console.warn("Failed to fetch chart of accounts:", err);
  }
  async function fetchAllInvoices() {
    const results = [];
    let page = 1;
    const whereClause = `Type=="ACCPAY"&&Date>=${dtExpr(startDate)}&&Date<=${dtExpr(today)}`;
    for (; ; ) {
      const { body } = await client.accountingApi.getInvoices(
        tenantId,
        void 0,
        whereClause,
        "Date DESC",
        void 0,
        void 0,
        void 0,
        void 0,
        page,
        void 0,
        void 0,
        void 0,
        100
      );
      const list = (body == null ? void 0 : body.invoices) || [];
      if (!list.length) break;
      results.push(...list);
      if (list.length < 100) break;
      page += 1;
      if (page > 50) break;
    }
    return results;
  }
  const expenses = await fetchAllInvoices();
  const categoryData = /* @__PURE__ */ new Map();
  const vendorData = /* @__PURE__ */ new Map();
  const dailyTotals = /* @__PURE__ */ new Map();
  for (const expense of expenses) {
    const total = Number(expense == null ? void 0 : expense.total) || 0;
    const vendor = ((_a = expense == null ? void 0 : expense.contact) == null ? void 0 : _a.name) || "Unknown";
    const date = ensureDateString(new Date((expense == null ? void 0 : expense.date) || today));
    const lines = (expense == null ? void 0 : expense.lineItems) || [];
    dailyTotals.set(date, (dailyTotals.get(date) || 0) + total);
    if (!vendorData.has(vendor)) vendorData.set(vendor, []);
    vendorData.get(vendor).push(total);
    if (lines.length > 0) {
      for (const line of lines) {
        const accountKey = (line == null ? void 0 : line.accountCode) || (line == null ? void 0 : line.accountID);
        const categoryName = accountKey && accountsMap.has(accountKey) ? accountsMap.get(accountKey) : "Other";
        const amount = Number(line == null ? void 0 : line.lineAmount) || 0;
        if (!categoryData.has(categoryName)) categoryData.set(categoryName, []);
        categoryData.get(categoryName).push(amount);
      }
    } else {
      if (!categoryData.has("Other")) categoryData.set("Other", []);
      categoryData.get("Other").push(total);
    }
  }
  const anomalies = [];
  const dailyAmounts = Array.from(dailyTotals.values());
  if (dailyAmounts.length > 7) {
    const dailyMean = dailyAmounts.reduce((sum, val) => sum + val, 0) / dailyAmounts.length;
    const dailyStdDev = calculateStandardDeviation(dailyAmounts);
    for (const [date, amount] of dailyTotals.entries()) {
      if (isAnomaly(amount, dailyMean, dailyStdDev, sensitivity)) {
        anomalies.push({
          type: "daily_spending",
          date,
          amount,
          expected: Math.round(dailyMean * 100) / 100,
          deviation: Math.round((amount - dailyMean) / dailyMean * 100 * 100) / 100,
          severity: Math.abs(amount - dailyMean) > 3 * dailyStdDev ? "high" : "medium",
          message: `Daily spending of $${amount.toFixed(2)} is ${amount > dailyMean ? "significantly higher" : "significantly lower"} than average ($${dailyMean.toFixed(2)})`
        });
      }
    }
  }
  for (const [category, amounts] of categoryData.entries()) {
    if (amounts.length > 3) {
      const categoryMean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
      const categoryStdDev = calculateStandardDeviation(amounts);
      for (const amount of amounts) {
        if (isAnomaly(amount, categoryMean, categoryStdDev, sensitivity)) {
          const transaction = expenses.find((exp) => {
            const lines = (exp == null ? void 0 : exp.lineItems) || [];
            return lines.some((line) => {
              const accountKey = (line == null ? void 0 : line.accountCode) || (line == null ? void 0 : line.accountID);
              const catName = accountKey && accountsMap.has(accountKey) ? accountsMap.get(accountKey) : "Other";
              return catName === category && Math.abs(Number(line == null ? void 0 : line.lineAmount) - amount) < 0.01;
            }) || lines.length === 0 && category === "Other" && Math.abs(Number(exp == null ? void 0 : exp.total) - amount) < 0.01;
          });
          if (transaction) {
            anomalies.push({
              type: "category_spending",
              category,
              amount,
              expected: Math.round(categoryMean * 100) / 100,
              deviation: Math.round((amount - categoryMean) / categoryMean * 100 * 100) / 100,
              severity: Math.abs(amount - categoryMean) > 3 * categoryStdDev ? "high" : "medium",
              transaction: {
                id: transaction.invoiceID,
                number: transaction.invoiceNumber,
                vendor: (_b = transaction == null ? void 0 : transaction.contact) == null ? void 0 : _b.name,
                date: ensureDateString(new Date((transaction == null ? void 0 : transaction.date) || today))
              },
              message: `${category} expense of $${amount.toFixed(2)} is unusual (avg: $${categoryMean.toFixed(2)})`
            });
          }
        }
      }
    }
  }
  for (const [vendor, amounts] of vendorData.entries()) {
    if (amounts.length > 2) {
      const vendorMean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
      const vendorStdDev = calculateStandardDeviation(amounts);
      const maxAmount = Math.max(...amounts);
      if (isAnomaly(maxAmount, vendorMean, vendorStdDev, sensitivity)) {
        const transaction = expenses.find(
          (exp) => {
            var _a2;
            return ((_a2 = exp == null ? void 0 : exp.contact) == null ? void 0 : _a2.name) === vendor && Math.abs(Number(exp == null ? void 0 : exp.total) - maxAmount) < 0.01;
          }
        );
        if (transaction) {
          anomalies.push({
            type: "vendor_spending",
            vendor,
            amount: maxAmount,
            expected: Math.round(vendorMean * 100) / 100,
            deviation: Math.round((maxAmount - vendorMean) / vendorMean * 100 * 100) / 100,
            severity: Math.abs(maxAmount - vendorMean) > 3 * vendorStdDev ? "high" : "medium",
            transaction: {
              id: transaction.invoiceID,
              number: transaction.invoiceNumber,
              date: ensureDateString(new Date((transaction == null ? void 0 : transaction.date) || today))
            },
            message: `Payment to ${vendor} of $${maxAmount.toFixed(2)} is unusually high (avg: $${vendorMean.toFixed(2)})`
          });
        }
      }
    }
  }
  const weekendExpenses = expenses.filter((exp) => {
    const date = new Date((exp == null ? void 0 : exp.date) || today);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  });
  for (const expense of weekendExpenses) {
    const amount = Number(expense == null ? void 0 : expense.total) || 0;
    if (amount > 500) {
      anomalies.push({
        type: "timing_anomaly",
        amount,
        transaction: {
          id: expense.invoiceID,
          number: expense.invoiceNumber,
          vendor: (_c = expense == null ? void 0 : expense.contact) == null ? void 0 : _c.name,
          date: ensureDateString(new Date((expense == null ? void 0 : expense.date) || today))
        },
        severity: amount > 2e3 ? "high" : "medium",
        message: `Significant business expense ($${amount.toFixed(2)}) on weekend`
      });
    }
  }
  anomalies.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.amount - a.amount;
  });
  const totalExpenses = expenses.reduce((sum, exp) => sum + (Number(exp == null ? void 0 : exp.total) || 0), 0);
  const anomalyCount = anomalies.length;
  const highSeverityCount = anomalies.filter((a) => a.severity === "high").length;
  return {
    period: {
      from: ensureDateString(startDate),
      to: ensureDateString(today),
      days: daysBack
    },
    summary: {
      totalTransactions: expenses.length,
      totalAmount: Math.round(totalExpenses * 100) / 100,
      anomaliesDetected: anomalyCount,
      highSeverityAnomalies: highSeverityCount,
      anomalyRate: expenses.length > 0 ? Math.round(anomalyCount / expenses.length * 100 * 100) / 100 : 0
    },
    anomalies: anomalies.slice(0, 50),
    // Limit to top 50 anomalies
    insights: [
      anomalyCount === 0 ? "No significant spending anomalies detected in the selected period." : null,
      highSeverityCount > 0 ? `${highSeverityCount} high-severity anomalies require immediate attention.` : null,
      weekendExpenses.length > 0 ? `${weekendExpenses.length} transactions occurred on weekends.` : null
    ].filter(Boolean)
  };
});

export { anomalyDetection_get as default };
//# sourceMappingURL=anomaly-detection.get.mjs.map
