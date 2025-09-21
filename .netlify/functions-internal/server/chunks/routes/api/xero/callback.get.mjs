import { e as eventHandler, u as useRuntimeConfig, d as getQuery, f as getCookie, c as createError, h as deleteCookie, $ as $fetch, j as setTokenForSession, k as sendRedirect } from '../../../nitro/nitro.mjs';
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
  const config = useRuntimeConfig();
  const clientId = config.xeroClientId;
  const clientSecret = config.xeroClientSecret;
  const redirectUri = config.xeroRedirectUri;
  const query = getQuery(event);
  const code = String(query.code || "");
  const state = String(query.state || "");
  const expectedState = getCookie(event, "xero_oauth_state");
  if (!clientId || !clientSecret || !redirectUri) {
    throw createError({ statusCode: 500, statusMessage: "Xero OAuth not configured" });
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, statusMessage: "Invalid OAuth state or code" });
  }
  deleteCookie(event, "xero_oauth_state", { path: "/" });
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret
  });
  const tokenResponse = await $fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  const expiresAt = Date.now() + (tokenResponse.expires_in || 0) * 1e3;
  const tokenSet = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: expiresAt,
    scope: tokenResponse.scope,
    token_type: tokenResponse.token_type
  };
  await setTokenForSession(event, tokenSet);
  return sendRedirect(event, "/settings", 302);
});

export { callback_get as default };
//# sourceMappingURL=callback.get.mjs.map
