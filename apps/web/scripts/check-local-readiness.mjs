import { evaluateLocalHealth, validateLocalHealthUrl } from "./local-readiness.ts";

function requestedUrl(argv) {
  if (argv.length === 0) return "http://127.0.0.1:4174/api/health";
  if (argv.length === 2 && argv[0] === "--url") return argv[1];
  throw new Error("Usage: npm run ops:check-local -- [--url http://localhost:4174/api/health]");
}

try {
  const url = validateLocalHealthUrl(requestedUrl(process.argv.slice(2)));
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Local health endpoint returned HTTP ${response.status}`);
  const result = evaluateLocalHealth(await response.json());
  console.log(JSON.stringify({
    ...result,
    messageFa: result.readyForLocalEvaluation
      ? "نسخهٔ محلی برای ارزیابی آماده است؛ استفادهٔ مالی واقعی همچنان قفل است."
      : "نسخهٔ محلی آماده نیست؛ موارد خطادار را بررسی کنید.",
  }, null, 2));
  if (!result.readyForLocalEvaluation) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    readyForLocalEvaluation: false,
    financialUseBlocked: true,
    externalApiCallsMade: false,
    messageFa: "بررسی آمادگی محلی انجام نشد؛ برنامه یا پایگاه داده را بررسی کنید.",
    error: error instanceof Error ? error.message : "Unknown local readiness error",
  }, null, 2));
  process.exitCode = 1;
}
