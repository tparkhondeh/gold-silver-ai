type HealthEngine = {
  id?: unknown;
  state?: unknown;
};

type HealthDocument = {
  service?: unknown;
  status?: unknown;
  release?: {
    phase?: unknown;
    stableForFinancialUse?: unknown;
  };
  engines?: unknown;
};

export type LocalReadinessCheck = {
  id: string;
  expected: string;
  actual: string;
  ok: boolean;
};

export type LocalReadinessResult = {
  readyForLocalEvaluation: boolean;
  financialUseBlocked: boolean;
  externalApiCallsMade: false;
  checks: LocalReadinessCheck[];
  violations: string[];
};

const exactEngineStates = new Map([
  ["web", "ready"],
  ["navasan-quota", "quota_ready"],
  ["navasan-history", "locked"],
  ["observation-persistence", "connected"],
  ["portfolio-persistence", "local_ready"],
  ["provenance-registry", "registry_ready"],
  ["portfolio-ledger", "ledger_ready"],
  ["scenario", "demo_only"],
  ["financial-decision", "blocked"],
]);

const permittedEngineStates = new Map([
  ["global-market", new Set(["fallback", "configured"])],
  ["iran-market", new Set(["blocked", "configured"])],
]);

function text(value: unknown) {
  return typeof value === "string" ? value : "missing";
}

export function validateLocalHealthUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Local health URL is invalid");
  }
  const allowedOrigins = new Set([
    "http://127.0.0.1:4174",
    "http://localhost:4174",
    "http://[::1]:4174",
  ]);
  if (!allowedOrigins.has(url.origin)) throw new Error("Health check may only contact localhost on port 4174");
  if (url.username || url.password || url.pathname !== "/api/health" || url.search || url.hash) {
    throw new Error("Health check URL must be the exact local /api/health endpoint");
  }
  return url;
}

export function evaluateLocalHealth(payload: unknown): LocalReadinessResult {
  const health = payload && typeof payload === "object" ? payload as HealthDocument : {};
  const violations: string[] = [];
  const checks: LocalReadinessCheck[] = [];
  const record = (id: string, expected: string, actual: unknown, ok: boolean) => {
    const normalized = text(actual);
    checks.push({ id, expected, actual: normalized, ok });
    if (!ok) violations.push(`${id}: expected ${expected}, received ${normalized}`);
  };

  record("service", "asha-web", health.service, health.service === "asha-web");
  record("status", "evaluation_only", health.status, health.status === "evaluation_only");
  record("release.phase", "phase_1_data_foundation", health.release?.phase, health.release?.phase === "phase_1_data_foundation");
  record("release.stableForFinancialUse", "false", String(health.release?.stableForFinancialUse), health.release?.stableForFinancialUse === false);

  const engines = Array.isArray(health.engines) ? health.engines as HealthEngine[] : [];
  if (!Array.isArray(health.engines)) violations.push("engines: expected an array");
  const byId = new Map<string, HealthEngine>();
  for (const engine of engines) {
    if (typeof engine?.id !== "string") continue;
    if (byId.has(engine.id)) violations.push(`engines: duplicate ${engine.id}`);
    else byId.set(engine.id, engine);
  }

  for (const [id, expected] of exactEngineStates) {
    const actual = byId.get(id)?.state;
    record(`engine.${id}`, expected, actual, actual === expected);
  }
  for (const [id, permitted] of permittedEngineStates) {
    const actual = byId.get(id)?.state;
    record(`engine.${id}`, [...permitted].join(" or "), actual, typeof actual === "string" && permitted.has(actual));
  }

  const financialUseBlocked = health.release?.stableForFinancialUse === false
    && byId.get("financial-decision")?.state === "blocked";
  return {
    readyForLocalEvaluation: violations.length === 0 && financialUseBlocked,
    financialUseBlocked,
    externalApiCallsMade: false,
    checks,
    violations,
  };
}
