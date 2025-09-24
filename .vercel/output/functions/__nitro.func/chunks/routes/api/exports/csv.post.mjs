import { e as eventHandler, r as readBody, c as createError, s as setHeader } from '../../../nitro/nitro.mjs';
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

const csv_post = eventHandler(async (event) => {
  const body = await readBody(event);
  if (!(body == null ? void 0 : body.columns) || !(body == null ? void 0 : body.rows)) {
    throw createError({ statusCode: 400, statusMessage: "columns and rows required" });
  }
  const header = body.columns.map((c) => JSON.stringify(c.label || c.key)).join(",");
  const lines = [header];
  for (const row of body.rows) {
    const line = body.columns.map((c) => {
      var _a;
      return JSON.stringify((_a = row[c.key]) != null ? _a : "");
    }).join(",");
    lines.push(line);
  }
  const csv = lines.join("\n");
  setHeader(event, "Content-Type", "text/csv");
  setHeader(event, "Content-Disposition", 'attachment; filename="export.csv"');
  return csv;
});

export { csv_post as default };
//# sourceMappingURL=csv.post.mjs.map
