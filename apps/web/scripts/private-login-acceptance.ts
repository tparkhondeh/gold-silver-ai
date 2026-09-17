// Isolated synthetic acceptance server. Never imported by the product router.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createAcceptanceOwnerIdentityGate, type IdentityAdapter } from "../auth/owner-identity.ts";
import { deniedPage, loginPage, protectedPage, providerPage } from "./private-login-pages.ts";

export const ACCEPTANCE_ORIGIN = "http://127.0.0.1:4175";
const issuer = "https://identity.invalid";
const subject = "synthetic-owner-v1";
const opaque = () => randomBytes(32).toString("base64url");
const digest = (input: string) => createHash("sha256").update(input).digest("base64url");
const headers = { "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });
const rejected = (status = 403) => json({ error: "acceptance_request_denied" }, status);
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

interface SyntheticTransaction { state: string; nonce: string; challenge: string; expiresAt: number }
interface SyntheticCode extends SyntheticTransaction { subject: string }

/** No environment, filesystem, portfolio repository, or real provider is accessed. */
export function createPrivateLoginAcceptance() {
  let offset = 0, note = "", recordReads = 0, recordWrites = 0;
  const clock = () => Date.now() + offset;
  const transactions = new Map<string, SyntheticTransaction>();
  const codes = new Map<string, SyntheticCode>();
  const prune = () => {
    for (const [key, value] of transactions) if (value.expiresAt <= clock()) transactions.delete(key);
    for (const [key, value] of codes) if (value.expiresAt <= clock()) codes.delete(key);
  };
  const adapter: IdentityAdapter = {
    issuer,
    redirectUri: `${ACCEPTANCE_ORIGIN}/auth/google/callback`,
    authorizationUrl({ state, nonce, codeChallenge }) {
      prune();
      if (transactions.size >= 256) throw Error("Acceptance capacity reached");
      const id = opaque();
      transactions.set(id, { state, nonce, challenge: codeChallenge, expiresAt: clock() + 300_000 });
      return new URL(`${issuer}/authorize?transaction=${id}`);
    },
    async exchange({ callbackUrl, state, nonce, codeVerifier }) {
      prune();
      const code = callbackUrl.searchParams.get("code") ?? "";
      const value = codes.get(code);
      codes.delete(code);
      if (!value || value.state !== state || value.nonce !== nonce || value.challenge !== digest(codeVerifier)) throw Error("Synthetic exchange denied");
      return { issuer, subject: value.subject, emailVerified: true, expiresAt: clock() + 600_000 };
    },
  };
  const gate = createAcceptanceOwnerIdentityGate({ origin: ACCEPTANCE_ORIGIN, ownerSubject: subject, adapter, clock, sessionTtlMs: 300_000 });
  const html = (render: (nonce: string) => string, status = 200) => {
    const nonce = opaque();
    return new Response(render(nonce), { status, headers: {
      ...headers, "content-type": "text/html; charset=utf-8",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
    } });
  };
  const sameOrigin = (request: Request) => request.headers.get("origin") === ACCEPTANCE_ORIGIN && request.headers.get("sec-fetch-site") === "same-origin";
  const safeBody = async (request: Request) => {
    if (!request.body) return "";
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    let deadline: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(Error("Acceptance body timed out")), 1000); });
    try {
      for (let count = 0;; count++) {
        if (count > 32) throw Error("Acceptance body too fragmented");
        const { value, done } = await Promise.race([reader.read(), expired]);
        if (done) break;
        length += value.byteLength;
        if (length > 2048) throw Error("Acceptance body too large");
        chunks.push(value);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } finally { clearTimeout(deadline!); void reader.cancel().catch(() => {}); }
  };
  async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== ACCEPTANCE_ORIGIN || request.url.length > 8192 || url.username || url.password || url.hash
        || (request.headers.has("host") && request.headers.get("host") !== new URL(ACCEPTANCE_ORIGIN).host)
        || ["forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for"].some(key => request.headers.has(key))) return rejected();
      if (url.pathname !== "/auth/google/callback" && url.pathname !== "/__test/provider" && url.search) return rejected();
      if (url.pathname === "/auth/google/start") {
        const result = await gate.begin(request);
        if (!result.ok) return result;
        const data = await result.json() as { authorizationUrl: string };
        const target = new URL(data.authorizationUrl);
        if (target.origin !== issuer || target.pathname !== "/authorize") return rejected();
        // Translate only this fake adapter's URL; real OIDC transport is never relaxed.
        const transaction = target.searchParams.get("transaction") ?? "";
        if (!validToken(transaction)) return rejected();
        return new Response(JSON.stringify({ authorizationUrl: `/__test/provider?transaction=${transaction}` }), result);
      }
      if (url.pathname === "/auth/google/callback") {
        const result = await gate.callback(request);
        if (result.status !== 401) return result;
        const denied = html(deniedPage, 401);
        for (const cookie of result.headers.getSetCookie()) denied.headers.append("set-cookie", cookie);
        return denied;
      }
      if (url.pathname === "/auth/session") return gate.session(request);
      if (url.pathname === "/auth/logout") return gate.logout(request);
      if (url.pathname === "/__test/provider") {
        prune();
        if (request.method === "GET") {
          const id = url.searchParams.get("transaction") ?? "";
          if ([...url.searchParams].length !== 1 || !validToken(id) || !transactions.has(id)) return rejected();
          return html(nonce => providerPage(nonce, id));
        }
        if (request.method !== "POST" || url.search || !sameOrigin(request)
          || request.headers.get("content-type") !== "application/x-www-form-urlencoded") return rejected();
        const form = new URLSearchParams(await safeBody(request));
        if ([...form].length !== 2 || form.getAll("transaction").length !== 1 || form.getAll("choice").length !== 1) return rejected();
        const id = form.get("transaction") ?? "", choice = form.get("choice");
        const transaction = transactions.get(id);
        if (!transaction || !["owner", "non-owner", "cancel"].includes(choice ?? "")) return rejected();
        transactions.delete(id);
        const callback = new URL(adapter.redirectUri);
        callback.searchParams.set("state", transaction.state);
        if (choice === "cancel") callback.searchParams.set("error", "access_denied");
        else {
          if (codes.size >= 256) return rejected(429);
          const code = opaque();
          codes.set(code, { ...transaction, subject: choice === "owner" ? subject : "synthetic-other-v1" });
          callback.searchParams.set("code", code);
        }
        if (request.headers.get("x-asha-intent") === "test-provider") return json({ callbackUrl: `${callback.pathname}${callback.search}` });
        return new Response(null, { status: 303, headers: { ...headers, location: `${callback.pathname}${callback.search}` } });
      }
      if (url.pathname === "/" && request.method === "GET") {
        const session = await gate.session(new Request(`${ACCEPTANCE_ORIGIN}/auth/session`, { headers: request.headers }));
        return html(session.ok ? protectedPage : loginPage);
      }
      if (url.pathname === "/api/private-test-record") {
        return gate.requireOwner(request, async () => {
          if (request.method === "GET") { recordReads++; return json({ note }); }
          if (request.method !== "PUT" || !sameOrigin(request) || request.headers.get("x-asha-intent") !== "owner-action" || request.headers.get("content-type") !== "application/json") return rejected();
          let value: Record<string, unknown>;
          try { value = JSON.parse(await safeBody(request)) as Record<string, unknown>; }
          catch { return rejected(400); }
          if (!value || typeof value !== "object" || Object.keys(value).length !== 1 || typeof value.note !== "string" || value.note.length > 120 || [...value.note].some(char => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))) return rejected(400);
          // Recheck after asynchronous body reading, before mutation.
          const session = await gate.session(new Request(`${ACCEPTANCE_ORIGIN}/auth/session`, { headers: request.headers }));
          if (!session.ok) return rejected(401);
          note = value.note; recordWrites++;
          return json({ note });
        });
      }
      if (url.pathname === "/__test/expire") {
        if (request.method !== "POST" || request.body !== null || !sameOrigin(request) || request.headers.get("x-asha-intent") !== "test-expire") return rejected();
        const session = await gate.session(new Request(`${ACCEPTANCE_ORIGIN}/auth/session`, { headers: request.headers }));
        if (!session.ok) return rejected(401);
        offset += 600_001;
        return json({ expired: true });
      }
      return rejected(404);
    } catch { return rejected(400); }
  }
  return { handle, inspect: () => ({ recordReads, recordWrites, realProviderRequests: 0, portfolioRepositoryCalls: 0 }) };
}

