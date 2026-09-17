import { startPrivateLoginAcceptance } from "./private-login-acceptance.ts";

try {
  const server = await startPrivateLoginAcceptance();
  process.stdout.write("Synthetic private-login acceptance: http://127.0.0.1:4175/ (no Google or portfolio access)\n");
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
} catch {
  process.stderr.write("Private-login acceptance could not start; no configuration was changed.\n");
  process.exitCode = 1;
}
