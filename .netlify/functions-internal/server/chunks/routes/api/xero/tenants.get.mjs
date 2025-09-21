import { e as eventHandler, l as getTokenForSession, c as createError, $ as $fetch } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const tenants_get = eventHandler(async (event) => {
  const token = await getTokenForSession(event);
  if (!(token == null ? void 0 : token.access_token)) {
    throw createError({ statusCode: 401, statusMessage: "Not connected" });
  }
  const tenants = await $fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${token.access_token}`
    }
  });
  return tenants;
});

export { tenants_get as default };
//# sourceMappingURL=tenants.get.mjs.map
