export const OWNER_ACCESS_LOST = "asha:owner-access-lost";

async function boundedAuthJson(response: Response): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body) throw new Error("Invalid access response");
  const reader = response.body.getReader();
  let size = 0, text = "", timer: ReturnType<typeof setTimeout> | undefined;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Access response deadline")), 5000); });
  try {
    for (let count = 0; count < 256; count++) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) {
        const value = JSON.parse(text + decoder.decode());
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid access response");
        return value;
      }
      size += chunk.value.byteLength;
      if (size > 16_384) throw new Error("Access response too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    throw new Error("Access response too fragmented");
  } catch { throw new Error("Invalid access response"); }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// Never put cookies, identities or portfolio values in an event or browser storage.
export function notifyOwnerAccessLost(response: Response) {
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(OWNER_ACCESS_LOST));
}

export async function readAccessMode(request: typeof fetch = fetch): Promise<"local" | "private" | "passkey"> {
  const response = await request("/api/access-mode", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(5000) });
  const body = await boundedAuthJson(response);
  if (response.ok && Object.keys(body).sort().join(",") === "authMethod,mode" && body.mode === "private" && body.authMethod === "passkey") return "passkey";
  if (!response.ok || Object.keys(body).length !== 1 || (body.mode !== "local" && body.mode !== "private")) throw new Error("Access mode unavailable");
  return body.mode;
}

export async function readOwnerSession(request: typeof fetch = fetch): Promise<number | null> {
  const response = await request("/auth/session", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(5000) });
  if (response.status === 401) { void response.body?.cancel().catch(() => {}); return null; }
  const body = await boundedAuthJson(response);
  if (!response.ok || Object.keys(body).sort().join(",") !== "authenticated,expiresAt,subject" || body.authenticated !== true || typeof body.subject !== "string" || typeof body.expiresAt !== "number" || !Number.isSafeInteger(body.expiresAt) || body.expiresAt <= Date.now()) throw new Error("Owner session unavailable");
  return body.expiresAt;
}

export async function ownerAction(action: "login" | "logout", request: typeof fetch = fetch): Promise<string | null> {
  const response = await request(action === "login" ? "/auth/google/start" : "/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "X-ASHA-Intent": `owner-${action}` }, signal: AbortSignal.timeout(10_000) });
  const body = await boundedAuthJson(response);
  if (!response.ok) throw new Error("Owner action unconfirmed");
  if (action === "logout") {
    if (Object.keys(body).length !== 1 || body.authenticated !== false) throw new Error("Logout unconfirmed");
    return null;
  }
  if (Object.keys(body).length !== 1 || typeof body.authorizationUrl !== "string") throw new Error("Login response denied");
  const url = new URL(body.authorizationUrl);
  if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.hash) throw new Error("Login destination denied");
  return url.href;
}
