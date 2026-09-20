// Harmless temporary local download only; no file reads, credentials or cookies.
import { createServer } from "node:http";
const content = "ASHA harmless direct Save As probe. Not a credential.\n";
const server = createServer((request, response) => {
  if (request.method !== "GET" || request.headers.host !== "127.0.0.1:4176" || request.url !== "/save-as-probe.txt") {
    response.writeHead(404, { "cache-control": "no-store" }); response.end(); return;
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "content-disposition": 'attachment; filename="save-as-probe.txt"', "content-length": Buffer.byteLength(content), "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(content);
});
server.listen(4176, "127.0.0.1", () => { process.stdout.write("Harmless local Save As probe ready on port 4176. No credential operations.\n"); });
server.headersTimeout = 5000; server.requestTimeout = 5000;
server.on("error", () => { process.stderr.write("Save As probe unavailable.\n"); process.exitCode = 1; });
