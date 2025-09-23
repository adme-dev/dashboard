import { e as eventHandler, d as createXeroClient, p as setCookie, o as sendRedirect } from '../../../nitro/nitro.mjs';
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

const login_get = eventHandler(async (event) => {
  const state = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const client = await createXeroClient({ state });
  const authorizeUrl = await client.buildConsentUrl();
  setCookie(event, "xero_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 10
    // 10 minutes
  });
  return sendRedirect(event, authorizeUrl, 302);
});

export { login_get as default };
//# sourceMappingURL=login.get.mjs.map
