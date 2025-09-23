import { e as eventHandler, b as getQuery, k as getCookie, c as createError, l as deleteCookie, d as createXeroClient, m as getRequestURL, n as setTokenForSession, t as toStoredTokenSet, o as sendRedirect } from '../../../nitro/nitro.mjs';
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

const callback_get = eventHandler(async (event) => {
  const query = getQuery(event);
  const code = String(query.code || "");
  const state = String(query.state || "");
  const expectedState = getCookie(event, "xero_oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, statusMessage: "Invalid OAuth state or code" });
  }
  deleteCookie(event, "xero_oauth_state", { path: "/" });
  const client = await createXeroClient({ state: expectedState });
  const requestUrl = getRequestURL(event).href;
  await client.apiCallback(requestUrl);
  const tokenSet = client.readTokenSet();
  await setTokenForSession(event, toStoredTokenSet(tokenSet));
  return sendRedirect(event, "/settings", 302);
});

export { callback_get as default };
//# sourceMappingURL=callback.get.mjs.map
