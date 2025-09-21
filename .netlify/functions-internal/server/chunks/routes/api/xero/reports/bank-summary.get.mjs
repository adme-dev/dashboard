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
const bankSummary_get = eventHandler(async (event) => {
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
  const date = String(query.date || ensureDateString(/* @__PURE__ */ new Date()));
  const url = new URL("https://api.xero.com/api.xro/2.0/Reports/BankSummary");
  url.searchParams.set("date", date);
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
  let totalBalance = 0;
  for (const row of rows) {
    const title = ((_d = (_c = row == null ? void 0 : row.Cells) == null ? void 0 : _c[0]) == null ? void 0 : _d.Value) || (row == null ? void 0 : row.Title) || "";
    const valueStr = (_g = (_f = row == null ? void 0 : row.Cells) == null ? void 0 : _f[((_e = row.Cells) == null ? void 0 : _e.length) - 1]) == null ? void 0 : _g.Value;
    const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
    if (/total/i.test(title)) {
      totalBalance = numeric;
    }
  }
  if (!totalBalance) {
    totalBalance = rows.reduce((acc, row) => {
      var _a2, _b2, _c2;
      const valueStr = (_c2 = (_b2 = row == null ? void 0 : row.Cells) == null ? void 0 : _b2[((_a2 = row.Cells) == null ? void 0 : _a2.length) - 1]) == null ? void 0 : _c2.Value;
      const numeric = typeof valueStr === "string" ? Number(valueStr) : typeof valueStr === "number" ? valueStr : 0;
      return acc + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
  }
  return { date, totalBalance };
});

export { bankSummary_get as default };
//# sourceMappingURL=bank-summary.get.mjs.map
