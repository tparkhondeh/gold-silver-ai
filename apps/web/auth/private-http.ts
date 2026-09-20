import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

/** TLS is terminated by this project's existing proxy. Never trust forwarded identity/host/IP. */
export function createPrivateHttpServer(origin: string, handle: (request: Request) => Promise<Response>) {
  const expected = new URL(origin);
  if (expected.protocol !== "https:" || expected.origin !== origin) throw new Error("Invalid private origin");
  const serve = async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const fail = () => { if (!outgoing.headersSent) outgoing.writeHead(400, { "cache-control": "no-store", "content-type": "text/plain", connection: "close" }); outgoing.end("Request unavailable"); incoming.resume(); };
    try {
      const hostHeaders = incoming.rawHeaders.filter((_, index) => index % 2 === 0 && incoming.rawHeaders[index].toLowerCase() === "host");
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(incoming.socket.remoteAddress ?? "") || hostHeaders.length !== 1
        || incoming.headers.host !== expected.host || !incoming.url?.startsWith("/") || incoming.url.startsWith("//") || [...incoming.url].some(char => char === "\\" || char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
        || incoming.url.length > 8192 || !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(incoming.method ?? "")) { fail(); return; }
      const length = incoming.headers["content-length"];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > 2_097_152)) { fail(); return; }
      const headers = new Headers();
      for (const name of ["host", "cookie", "origin", "sec-fetch-site", "content-type", "content-length", "x-asha-intent", "x-asha-portfolio-request", "x-asha-managed-market", "accept"]) {
        const value = incoming.headers[name];
        if (Array.isArray(value)) { fail(); return; }
        if (value !== undefined) headers.set(name, value);
      }
      const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD" && (incoming.headers["transfer-encoding"] !== undefined || (length !== undefined && Number(length) > 0));
      if (!hasBody && (incoming.headers["transfer-encoding"] !== undefined || (length !== undefined && Number(length) > 0))) { fail(); return; }
      const controller = new AbortController();
      incoming.once("aborted", () => controller.abort());
      const timer = setTimeout(() => { controller.abort(); incoming.destroy(); }, 15_000);
      try {
        const init = { method: incoming.method, headers, signal: controller.signal, ...(hasBody ? { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: "half" } : {}) };
        const request = new Request(`${origin}${incoming.url}`, init);
        const response = await handle(request);
        if (controller.signal.aborted) { fail(); return; }
        outgoing.statusCode = response.status;
        for (const [name, value] of response.headers) if (name !== "set-cookie") outgoing.setHeader(name, value);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) outgoing.setHeader("set-cookie", cookies);
        if (incoming.method === "HEAD" || !response.body) outgoing.end();
        else {
          const stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
          stream.on("error", () => outgoing.destroy());
          outgoing.on("close", () => stream.destroy());
          stream.pipe(outgoing);
        }
        // Rejected bodies are drained only after the application has finished reading.
        incoming.resume();
      } finally { clearTimeout(timer); }
    } catch { fail(); }
  };
  const server = createServer({ maxHeaderSize: 16_384 }, (req, res) => { void serve(req, res); });
  server.headersTimeout = 5000; server.requestTimeout = 15_000; server.keepAliveTimeout = 3000; server.maxRequestsPerSocket = 100;
  server.on("clientError", (_error, socket) => { socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); });
  return server;
}
