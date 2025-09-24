import { e as eventHandler, q as getTokenForSession, c as createError, d as createXeroClient, t as toStoredTokenSet, n as setTokenForSession } from '../../../nitro/nitro.mjs';
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

const refresh_post = eventHandler(async (event) => {
  const current = await getTokenForSession(event);
  if (!(current == null ? void 0 : current.refresh_token)) {
    throw createError({ statusCode: 401, statusMessage: "No refresh token available" });
  }
  const client = await createXeroClient({ tokenSet: current, event });
  await client.refreshToken();
  const latest = client.readTokenSet();
  const next = toStoredTokenSet({
    ...latest,
    refresh_token: latest.refresh_token || current.refresh_token
  });
  await setTokenForSession(event, next);
  return { ok: true, expires_at: next.expires_at };
});

export { refresh_post as default };
//# sourceMappingURL=refresh.post.mjs.map