/** Standalone Node bridge, pinned to 127.0.0.1:4175; does not read .env files. */
export function startPrivateLoginAcceptance(): Promise<Server> {
  const harness = createPrivateLoginAcceptance();
  const server = createServer(async (incoming, outgoing) => {
    const fail = () => { outgoing.writeHead(400, headers); outgoing.end("Request denied"); };
    const deadline = setTimeout(() => incoming.destroy(), 5000);
    try {
      if (incoming.headers.host !== "127.0.0.1:4175" || !incoming.url?.startsWith("/") || incoming.url.startsWith("//")) { fail(); incoming.resume(); return; }
      const requestHeaders = new Headers();
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) requestHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 2048) { fail(); return; }
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      const request = new Request(`${ACCEPTANCE_ORIGIN}${incoming.url}`, { method: incoming.method, headers: requestHeaders, ...(body.length ? { body } : {}) });
      const response = await harness.handle(request);
      outgoing.statusCode = response.status;
      for (const [name, value] of response.headers) if (name !== "set-cookie") outgoing.setHeader(name, value);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { if (!outgoing.headersSent) fail(); else outgoing.end(); }
    finally { clearTimeout(deadline); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 40;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(4175, "127.0.0.1", () => { server.removeListener("error", reject); resolve(server); });
  });
}
