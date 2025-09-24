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

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function dtExpr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `DateTime(${y},${m},${day})`;
}
const DEFAULT_MONTHLY_BUDGETS = {
  "Office Supplies": 2e3,
  "Travel & Entertainment": 3e3,
  "Software & Subscriptions": 2500,
  "Professional Services": 4e3,
  "Marketing & Advertising": 5e3,
  "Utilities": 1e3,
  "Equipment": 2e3,
  "Training & Development": 1500,
  "Rent": 8e3,
  "Insurance": 1200,
  "Other": 2e3
};
const budgetVariance_get = eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const monthInput = String(query.month || "");
  const yearInput = String(query.year || "");
  const today = /* @__PURE__ */ new Date();
  const targetMonth = monthInput ? Number(monthInput) - 1 : today.getMonth();
  const targetYear = yearInput ? Number(yearInput) : today.getFullYear();
  const monthStart = getMonthStart(new Date(targetYear, targetMonth));
  const monthEnd = getMonthEnd(new Date(targetYear, targetMonth));
  const client = await createXeroClient({ tokenSet: token, event });
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
  async function fetchAllInvoices(whereExpr) {
    const results = [];
    let page = 1;
    for (; ; ) {
      const { body } = await client.accountingApi.getInvoices(
        tenantId,
        void 0,
        whereExpr,
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
      if (page > 20) break;
    }
    return results;
  }
  const whereClause = `Type=="ACCPAY"&&Date>=${dtExpr(monthStart)}&&Date<=${dtExpr(monthEnd)}`;
  const expenses = await fetchAllInvoices(whereClause);
  const actualSpend = /* @__PURE__ */ new Map();
  for (const expense of expenses) {
    const lines = (expense == null ? void 0 : expense.lineItems) || [];
    const total = Number(expense == null ? void 0 : expense.total) || 0;
    if (lines.length > 0) {
      for (const line of lines) {
        const accountKey = (line == null ? void 0 : line.accountCode) || (line == null ? void 0 : line.accountID);
        const categoryName = accountKey && accountsMap.has(accountKey) ? accountsMap.get(accountKey) : accountKey || "Other";
        const amount = Number(line == null ? void 0 : line.lineAmount) || 0;
        actualSpend.set(categoryName, (actualSpend.get(categoryName) || 0) + amount);
      }
    } else {
      actualSpend.set("Other", (actualSpend.get("Other") || 0) + total);
    }
  }
  const budgetAnalysis = [];
  let totalBudget = 0;
  let totalActual = 0;
  let totalVariance = 0;
  const allCategories = /* @__PURE__ */ new Set([
    ...Object.keys(DEFAULT_MONTHLY_BUDGETS),
    ...actualSpend.keys()
  ]);
  for (const category of allCategories) {
    const budgeted = DEFAULT_MONTHLY_BUDGETS[category] || 0;
    const actual = actualSpend.get(category) || 0;
    const variance = actual - budgeted;
    const variancePercent = budgeted > 0 ? variance / budgeted * 100 : actual > 0 ? 100 : 0;
    totalBudget += budgeted;
    totalActual += actual;
    totalVariance += variance;
    budgetAnalysis.push({
      category,
      budgeted: Math.round(budgeted * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variancePercent: Math.round(variancePercent * 100) / 100,
      status: variance > budgeted * 0.1 ? "over" : variance < -budgeted * 0.1 ? "under" : "on-track"
    });
  }
  budgetAnalysis.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const overBudgetCategories = budgetAnalysis.filter((item) => item.variance > 0);
  const underBudgetCategories = budgetAnalysis.filter((item) => item.variance < 0);
  const totalVariancePercent = totalBudget > 0 ? totalVariance / totalBudget * 100 : 0;
  const isCurrentMonth = targetYear === today.getFullYear() && targetMonth === today.getMonth();
  const daysInMonth = monthEnd.getDate();
  const daysPassed = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysRemaining = daysInMonth - daysPassed;
  let projectedMonthEnd = totalActual;
  if (isCurrentMonth && daysPassed > 0) {
    const dailyAverage = totalActual / daysPassed;
    projectedMonthEnd = totalActual + dailyAverage * daysRemaining;
  }
  return {
    period: {
      month: targetMonth + 1,
      year: targetYear,
      monthName: monthStart.toLocaleString("default", { month: "long" }),
      isCurrentMonth,
      daysPassed,
      daysRemaining
    },
    summary: {
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalVariance: Math.round(totalVariance * 100) / 100,
      totalVariancePercent: Math.round(totalVariancePercent * 100) / 100,
      projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
      overBudgetCount: overBudgetCategories.length,
      underBudgetCount: underBudgetCategories.length
    },
    categoryAnalysis: budgetAnalysis,
    alerts: [
      ...overBudgetCategories.filter((item) => item.variancePercent > 20).map((item) => ({
        type: "warning",
        category: item.category,
        message: `${item.category} is ${item.variancePercent.toFixed(1)}% over budget`,
        severity: item.variancePercent > 50 ? "high" : "medium"
      })),
      ...isCurrentMonth && projectedMonthEnd > totalBudget * 1.1 ? [{
        type: "forecast",
        category: "Overall",
        message: `Projected to exceed total budget by ${((projectedMonthEnd - totalBudget) / totalBudget * 100).toFixed(1)}%`,
        severity: "high"
      }] : []
    ]
  };
});

export { budgetVariance_get as default };
//# sourceMappingURL=budget-variance.get.mjs.map
