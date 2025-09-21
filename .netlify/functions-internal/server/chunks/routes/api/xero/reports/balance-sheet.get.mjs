import { e as eventHandler, l as getTokenForSession, c as createError, g as getSelectedTenant, d as getQuery, $ as $fetch } from '../../../../nitro/nitro.mjs';
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
  var _a, _b, _c, _d, _e, _f, _g;
  const token = await getTokenForSession(event);
  if (!(token == null ? void 0 : token.access_token)) {
    throw createError({ statusCode: 401, statusMessage: "Not connected" });
  }
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const toDate = String(query.toDate || getDefaultToDate());
  const url = new URL("https://api.xero.com/api.xro/2.0/Reports/BalanceSheet");
  url.searchParams.set("date", toDate);
  url.searchParams.set("summarizeBy", "Total");
  const report = await $fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "xero-tenant-id": tenantId
    }
  });
  function flattenRows(rows2, out = []) {
    if (!rows2) return out;
    for (const row of rows2) {
      out.push(row);
      if (row.Rows) flattenRows(row.Rows, out);
    }
    return out;
  }
  const rows = flattenRows((_b = (_a = report == null ? void 0 : report.Reports) == null ? void 0 : _a[0]) == null ? void 0 : _b.Rows);
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  for (const row of rows) {
    const title = ((_d = (_c = row == null ? void 0 : row.Cells) == null ? void 0 : _c[0]) == null ? void 0 : _d.Value) || (row == null ? void 0 : row.Title) || "";
    const valueStr = (_g = (_f = row == null ? void 0 : row.Cells) == null ? void 0 : _f[((_e = row.Cells) == null ? void 0 : _e.length) - 1]) == null ? void 0 : _g.Value;
    const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
    if (/total\s+assets/i.test(title)) totalAssets = numeric;
    if (/total\s+liabilit/i.test(title)) totalLiabilities = numeric;
    if (/total\s+equity/i.test(title) || /net\s+assets/i.test(title)) totalEquity = numeric;
  }
  return {
    date: toDate,
    totalAssets,
    totalLiabilities,
    totalEquity
  };
});

export { balanceSheet_get as default };
//# sourceMappingURL=balance-sheet.get.mjs.map
