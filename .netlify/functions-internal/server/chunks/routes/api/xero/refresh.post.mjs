import { e as eventHandler, u as useRuntimeConfig, c as createError, l as getTokenForSession, $ as $fetch, j as setTokenForSession } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const refresh_post = eventHandler(async (event) => {
  var _a, _b;
  const config = useRuntimeConfig();
  const clientId = config.xeroClientId;
  const clientSecret = config.xeroClientSecret;
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 500, statusMessage: "Xero OAuth not configured" });
  }
  const current = await getTokenForSession(event);
  if (!(current == null ? void 0 : current.refresh_token)) {
    throw createError({ statusCode: 401, statusMessage: "No refresh token available" });
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
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
  const next = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || current.refresh_token,
    expires_at: expiresAt,
    scope: (_a = tokenResponse.scope) != null ? _a : current.scope,
    token_type: (_b = tokenResponse.token_type) != null ? _b : current.token_type
  };
  await setTokenForSession(event, next);
  return { ok: true, expires_at: next.expires_at };
});

export { refresh_post as default };
//# sourceMappingURL=refresh.post.mjs.map
