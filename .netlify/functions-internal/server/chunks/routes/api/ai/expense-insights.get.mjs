import { f as defineEventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, d as createXeroClient, h as generateExpenseInsights, i as analyzeExpenseAnomalies, j as generateExpenseOptimization } from '../../../nitro/nitro.mjs';
import 'groq-sdk';
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

const expenseInsights_get = defineEventHandler(async (event) => {
  var _a, _b, _c, _d, _e;
  try {
    const tokenSet = await getActiveTokenForSession(event);
    const tenantId = getSelectedTenant(event);
    if (!(tokenSet == null ? void 0 : tokenSet.access_token) || !tenantId) {
      throw createError({
        statusCode: 401,
        statusMessage: "Xero authentication required"
      });
    }
    const client = createXeroClient();
    client.setTokenSet(tokenSet);
    const endDate = /* @__PURE__ */ new Date();
    const startDate = /* @__PURE__ */ new Date();
    startDate.setDate(startDate.getDate() - 90);
    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - 90);
    const [currentTransactions, previousTransactions, accounts] = await Promise.all([
      client.accountingApi.getBankTransactions(tenantId, void 0, {
        where: `Date >= DateTime(${startDate.getFullYear()}, ${startDate.getMonth() + 1}, ${startDate.getDate()}) AND Date <= DateTime(${endDate.getFullYear()}, ${endDate.getMonth() + 1}, ${endDate.getDate()}) AND Type == "SPEND"`
      }),
      client.accountingApi.getBankTransactions(tenantId, void 0, {
        where: `Date >= DateTime(${prevStartDate.getFullYear()}, ${prevStartDate.getMonth() + 1}, ${prevStartDate.getDate()}) AND Date <= DateTime(${prevEndDate.getFullYear()}, ${prevEndDate.getMonth() + 1}, ${prevEndDate.getDate()}) AND Type == "SPEND"`
      }),
      client.accountingApi.getAccounts(tenantId)
    ]);
    const accountLookup = /* @__PURE__ */ new Map();
    if ((_a = accounts.body) == null ? void 0 : _a.accounts) {
      accounts.body.accounts.forEach((account) => {
        if (account.accountID) {
          accountLookup.set(account.accountID, account.name || account.code || "Unknown");
        }
        if (account.code) {
          accountLookup.set(account.code, account.name || account.code || "Unknown");
        }
      });
    }
    const currentExpenseData = ((_c = (_b = currentTransactions.body) == null ? void 0 : _b.bankTransactions) == null ? void 0 : _c.map((transaction) => {
      var _a2, _b2, _c2, _d2;
      return {
        id: transaction.bankTransactionID,
        date: transaction.date,
        amount: Math.abs(transaction.total || 0),
        description: transaction.reference || "Unknown",
        category: ((_b2 = (_a2 = transaction.lineItems) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.accountID) ? accountLookup.get(transaction.lineItems[0].accountID) || "Unknown" : "Unknown",
        vendor: transaction.reference || "Unknown",
        accountId: (_d2 = (_c2 = transaction.lineItems) == null ? void 0 : _c2[0]) == null ? void 0 : _d2.accountID,
        type: transaction.type
      };
    })) || [];
    const previousExpenseData = ((_e = (_d = previousTransactions.body) == null ? void 0 : _d.bankTransactions) == null ? void 0 : _e.map((transaction) => {
      var _a2, _b2, _c2, _d2;
      return {
        id: transaction.bankTransactionID,
        date: transaction.date,
        amount: Math.abs(transaction.total || 0),
        description: transaction.reference || "Unknown",
        category: ((_b2 = (_a2 = transaction.lineItems) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.accountID) ? accountLookup.get(transaction.lineItems[0].accountID) || "Unknown" : "Unknown",
        vendor: transaction.reference || "Unknown",
        accountId: (_d2 = (_c2 = transaction.lineItems) == null ? void 0 : _c2[0]) == null ? void 0 : _d2.accountID,
        type: transaction.type
      };
    })) || [];
    const [insights, anomalies, optimization] = await Promise.all([
      generateExpenseInsights(currentExpenseData, previousExpenseData),
      analyzeExpenseAnomalies(currentExpenseData),
      generateExpenseOptimization(currentExpenseData)
    ]);
    const currentTotal = currentExpenseData.reduce((sum, expense) => sum + expense.amount, 0);
    const previousTotal = previousExpenseData.reduce((sum, expense) => sum + expense.amount, 0);
    const changePercent = previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal * 100 : 0;
    return {
      success: true,
      data: {
        period: {
          current: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            total: currentTotal,
            transactionCount: currentExpenseData.length
          },
          previous: {
            start: prevStartDate.toISOString(),
            end: prevEndDate.toISOString(),
            total: previousTotal,
            transactionCount: previousExpenseData.length
          },
          change: {
            amount: currentTotal - previousTotal,
            percentage: changePercent
          }
        },
        insights,
        anomalies,
        optimization,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        model: "Groq Llama 3.1 70B"
      }
    };
  } catch (error) {
    console.error("Error generating expense insights:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to generate AI insights"
    });
  }
});

export { expenseInsights_get as default };
//# sourceMappingURL=expense-insights.get.mjs.map
