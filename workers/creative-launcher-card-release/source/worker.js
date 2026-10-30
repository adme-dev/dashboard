var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// compressed.json
var compressed_default = {
  "/effectflow/0.17.0/effectcraft_web_bg.wasm": "/effectflow/0.17.0/effectcraft_web_bg.wasm.br",
  "/filmflow/0.13.0/filmcraft_web_bg.wasm": "/filmflow/0.13.0/filmcraft_web_bg.wasm.br",
  "/vectorflow/0.17.0/vectorcraft-web-98b60c6dd6d6b89f_bg.wasm": "/vectorflow/0.17.0/vectorcraft-web-98b60c6dd6d6b89f_bg.wasm.br",
  "/effectflow/0.17.0-flow1/effectcraft_web_bg.wasm": "/effectflow/0.17.0-flow1/effectcraft_web_bg.wasm.br",
  "/filmflow/0.13.0-flow1/filmcraft_web_bg.wasm": "/filmflow/0.13.0-flow1/filmcraft_web_bg.wasm.br",
  "/vectorflow/0.17.0-flow1/vectorcraft-web-73a7914b54d453e1_bg.wasm": "/vectorflow/0.17.0-flow1/vectorcraft-web-73a7914b54d453e1_bg.wasm.br"
};

// app-routes.json
var app_routes_default = {
  "/effectflow": "/effectflow/0.17.0-flow1/",
  "/effectflow/": "/effectflow/0.17.0-flow1/",
  "/filmflow": "/filmflow/0.13.0-flow1/",
  "/filmflow/": "/filmflow/0.13.0-flow1/",
  "/photoflow": "/photoflow/0.16.0-flow1/",
  "/photoflow/": "/photoflow/0.16.0-flow1/",
  "/vectorflow": "/vectorflow/0.17.0-flow1/",
  "/vectorflow/": "/vectorflow/0.17.0-flow1/",
  "/soundflow": "/soundflow/0.13.1-flow1/",
  "/soundflow/": "/soundflow/0.13.1-flow1/",
  "/figflow": "/figflow/0.11.2-flow1/",
  "/figflow/": "/figflow/0.11.2-flow1/"
};

