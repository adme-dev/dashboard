import { e as eventHandler, u as useRuntimeConfig, c as createError, m as setCookie, k as sendRedirect } from '../../../nitro/nitro.mjs';
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
  const config = useRuntimeConfig();
  const clientId = config.xeroClientId;
  const redirectUri = config.xeroRedirectUri;
  if (!clientId || !redirectUri) {
    throw createError({ statusCode: 500, statusMessage: "Xero OAuth not configured" });
  }
  const state = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  setCookie(event, "xero_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 10
    // 10 minutes
  });
  const scope = [
    "offline_access",
    "accounting.reports.read",
    "accounting.settings.read",
    "accounting.transactions.read",
    "accounting.contacts.read"
  ].join(" ");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state
  });
  const authorizeUrl = `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  return sendRedirect(event, authorizeUrl, 302);
});

export { login_get as default };
//# sourceMappingURL=login.get.mjs.map
