import type { Plugin } from "vite";
import { RESPONSE_SECURITY_HEADERS } from "../worker/security-headers.ts";

export function localNodeDevEnabled(command: string, environment: Record<string, string | undefined>) {
  return command === "serve" && environment.ASHA_LOCAL_NODE_DEV === "true";
}

// Local compatibility alternative to Workerd, not a deployment runtime/identity gate.
// Keep the same response headers and refuse accidental external or fallback ports.
export function localNodeDev(): Plugin {
  return {
    name: "asha-loopback-node-dev", apply: "serve",
    configResolved(config) {
      if (config.server.host !== "127.0.0.1" || config.server.port !== 4174 || config.server.strictPort !== true) throw new Error("Asha Node development must remain at 127.0.0.1:4174 with strictPort");
    },
    configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(RESPONSE_SECURITY_HEADERS)) response.setHeader(name, value);
        next();
      });
    },
  };
}
