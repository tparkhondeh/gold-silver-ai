import { parseEnv } from "node:util";

const requiredRuntimeKeys = new Set([
  "DATABASE_URL",
  "ASHA_OPERATOR_COMMIT_ENABLED",
  "ASHA_LOCAL_PORTFOLIO_ENABLED",
]);

export type ProtectedRuntimeEnvironment = {
  DATABASE_URL: string;
  ASHA_OPERATOR_COMMIT_ENABLED: "true";
  ASHA_LOCAL_PORTFOLIO_ENABLED: "true";
};

export function validateLocalRuntimeDatabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Protected runtime DATABASE_URL is invalid");
  }
  if (url.protocol !== "postgresql:") throw new Error("Protected runtime database must use PostgreSQL");
  if (url.hostname !== "127.0.0.1" || url.port !== "55432") {
    throw new Error("Protected runtime database must use the project loopback port");
  }
  if (url.username !== "asha_runtime" || !url.password) {
    throw new Error("Protected runtime database identity is invalid");
  }
  if (url.pathname !== "/asha_local" || url.search || url.hash) {
    throw new Error("Protected runtime database target is invalid");
  }
  return url;
}

export function parseProtectedRuntimeEnvironment(contents: string): ProtectedRuntimeEnvironment {
  const seen = new Set<string>();
  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) throw new Error("Protected runtime environment contains an invalid line");
    const key = match[1];
    if (!requiredRuntimeKeys.has(key)) throw new Error("Protected runtime environment contains an unexpected key");
    if (seen.has(key)) throw new Error("Protected runtime environment contains a duplicate key");
    seen.add(key);
  }
  if (seen.size !== requiredRuntimeKeys.size) throw new Error("Protected runtime environment is incomplete");

  const values = parseEnv(contents);
  if (values.ASHA_OPERATOR_COMMIT_ENABLED !== "true" || values.ASHA_LOCAL_PORTFOLIO_ENABLED !== "true") {
    throw new Error("Protected local persistence flags are not enabled");
  }
  if (typeof values.DATABASE_URL !== "string") throw new Error("Protected runtime DATABASE_URL is missing");
  validateLocalRuntimeDatabaseUrl(values.DATABASE_URL);
  return {
    DATABASE_URL: values.DATABASE_URL,
    ASHA_OPERATOR_COMMIT_ENABLED: "true",
    ASHA_LOCAL_PORTFOLIO_ENABLED: "true",
  };
}