// auth.mjs
var APP_ORIGIN = "https://app.xeroflow.io";
var CREATIVE_ORIGINS = Object.freeze([
  "https://creative.xeroflow.io",
  "https://xeroflow-creative-tools.adme-dev.workers.dev",
  "https://xeroflow-craft-editors.adme-dev.workers.dev"
]);
var CREATIVE_ALLOWED_EMAILS = Object.freeze([
  "paul@adme.net.au",
  "robert@adme.net.au",
  "tina@adme.net.au",
  "kristi@adme.net.au"
]);
var SESSION = "__Host-xf_creative_session";
var STATE = "__Host-xf_creative_state";
var STATE_LIFETIME = 600;
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var NO_STORE = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
function reply(status, body = null, extra = {}) {
  return new Response(body, { status, headers: { ...NO_STORE, ...extra } });
}
__name(reply, "reply");
function cookieValue(request, name) {
  const found = (request.headers.get("Cookie") || "").split(";").map((x) => x.trim()).filter((x) => x.startsWith(name + "="));
  if (found.length !== 1) return null;
  try {
    return decodeURIComponent(found[0].slice(name.length + 1));
  } catch {
    return null;
  }
}
__name(cookieValue, "cookieValue");
function mainSessionToken(request) {
  const cookies = (request.headers.get("Cookie") || "").split(";").map((value) => value.trim());
  for (const name of ["auth_token", "auth_token_client"]) {
    const matches = cookies.filter((value) => value.startsWith(name + "="));
    if (matches.length > 1) return null;
    if (matches.length === 1) {
      const value = cookieValue(request, name);
      if (value === null) return null;
      if (value) return value;
    }
  }
  return null;
}
__name(mainSessionToken, "mainSessionToken");
function cookie(name, value, age) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
__name(cookie, "cookie");
function redirect(location, cookies = []) {
  const headers = new Headers({ ...NO_STORE, Location: location });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers });
}
__name(redirect, "redirect");
function b64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
__name(b64, "b64");
function unb64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoding");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
__name(unb64, "unb64");
async function keyFor(env) {
  const raw = unb64(env?.CREATIVE_AUTH_KEY);
  if (raw.length !== 32) throw new Error("Auth key unavailable");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
__name(keyFor, "keyFor");
async function seal(key, purpose, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode("xf-creative/v1/" + purpose) }, key, encoder.encode(JSON.stringify(data))));
  const bytes = new Uint8Array(iv.length + encrypted.length);
  bytes.set(iv);
  bytes.set(encrypted, iv.length);
  return b64(bytes);
}
__name(seal, "seal");
async function open(key, purpose, value) {
  if (!value || value.length > 8192) throw new Error("Invalid envelope");
  const bytes = unb64(value);
  if (bytes.length < 29) throw new Error("Invalid envelope");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode("xf-creative/v1/" + purpose) }, key, bytes.slice(12));
  return JSON.parse(decoder.decode(clear));
}
__name(open, "open");
function alive(data, now, lifetime) {
  return Number.isInteger(data?.iat) && Number.isInteger(data?.exp) && data.iat <= now + 5 && data.exp > now && data.exp - data.iat === lifetime;
}
__name(alive, "alive");
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = encoder.encode(a), y = encoder.encode(b);
  let mismatch = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) mismatch |= (x[i] || 0) ^ (y[i] || 0);
  return mismatch === 0;
}
__name(equal, "equal");
function safeReturn(value, origin) {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname !== "/" && !/^\/(?:photo|vector|effect|film|sound|fig)(?:flow|craft)(?:\/|$)/.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
__name(safeReturn, "safeReturn");
async function boundedJSON(response2) {
  if (!response2.body || Number(response2.headers.get("Content-Length")) > 65536) throw new Error("Invalid authority response");
  const reader = response2.body.getReader();
  let count = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > 65536) throw new Error("Invalid authority response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(decoder.decode(bytes));
}
__name(boundedJSON, "boundedJSON");
function createAuth({ fetcher = /* @__PURE__ */ __name((...args) => fetch(...args), "fetcher"), now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now") } = {}) {
  async function authority(token) {
    if (typeof token !== "string" || !token || token.length > 4096 || /[\r\n]/.test(token)) return { ok: false, status: 401 };
    try {
      const response2 = await fetcher(APP_ORIGIN + "/api/auth/me", {
        method: "GET",
        headers: { Authorization: "Bearer " + token, Accept: "application/json", "Cache-Control": "no-cache" },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(8e3)
      });
      if (response2.status === 401) return { ok: false, status: 401 };
      if (response2.status === 403) return { ok: false, status: 403 };
      if (response2.status !== 200) return { ok: false, status: 503 };
      const data = await boundedJSON(response2);
      if (data?.success !== true || typeof data.user?.id !== "string" || !data.user.id || typeof data.user?.email !== "string") return { ok: false, status: 503 };
      if (data.user.is_active !== true || !CREATIVE_ALLOWED_EMAILS.includes(data.user.email.trim().toLowerCase())) return { ok: false, status: 403 };
      return { ok: true, status: 204 };
    } catch {
      return { ok: false, status: 503 };
    }
  }
  __name(authority, "authority");
  async function authorize2(request, env) {
    const url = new URL(request.url);
    if (!CREATIVE_ORIGINS.includes(url.origin)) return { ok: false, status: 403 };
    try {
      await keyFor(env);
    } catch {
      return { ok: false, status: 503 };
    }
    return authority(cookieValue(request, SESSION));
  }
  __name(authorize2, "authorize");
  function loginPage(url, status) {
    const resume = new URL(url);
    resume.searchParams.delete("check");
    const check = new URL(resume);
    check.searchParams.set("check", "1");
    const esc = /* @__PURE__ */ __name((value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"), "esc");
    const nonce = b64(crypto.getRandomValues(new Uint8Array(18)));
    const denied = status === 403;
    const message = denied ? "This XeroFlow account does not have access to Creative Suite." : status === 503 ? "XeroFlow could not verify your session. Please try again shortly." : "Sign in with your existing XeroFlow account to open Creative Suite.";
    const embedded = status === 401;
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in \xB7 XeroFlow Creative</title><style>html{color-scheme:dark;font:15px/1.6 system-ui;background:#0a0b0e;color:white}body{margin:0}main{max-width:${embedded ? "1000" : "520"}px;margin:${embedded ? "24px" : "12vh"} auto;padding:20px}header{display:flex;align-items:center;gap:12px}.mark{display:inline-grid;place-items:center;width:36px;height:36px;background:white;color:#121317;border-radius:8px;font-weight:700}header strong{font-size:18px;font-weight:500}h1{font-size:clamp(25px,4vw,38px);line-height:1.2;font-weight:500;letter-spacing:-.03em;margin:28px 0 12px}p,small{color:#a1a1aa}a{color:white}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:16px}.action{display:inline-block;background:white;color:#121317;padding:9px 18px;border-radius:24px;text-decoration:none}.continue{padding:10px 0}iframe{display:block;width:100%;height:min(720px,75vh);min-height:570px;border:1px solid #27272a;border-radius:16px;background:#0a0b0e;margin:18px 0}small{display:block;margin-top:12px}@media(max-width:600px){main{padding:14px;margin:10px auto}iframe{min-height:650px;height:80vh}}</style><main><header><span class="mark">XF</span><strong>XeroFlow Creative Suite</strong></header><h1>Design your world with XeroFlow</h1><p>${message}</p>${embedded ? '<iframe src="/auth/login/" title="Sign in to XeroFlow" referrerpolicy="no-referrer"></iframe>' : ""}<div class="actions"><a class="action" href="${APP_ORIGIN}/auth/login/" target="_blank" rel="noopener noreferrer">${embedded ? "Open sign-in in a new tab" : "Sign in to XeroFlow"}</a><a class="continue" href="${esc(resume.href)}">Continue</a></div><small>${embedded ? "Use your usual XeroFlow sign-in above. If it does not load, open sign-in in a new tab." : "After signing in, return here."} Access will continue automatically.</small><p role="status" id="status"></p></main><script nonce="${nonce}">const target=${JSON.stringify(check.href)},resume=${JSON.stringify(resume.href)};let busy=false;async function verify(){if(busy)return;busy=true;try{const r=await fetch(target,{credentials:'same-origin',cache:'no-store',redirect:'error'});if(r.status===204)location.replace(resume)}catch{}finally{busy=false}}const timer=setInterval(verify,2500);window.addEventListener('focus',verify);setTimeout(()=>{clearInterval(timer);document.getElementById('status').textContent='If this sign-in has expired, return to Creative Suite and start again.'},600000);<\/script></html>`;
    return reply(denied ? 403 : status === 503 ? 503 : 200, html, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` });
  }
  __name(loginPage, "loginPage");
  async function handleAuthRoute2(request, env) {
    const url = new URL(request.url);
    if (url.origin === APP_ORIGIN) {
      if (url.pathname !== "/creative-launch" && url.pathname !== "/creative-launch/") return reply(404, "Not found");
      if (request.method !== "GET") return reply(405, "Method not allowed", { Allow: "GET" });
      const origin = url.searchParams.get("origin"), state = url.searchParams.get("state");
      if (!CREATIVE_ORIGINS.includes(origin) || !/^[A-Za-z0-9_-]{43}$/.test(state || "")) return reply(400, "Invalid sign-in request");
      let key2;
      try {
        key2 = await keyFor(env);
      } catch {
        return reply(503, "Sign-in temporarily unavailable");
      }
      const token = mainSessionToken(request);
      const result = await authority(token);
      if (url.searchParams.get("check") === "1") return reply(result.status);
      if (!result.ok) return loginPage(url, result.status);
      const timestamp = now();
      const ticket = await seal(key2, "ticket", { token, state, origin, iat: timestamp, exp: timestamp + 120 });
      const callback = new URL("/__auth/callback", origin);
      callback.searchParams.set("ticket", ticket);
      return redirect(callback.href);
    }
    if (!CREATIVE_ORIGINS.includes(url.origin)) return reply(403, "Host not allowed");
    if (!url.pathname.startsWith("/__auth/")) return null;
    if (url.pathname === "/__auth/logout") {
      if (request.method !== "POST") return reply(405, "Method not allowed", { Allow: "POST" });
      if (request.headers.get("Origin") !== url.origin) return reply(403, "Request origin not allowed");
      const headers = new Headers(NO_STORE);
      headers.append("Set-Cookie", cookie(SESSION, "", 0));
      headers.append("Set-Cookie", cookie(STATE, "", 0));
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET") return reply(405, "Method not allowed", { Allow: "GET" });
    if (url.pathname === "/__auth/session") {
      const result = await authorize2(request, env);
      return reply(result.status);
    }
    let key;
    try {
      key = await keyFor(env);
    } catch {
      return reply(503, "Sign-in temporarily unavailable");
    }
    if (url.pathname === "/__auth/start") {
      const state = b64(crypto.getRandomValues(new Uint8Array(32))), timestamp = now();
      const encoded = await seal(key, "state", { origin: url.origin, state, returnPath: safeReturn(url.searchParams.get("return") || "/", url.origin), iat: timestamp, exp: timestamp + STATE_LIFETIME });
      const launch = new URL("/creative-launch", APP_ORIGIN);
      launch.searchParams.set("origin", url.origin);
      launch.searchParams.set("state", state);
      return redirect(launch.href, [cookie(STATE, encoded, STATE_LIFETIME)]);
    }
    if (url.pathname === "/__auth/callback") {
      try {
        const stored = await open(key, "state", cookieValue(request, STATE));
        const ticket = await open(key, "ticket", url.searchParams.get("ticket"));
        if (!alive(stored, now(), STATE_LIFETIME) || !alive(ticket, now(), 120) || stored.origin !== url.origin || ticket.origin !== url.origin || !equal(stored.state, ticket.state)) throw new Error("Invalid handoff");
        const result = await authority(ticket.token);
        if (!result.ok) return reply(result.status, "XeroFlow could not authorize this account");
        return redirect(new URL(safeReturn(stored.returnPath, url.origin), url.origin).href, [cookie(SESSION, ticket.token, 8 * 60 * 60), cookie(STATE, "", 0)]);
      } catch {
        return reply(401, "Sign-in expired. Open Creative Suite and sign in again.", { "Set-Cookie": cookie(STATE, "", 0) });
      }
    }
    return reply(404, "Not found");
  }
  __name(handleAuthRoute2, "handleAuthRoute");
  return { authorize: authorize2, handleAuthRoute: handleAuthRoute2 };
}
__name(createAuth, "createAuth");
var production = createAuth();
var authorize = production.authorize;
var handleAuthRoute = production.handleAuthRoute;

// motorstack.mjs
var ORIGIN = "https://oem-variants.pages.dev";
var R2_HOST = "pub-150d4c02365b4ffe9e158d72b3b048a1.r2.dev";
var PREFIX = "/__assets/motorstack/";
var UA = "Mozilla/5.0 XeroFlow-Creative/1.0";
var JSON_LIMIT = 4 * 1024 * 1024;
var FILE_LIMIT = 32 * 1024 * 1024;
var IMPORT_MIME = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
var normalizeModel = /* @__PURE__ */ __name((value) => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""), "normalizeModel");
var KINDS = /* @__PURE__ */ new Set(["all", "slides", "media", "brand"]);
var MIME = Object.freeze({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" });
var AdapterError = class extends Error {
  static {
    __name(this, "AdapterError");
  }
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};
function response(status, data, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
__name(response, "response");
function text(value, max = 180) {
  return typeof value === "string" ? value.replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, max) : "";
}
__name(text, "text");
function safeURL(value) {
  try {
    if (typeof value !== "string" || value.length > 2048) return null;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || ![new URL(ORIGIN).hostname, R2_HOST].includes(url.hostname)) return null;
    if (url.origin === ORIGIN && !/^\/(?:api\/(?:logos|fonts)\/|r2\/)/.test(url.pathname)) return null;
    for (const key of [...url.searchParams.keys()]) if (/key|token|auth|secret/i.test(key)) url.searchParams.delete(key);
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}
__name(safeURL, "safeURL");
async function boundedBody(res, limit) {
  if (!res.body || Number(res.headers.get("Content-Length")) > limit) throw new AdapterError(502, "provider_response_too_large");
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new AdapterError(502, "provider_response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
__name(boundedBody, "boundedBody");
function extension(url) {
  try {
    const value = decodeURIComponent(new URL(url).pathname).split("/").pop().split(".").pop().toLowerCase();
    return Object.hasOwn(MIME, value) ? value : null;
  } catch {
    return null;
  }
}
__name(extension, "extension");
async function idFor(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}
__name(idFor, "idFor");
function createMotorstack({ fetcher = /* @__PURE__ */ __name((...args) => fetch(...args), "fetcher") } = {}) {
  async function rpc(key, name, args) {
    if (!["list_oems", "get_webslides", "get_media_library", "get_brand_assets", "get_variants"].includes(name)) throw new AdapterError(400, "tool_not_supported");
    let res;
    try {
      res = await fetcher(ORIGIN + "/api/mcp", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15e3), headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
    } catch {
      throw new AdapterError(502, "motorstack_unavailable");
    }
    if (!res.ok) throw new AdapterError(res.status === 401 || res.status === 403 ? 503 : 502, "motorstack_unavailable");
    try {
      const envelope = JSON.parse(new TextDecoder().decode(await boundedBody(res, JSON_LIMIT)));
      if (envelope.error || envelope.result?.isError) throw new Error("RPC refused");
      const result = envelope.result;
      const data = result?.structuredContent ?? JSON.parse(result?.content?.find((x) => x.type === "text")?.text || "null");
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid response");
      return data;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(502, "invalid_motorstack_response");
    }
  }
  __name(rpc, "rpc");
  async function brands(key) {
    const data = await rpc(key, "list_oems", {});
    if (!Array.isArray(data.oems)) throw new AdapterError(502, "invalid_motorstack_response");
    return data.oems.filter((x) => /^[a-z0-9-]{1,40}$/.test(x?.oem || "") && typeof x.name === "string").map((x) => ({ id: x.oem, name: text(x.name) })).slice(0, 100);
  }
  __name(brands, "brands");
  async function catalog(key, brand, kind, model) {
    const allowed = await brands(key);
    const owner = allowed.find((x) => x.id === brand);
    if (!owner) throw new AdapterError(403, "brand_not_available");
    let category = "slides";
    let truncated = false;
    const counts = { slides: 0, media: 0, brand: 0 };
    const budgets = kind === "all" ? { slides: 150, media: 300, brand: 50 } : { slides: 500, media: 500, brand: 500 };
    const assets = [];
    const seen = /* @__PURE__ */ new Set();
    const colors = [];
    const fonts = [];
    const models = [];
    const warnings = [];
    async function add(value, label, source, declaredType = "") {
      const url = safeURL(value);
      if (!url || url.href.includes(key)) return;
      const ext = extension(url.href);
      if (!ext || seen.has(url.href)) return;
      if (counts[category] >= budgets[category]) {
        truncated = true;
        return;
      }
      counts[category]++;
      seen.add(url.href);
      const mime = MIME[ext];
      const type = declaredType || (mime.startsWith("image/") ? "image" : mime.startsWith("font/") ? "font" : "document");
      const id = await idFor(brand + "\n" + url.href);
      assets.push({ id, name: text(label || decodeURIComponent(url.pathname.split("/").pop())), type, mime, source, importable: IMPORT_MIME.has(mime), original: url.href });
    }
    __name(add, "add");
    if (kind === "all" || kind === "slides") {
      const data = await rpc(key, "get_webslides", { oem: brand });
      for (const [i, slide] of (Array.isArray(data.slides) ? data.slides : []).entries()) {
        const label = text(slide.heading || slide.model || "Webslide " + (i + 1));
        const fields = [["desktop_url", "desktop"], ["mobile_url", "mobile"], ["combined_desktop_url", "desktop combined"], ["combined_mobile_url", "mobile combined"], ["overlay_url", "overlay"]];
        const published = new Set(fields.map(([field]) => safeURL(slide[field])?.href).filter(Boolean));
        for (const [field, suffix] of fields) {
          let value = slide[field];
          let variant = suffix;
          const candidate = safeURL(value);
          if (candidate?.hostname === R2_HOST && candidate.pathname.startsWith("/img/" + brand + "/")) {
            const basePath = candidate.pathname.replace(/(\.(?:jpe?g|png|webp|avif))\/jcr:content\/renditions\/desktop\.(?:jpe?g|png|webp|avif)$/i, "$1");
            if (basePath !== candidate.pathname) {
              const base = new URL(candidate);
              base.pathname = basePath;
              if (published.has(base.href)) {
                value = base.href;
                variant = "original";
                const warning = "Some desktop renditions are unavailable; their separately supplied original images are shown.";
                if (!warnings.includes(warning)) warnings.push(warning);
              }
            }
          }
          await add(value, label + " \xB7 " + variant, "Motorstack webslides");
        }
      }
    }
    if (kind === "all" || kind === "media") {
      category = "media";
      const data = await rpc(key, "get_media_library", { oem: brand, ...model ? { model } : {} });
      const wanted = normalizeModel(model);
      const matches = /* @__PURE__ */ __name((value) => normalizeModel(value) === wanted, "matches");
      for (const item of Array.isArray(data.brochures) ? data.brochures : []) {
        if (model && !matches(item.model || item.model_name || item.modelName)) continue;
        await add(item.url, item.title || item.model, "Motorstack brochures", "document");
      }
      async function visit(node, label = model || owner.name, depth = 0, parentMatch = false) {
        if (!node || depth > 12) return;
        if (Array.isArray(node)) {
          if (node.length > 500) truncated = true;
          for (const item of node.slice(0, 500)) await visit(item, label, depth + 1, parentMatch);
          return;
        }
        if (typeof node !== "object") return;
        const explicitModel = node.model || node.model_name || node.modelName;
        const modelMatch = !model || (explicitModel ? matches(explicitModel) : parentMatch);
        if (model && explicitModel && !modelMatch) return;
        const own = text(node.title || node.model || node.colour || node.color || node.name || node.badge || "");
        const name = own && own !== label ? text(label + " \xB7 " + own) : own || label;
        if (typeof node.model === "string" && !models.includes(node.model)) models.push(text(node.model));
        for (const [field, value] of Object.entries(node)) {
          if (typeof value === "string" && /^(?:heroImage|hero_image|hero_url|main_photo_url|image|image_url|url|desktop_url|mobile_url)$/.test(field)) {
            const safe = safeURL(value);
            const ext = safe ? extension(safe.href) : null;
            if (modelMatch && ext && MIME[ext].startsWith("image/")) await add(value, name, "Motorstack media");
          } else if (Array.isArray(value) && /gallery|interior|photos|images/i.test(field)) {
            if (value.length > 100) truncated = true;
            for (const [i, item] of value.slice(0, 100).entries()) {
              if (typeof item === "string" && modelMatch) await add(item, name + " \xB7 " + field + " " + (i + 1), "Motorstack media");
              else await visit(item, name, depth + 1, modelMatch);
            }
          } else if (value && typeof value === "object" && field !== "brochures") await visit(value, name, depth + 1, modelMatch);
        }
      }
      __name(visit, "visit");
      await visit(data.models || data);
      if (model) {
        try {
          const variants = await rpc(key, "get_variants", { oem: brand, model, include_photos: false });
          await visit(variants.vehicles || [], model);
        } catch {
          warnings.push("Some model colour images are temporarily unavailable.");
        }
      }
    }
    if (kind === "all" || kind === "brand") {
      category = "brand";
      const data = await rpc(key, "get_brand_assets", { oem: brand });
      for (const logo of Array.isArray(data.logos) ? data.logos : []) await add(logo.url, owner.name + " \xB7 " + (logo.variant || logo.role || "logo"), "Motorstack brand assets");
      for (const [role, font] of Object.entries(data.fonts || {})) {
        if (!font || typeof font !== "object") continue;
        await add(font.url, text(font.family || owner.name) + " \xB7 " + role + (font.weight ? " " + Number(font.weight) : ""), "Motorstack brand fonts", "font");
        fonts.push({ role: text(role), family: text(font.family), weight: Number.isFinite(Number(font.weight)) ? Number(font.weight) : null });
      }
      for (const [name, value] of Object.entries(data.colours || {})) if (typeof value === "string" && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) colors.push({ name: text(name), value });
    }
    if (truncated) warnings.push("Some assets were omitted to keep this catalogue bounded. Choose a category to see more.");
    return { brand: owner, assets, colors, fonts, models: models.slice(0, 100), warnings, truncated };
  }
  __name(catalog, "catalog");
  function project(data, brand, kind, model) {
    return { ...data, assets: data.assets.map(({ original, ...asset }) => {
      const params = new URLSearchParams({ brand, kind, id: asset.id });
      if (model) params.set("model", model);
      const url = PREFIX + "file?" + params;
      return { ...asset, url, thumbnail: asset.type === "image" && asset.mime !== "image/svg+xml" ? url : null };
    }) };
  }
  __name(project, "project");
  async function binary(key, asset) {
    let url = safeURL(asset.original);
    for (let hop = 0; hop <= 3; hop++) {
      if (!url || url.href.includes(key)) throw new AdapterError(502, "asset_host_not_supported");
      let res;
      try {
        res = await fetcher(url.href, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(3e4), headers: { Accept: asset.mime, "User-Agent": UA, ...url.origin === ORIGIN ? { Authorization: "Bearer " + key } : {} } });
      } catch {
        throw new AdapterError(502, "asset_unavailable");
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("Location");
        if (!location || hop === 3) throw new AdapterError(502, "asset_redirect_refused");
        url = safeURL(new URL(location, url).href);
        continue;
      }
      if (res.status === 404 || res.status === 410) throw new AdapterError(404, "asset_not_found");
      if (!res.ok) throw new AdapterError(502, "asset_unavailable");
      const mime = (res.headers.get("Content-Type") || "").split(";")[0].toLowerCase().trim();
      if (!Object.values(MIME).includes(mime) || mime !== asset.mime) throw new AdapterError(502, "asset_type_refused");
      const bytes = await boundedBody(res, FILE_LIMIT);
      const ext = Object.keys(MIME).find((k) => MIME[k] === mime) || "bin";
      const base = asset.name.replace(/[^\p{L}\p{N} ._-]/gu, "-").trim().slice(0, 100) || "Motorstack asset";
      const existing = base.split(".").pop().toLowerCase();
      const name = base + (base.includes(".") && MIME[existing] === mime ? "" : "." + ext);
      return new Response(bytes, { headers: { "Content-Type": mime, "Content-Length": String(bytes.length), "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(name), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" } });
    }
    throw new AdapterError(502, "asset_redirect_refused");
  }
  __name(binary, "binary");
  async function handleMotorstack2(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return null;
    if (request.method !== "GET") return response(405, { error: "method_not_allowed" }, { Allow: "GET" });
    const key = env?.MOTORSTACK_API_KEY;
    if (typeof key !== "string" || !/^msk_[A-Za-z0-9_-]{20,150}$/.test(key)) return response(503, { error: "motorstack_not_configured" });
    try {
      if (url.searchParams.has("url") || url.searchParams.has("key") || url.searchParams.has("tool")) throw new AdapterError(400, "invalid_asset_query");
      if (url.pathname === PREFIX + "brands") return response(200, { brands: await brands(key) });
      if (![PREFIX + "catalog", PREFIX + "file"].includes(url.pathname)) return response(404, { error: "not_found" });
      const brand = url.searchParams.get("brand") || "";
      const kind = url.searchParams.get("kind") || "all";
      const model = url.searchParams.get("model") || "";
      if (!/^[a-z0-9-]{1,40}$/.test(brand) || !KINDS.has(kind) || model.length > 100 || /[\r\n\u0000]/.test(model)) throw new AdapterError(400, "invalid_asset_query");
      const id = url.searchParams.get("id") || "";
      if (url.pathname === PREFIX + "file" && !/^[a-f0-9]{64}$/.test(id)) throw new AdapterError(400, "invalid_asset_id");
      const data = await catalog(key, brand, kind, model);
      if (url.pathname === PREFIX + "catalog") return response(200, project(data, brand, kind, model));
      const asset = data.assets.find((x) => x.id === id);
      if (!asset) throw new AdapterError(404, "asset_not_found");
      return await binary(key, asset);
    } catch (error) {
      return response(error instanceof AdapterError ? error.status : 502, { error: error instanceof AdapterError ? error.code : "motorstack_unavailable" });
    }
  }
  __name(handleMotorstack2, "handleMotorstack");
  return { handleMotorstack: handleMotorstack2 };
}
__name(createMotorstack, "createMotorstack");
var handleMotorstack = createMotorstack().handleMotorstack;

// worker.mjs
var publicFiles = /* @__PURE__ */ new Set([
  "/",
  "/index.html",
  "/credits.html",
  "/social-preview.png",
  "/xeroflow-logo.svg",
  "/starfield.js",
  "/card-tilt.js",
  "/fonts/geist-latin-variable.woff2",
  "/manifest.webmanifest",
  "/xeroflow-icon-192.png",
  "/xeroflow-icon-512.png",
  "/xeroflow-maskable-512.png",
  "/apple-touch-icon.png",
  "/install-app.js",
  "/install-app.css",
  ...["photo", "vector", "effect", "film", "sound", "fig"].map((name) => "/images/" + name + "flow.png"),
  ...["photo", "vector", "effect", "film", "sound", "fig"].map((name) => "/" + name + "flow/manifest.webmanifest")
]);
function blocked(status, message, documentRequest, returnTo) {
  if (documentRequest) {
    const title = status === 503 ? "Reconnecting to XeroFlow" : "Create with XeroFlow";
    const next = "/__auth/start?return=" + encodeURIComponent(returnTo || "/");
    message = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html{color-scheme:dark;background:#0a0b0e;color:white;font:16px/1.6 system-ui}main{max-width:460px;margin:16vh auto;padding:32px}.brand{display:flex;align-items:center;gap:12px;font-size:20px}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:8px;background:white;color:#121317;font-size:14px;font-weight:700}h1{font-size:38px;font-weight:450;letter-spacing:-1.2px;line-height:1.15;margin:38px 0 20px}p{color:#a1a1aa}a{display:inline-block;margin-top:20px;padding:10px 20px;border-radius:99px;background:white;color:#121317;text-decoration:none}small{display:block;margin-top:30px;color:#71717a}</style><main><div class="brand"><span class="mark">XF</span>XeroFlow</div><h1>${title}</h1><p>${message}</p><a href="${next}">Continue with XeroFlow</a><small>Creative Suite \xB7 Your creative tools, in one flow.</small></main></html>`;
  }
  return new Response(message, { status, headers: {
    "Content-Type": documentRequest ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  } });
}
__name(blocked, "blocked");
var worker_default = {
  async fetch(request, env) {
    const authRoute = await handleAuthRoute(request, env);
    if (authRoute) return authRoute;
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    if (url.pathname.endsWith("/sw.js")) {
      const response3 = await env.ASSETS.fetch(request);
      const update = new Response(response3.body, response3);
      update.headers.set("Cache-Control", "no-store");
      return update;
    }
    if (publicFiles.has(url.pathname)) {
      if (url.hostname === "xeroflow-craft-editors.adme-dev.workers.dev" && url.pathname === "/") {
        return Response.redirect("https://creative.xeroflow.io/", 302);
      }
      return env.ASSETS.fetch(request);
    }
    const access = await authorize(request, env);
    if (!access.ok) {
      if ([401, 403].includes(access.status) && request.method === "GET" && (request.headers.get("Sec-Fetch-Dest") === "document" || request.headers.get("Accept")?.includes("text/html"))) {
        const login = new URL("/__auth/start", url.origin);
        login.searchParams.set("return", url.pathname + url.search);
        return new Response(null, { status: 303, headers: { Location: login.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
      }
      return blocked(access.status, access.status === 503 ? "XeroFlow could not verify access. Please try again shortly." : "Sign in with an authorised XeroFlow account to use the creative editors.", request.headers.get("Sec-Fetch-Dest") === "document" || request.headers.get("Accept")?.includes("text/html"), url.pathname + url.search);
    }
    const assetsResponse = await handleMotorstack(request, env);
    if (assetsResponse) return assetsResponse;
    if (Object.hasOwn(app_routes_default, url.pathname)) {
      url.pathname = app_routes_default[url.pathname];
      return Response.redirect(url.href, 302);
    }
    const asset = Object.hasOwn(compressed_default, url.pathname) ? compressed_default[url.pathname] : null;
    if (!asset) {
      const response3 = await env.ASSETS.fetch(request);
      const privateResponse = new Response(response3.body, response3);
      privateResponse.headers.set("Cache-Control", "private, no-store");
      privateResponse.headers.set("Referrer-Policy", "no-referrer");
      return privateResponse;
    }
    url.pathname = asset;
    url.search = "";
    const response2 = await env.ASSETS.fetch(new Request(url, { method: request.method }));
    if (!response2.ok) return new Response("Editor asset unavailable", { status: 503 });
    const headers = new Headers(response2.headers);
    headers.set("Content-Type", "application/wasm");
    headers.set("Content-Encoding", "br");
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Vary", "Accept-Encoding");
    headers.delete("Content-Length");
    return new Response(response2.body, { status: response2.status, headers, encodeBody: "manual" });
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
