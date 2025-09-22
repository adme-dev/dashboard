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

function toParts(d) {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
function dtExpr(d) {
  const { y, m, day } = toParts(d);
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `DateTime(${y},${mm},${dd})`;
}
function toAmount(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
async function fetchAllInvoices(client, tenantId, whereExpr) {
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
    if (page > 50) break;
  }
  return results;
}
async function fetchAllBankTransactions(client, tenantId, whereExpr) {
  const results = [];
  let page = 1;
  for (; ; ) {
    const { body } = await client.accountingApi.getBankTransactions(
      tenantId,
      void 0,
      whereExpr,
      "Date DESC",
      page,
      void 0,
      100
    );
    const list = (body == null ? void 0 : body.bankTransactions) || [];
    if (!list.length) break;
    results.push(...list);
    if (list.length < 100) break;
    page += 1;
    if (page > 50) break;
  }
  return results;
}
const expenses_get = eventHandler(async (event) => {
  var _a, _b;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  const q = getQuery(event);
  const toInput = typeof q.to === "string" ? q.to : typeof q.toDate === "string" ? q.toDate : typeof q["range[to]"] === "string" ? q["range[to]"] : void 0;
  const fromInput = typeof q.from === "string" ? q.from : typeof q.fromDate === "string" ? q.fromDate : typeof q["range[from]"] === "string" ? q["range[from]"] : void 0;
  const toCandidate = toInput ? new Date(toInput) : null;
  const fromCandidate = fromInput ? new Date(fromInput) : null;
  const hasValidTo = !!(toCandidate && !Number.isNaN(toCandidate.valueOf()));
  const hasValidFrom = !!(fromCandidate && !Number.isNaN(fromCandidate.valueOf()));
  const today = hasValidTo ? toCandidate : /* @__PURE__ */ new Date();
  const from = hasValidFrom ? fromCandidate : new Date(today);
  if (!hasValidFrom) {
    const days = Number(q.days || 90);
    from.setDate(today.getDate() - (Number.isFinite(days) ? days : 90));
  }
  if (from > today) {
    const temp = new Date(from);
    from.setTime(today.getTime());
    today.setTime(temp.getTime());
  }
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
  let all = [];
  let lastError = null;
  try {
    const whereAuth = `Type=="ACCPAY"&&Status=="AUTHORISED"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`;
    const wherePaid = `Type=="ACCPAY"&&Status=="PAID"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`;
    const [authList, paidList] = await Promise.all([
      fetchAllInvoices(client, tenantId, whereAuth),
      fetchAllInvoices(client, tenantId, wherePaid)
    ]);
    all = [].concat(authList, paidList);
  } catch (err) {
    lastError = err;
  }
  if (!all.length) {
    const whereAny = `Type=="ACCPAY"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`;
    try {
      all = await fetchAllInvoices(client, tenantId, whereAny);
    } catch (err) {
      lastError = err;
    }
  }
  let bankTx = [];
  if (!all.length) {
    const whereSpend = `Type=="SPEND"&&Date>=${dtExpr(from)}&&Date<=${dtExpr(today)}`;
    try {
      bankTx = await fetchAllBankTransactions(client, tenantId, whereSpend);
    } catch (err) {
      lastError = err;
    }
  }
  const byCategory = /* @__PURE__ */ new Map();
  const byVendor = /* @__PURE__ */ new Map();
  for (const inv of all) {
    const vendor = ((_a = inv == null ? void 0 : inv.contact) == null ? void 0 : _a.name) || "Unknown";
    const total = toAmount(inv == null ? void 0 : inv.total);
    byVendor.set(vendor, (byVendor.get(vendor) || 0) + total);
    const lines = (inv == null ? void 0 : inv.lineItems) || [];
    if (lines.length) {
      for (const li of lines) {
        const accountKey = (li == null ? void 0 : li.accountCode) || (li == null ? void 0 : li.accountID);
        const categoryName = accountKey && accountsMap.has(accountKey) ? accountsMap.get(accountKey) : accountKey || "Uncategorized";
        const amount = toAmount(li == null ? void 0 : li.lineAmount);
        byCategory.set(categoryName, (byCategory.get(categoryName) || 0) + amount);
      }
    } else {
      byCategory.set("Uncategorized", (byCategory.get("Uncategorized") || 0) + total);
    }
  }
  if (!byVendor.size && bankTx.length) {
    for (const tx of bankTx) {
      const vendor = ((_b = tx == null ? void 0 : tx.contact) == null ? void 0 : _b.name) || "Unknown";
      const total = toAmount(tx == null ? void 0 : tx.total);
      byVendor.set(vendor, (byVendor.get(vendor) || 0) + total);
      const lines = (tx == null ? void 0 : tx.lineItems) || [];
      if (lines.length) {
        for (const li of lines) {
          const accountKey = (li == null ? void 0 : li.accountCode) || (li == null ? void 0 : li.accountID);
          const categoryName = accountKey && accountsMap.has(accountKey) ? accountsMap.get(accountKey) : accountKey || "Uncategorized";
          const amount = toAmount(li == null ? void 0 : li.lineAmount);
          byCategory.set(categoryName, (byCategory.get(categoryName) || 0) + amount);
        }
      } else {
        byCategory.set("Uncategorized", (byCategory.get("Uncategorized") || 0) + total);
      }
    }
  }
  if (!all.length && !bankTx.length && lastError) {
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch expenses from Xero"
    });
  }
  const categories = Array.from(byCategory.entries()).map(([name, amount]) => ({ name, amount }));
  const vendors = Array.from(byVendor.entries()).map(([name, amount]) => ({ name, amount }));
  categories.sort((a, b) => b.amount - a.amount);
  vendors.sort((a, b) => b.amount - a.amount);
  const toStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
  const fromStr = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}-${String(from.getUTCDate()).padStart(2, "0")}`;
  return { range: { from: fromStr, to: toStr }, categories, vendors };
});

export { expenses_get as default };
//# sourceMappingURL=expenses.get.mjs.map
