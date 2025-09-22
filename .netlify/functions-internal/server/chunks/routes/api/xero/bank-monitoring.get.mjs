import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, b as getQuery, d as createXeroClient } from '../../../nitro/nitro.mjs';
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
const bankMonitoring_get = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e, _f;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const daysBack = Number(query.days) || 30;
  const includeTransactions = query.transactions === "true";
  const today = /* @__PURE__ */ new Date();
  const startDate = addDays(today, -daysBack);
  const client = await createXeroClient({ tokenSet: token });
  const { body: accountsResponse } = await client.accountingApi.getAccounts(
    tenantId,
    void 0,
    'Type=="BANK"',
    "Name ASC"
  );
  const bankAccounts = (accountsResponse == null ? void 0 : accountsResponse.accounts) || [];
  const { body: bankSummary } = await client.accountingApi.getReportBankSummary(
    tenantId,
    ensureDateString(today)
  );
  const currentBalances = /* @__PURE__ */ new Map();
  function flattenRows(rows, out = []) {
    for (const row of rows) {
      out.push(row);
      if ((row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows)) {
        flattenRows(row.Rows || row.rows, out);
      }
    }
    return out;
  }
  if ((_b = (_a = bankSummary == null ? void 0 : bankSummary.reports) == null ? void 0 : _a[0]) == null ? void 0 : _b.rows) {
    const allRows = flattenRows(bankSummary.reports[0].rows);
    for (const row of allRows) {
      const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
      const accountName = ((_c = cells == null ? void 0 : cells[0]) == null ? void 0 : _c.Value) || ((_d = cells == null ? void 0 : cells[0]) == null ? void 0 : _d.value) || "";
      const balanceCell = cells[cells.length - 1];
      const balance = Number((_e = balanceCell == null ? void 0 : balanceCell.Value) != null ? _e : balanceCell == null ? void 0 : balanceCell.value) || 0;
      if (accountName && balance !== 0) {
        currentBalances.set(accountName.trim(), balance);
      }
    }
  }
  const bankTransactionsPromises = bankAccounts.map(async (account) => {
    try {
      const { body } = await client.accountingApi.getBankTransactions(
        tenantId,
        void 0,
        `BankAccount.AccountID=="${account.accountID}"&&Date>=${dtExpr(startDate)}&&Date<=${dtExpr(today)}`,
        "Date DESC",
        1,
        void 0,
        100
      );
      return {
        accountId: account.accountID,
        accountName: account.name,
        transactions: (body == null ? void 0 : body.bankTransactions) || []
      };
    } catch (err) {
      console.warn(`Failed to fetch transactions for ${account.name}:`, err);
      return {
        accountId: account.accountID,
        accountName: account.name,
        transactions: []
      };
    }
  });
  const bankTransactionResults = await Promise.all(bankTransactionsPromises);
  const accountSummaries = [];
  let totalBalance = 0;
  let totalInflows = 0;
  let totalOutflows = 0;
  for (const account of bankAccounts) {
    const accountName = account.name || "Unknown Account";
    const currentBalance = currentBalances.get(accountName) || 0;
    const transactionData = bankTransactionResults.find((r) => r.accountId === account.accountID);
    const transactions = (transactionData == null ? void 0 : transactionData.transactions) || [];
    let accountInflows = 0;
    let accountOutflows = 0;
    const dailyBalances = /* @__PURE__ */ new Map();
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(a.date || "").getTime() - new Date(b.date || "").getTime()
    );
    let runningBalance = currentBalance;
    for (let i = sortedTransactions.length - 1; i >= 0; i--) {
      const transaction = sortedTransactions[i];
      const amount = Number(transaction.total) || 0;
      const date = ensureDateString(new Date(transaction.date || today));
      if (amount > 0) {
        accountInflows += amount;
        runningBalance -= amount;
      } else {
        accountOutflows += Math.abs(amount);
        runningBalance -= amount;
      }
      dailyBalances.set(date, runningBalance);
    }
    const balanceHistory = [];
    let historicalBalance = runningBalance;
    for (let i = 0; i <= daysBack; i++) {
      const date = addDays(startDate, i);
      const dateStr = ensureDateString(date);
      const dayTransactions = transactions.filter(
        (t) => ensureDateString(new Date(t.date || "")) === dateStr
      );
      for (const tx of dayTransactions) {
        historicalBalance += Number(tx.total) || 0;
      }
      balanceHistory.push({
        date: dateStr,
        balance: Math.round(historicalBalance * 100) / 100
      });
    }
    const startBalance = ((_f = balanceHistory[0]) == null ? void 0 : _f.balance) || currentBalance;
    const balanceChange = currentBalance - startBalance;
    const balanceChangePercent = startBalance !== 0 ? balanceChange / Math.abs(startBalance) * 100 : 0;
    let healthStatus = "healthy";
    let alerts = [];
    if (currentBalance < 0) {
      healthStatus = "critical";
      alerts.push({ type: "overdraft", message: "Account is overdrawn" });
    } else if (currentBalance < 1e3) {
      healthStatus = "warning";
      alerts.push({ type: "low_balance", message: "Balance is critically low" });
    }
    if (Math.abs(balanceChangePercent) > 50) {
      alerts.push({
        type: "volatility",
        message: `Balance changed by ${balanceChangePercent.toFixed(1)}% in ${daysBack} days`
      });
    }
    const avgDailyChange = balanceChange / daysBack;
    if (avgDailyChange < -100) {
      alerts.push({
        type: "burn_rate",
        message: `Average daily outflow of $${Math.abs(avgDailyChange).toFixed(2)}`
      });
    }
    accountSummaries.push({
      accountId: account.accountID,
      accountName,
      accountCode: account.code,
      currentBalance: Math.round(currentBalance * 100) / 100,
      balanceChange: Math.round(balanceChange * 100) / 100,
      balanceChangePercent: Math.round(balanceChangePercent * 100) / 100,
      inflows: Math.round(accountInflows * 100) / 100,
      outflows: Math.round(accountOutflows * 100) / 100,
      netFlow: Math.round((accountInflows - accountOutflows) * 100) / 100,
      transactionCount: transactions.length,
      healthStatus,
      alerts,
      balanceHistory: balanceHistory.filter((_, index) => index % 7 === 0),
      // Weekly points for charts
      ...includeTransactions && {
        recentTransactions: transactions.slice(0, 10).map((tx) => {
          var _a2;
          return {
            id: tx.bankTransactionID,
            date: ensureDateString(new Date(tx.date || today)),
            description: tx.reference || tx.description || "Bank Transaction",
            amount: Math.round((Number(tx.total) || 0) * 100) / 100,
            type: (Number(tx.total) || 0) > 0 ? "credit" : "debit",
            contact: (_a2 = tx.contact) == null ? void 0 : _a2.name
          };
        })
      }
    });
    totalBalance += currentBalance;
    totalInflows += accountInflows;
    totalOutflows += accountOutflows;
  }
  const netCashFlow = totalInflows - totalOutflows;
  const cashVelocity = totalBalance > 0 ? (totalInflows + totalOutflows) / totalBalance : 0;
  const lowBalanceAccounts = accountSummaries.filter((acc) => acc.currentBalance < 1e3);
  const overdraftAccounts = accountSummaries.filter((acc) => acc.currentBalance < 0);
  const volatileAccounts = accountSummaries.filter((acc) => Math.abs(acc.balanceChangePercent) > 25);
  let overallRiskLevel = "low";
  if (overdraftAccounts.length > 0 || totalBalance < 5e3) {
    overallRiskLevel = "high";
  } else if (lowBalanceAccounts.length > 0 || netCashFlow < -5e3) {
    overallRiskLevel = "medium";
  }
  const insights = [];
  if (netCashFlow < 0) {
    insights.push(`Net cash outflow of $${Math.abs(netCashFlow).toFixed(2)} over ${daysBack} days`);
  }
  if (totalBalance < 1e4) {
    insights.push("Total cash reserves are below recommended levels");
  }
  if (volatileAccounts.length > 0) {
    insights.push(`${volatileAccounts.length} account(s) showing high volatility`);
  }
  if (accountSummaries.length === 1) {
    insights.push("Consider diversifying across multiple bank accounts for better cash management");
  }
  return {
    asOfDate: ensureDateString(today),
    period: {
      from: ensureDateString(startDate),
      to: ensureDateString(today),
      days: daysBack
    },
    // Portfolio overview
    portfolio: {
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalInflows: Math.round(totalInflows * 100) / 100,
      totalOutflows: Math.round(totalOutflows * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      cashVelocity: Math.round(cashVelocity * 100) / 100,
      accountCount: accountSummaries.length,
      riskLevel: overallRiskLevel
    },
    // Individual account details
    accounts: accountSummaries,
    // Risk indicators
    risks: {
      lowBalanceCount: lowBalanceAccounts.length,
      overdraftCount: overdraftAccounts.length,
      volatileCount: volatileAccounts.length,
      concentrationRisk: accountSummaries.length === 1
    },
    // Alerts requiring attention
    alerts: accountSummaries.flatMap(
      (acc) => acc.alerts.map((alert) => ({
        accountName: acc.accountName,
        ...alert
      }))
    ),
    // AI-generated insights
    insights,
    // Recommendations
    recommendations: [
      ...totalBalance < 1e4 ? ["Consider building larger cash reserves"] : [],
      ...overdraftAccounts.length > 0 ? ["Address overdrawn accounts immediately"] : [],
      ...netCashFlow < -1e3 ? ["Review and reduce cash outflows"] : [],
      ...accountSummaries.length === 1 ? ["Consider opening additional bank accounts for diversification"] : [],
      ...volatileAccounts.length > 0 ? ["Monitor volatile accounts for unusual activity"] : []
    ]
  };
});

export { bankMonitoring_get as default };
//# sourceMappingURL=bank-monitoring.get.mjs.map
