import assert from "node:assert/strict";
import test from "node:test";

import { parseProtectedRuntimeEnvironment, validateLocalRuntimeDatabaseUrl } from "../scripts/local-app.ts";

const validRuntime = [
  "DATABASE_URL=postgresql://asha_runtime:synthetic-test-only@127.0.0.1:55432/asha_local",
  "ASHA_OPERATOR_COMMIT_ENABLED=true",
  "ASHA_LOCAL_PORTFOLIO_ENABLED=true",
  "",
].join("\n");

test("accepts only the exact protected local runtime boundary", () => {
  const values = parseProtectedRuntimeEnvironment(validRuntime);
  assert.equal(values.ASHA_OPERATOR_COMMIT_ENABLED, "true");
  assert.equal(values.ASHA_LOCAL_PORTFOLIO_ENABLED, "true");
  assert.equal(validateLocalRuntimeDatabaseUrl(values.DATABASE_URL).hostname, "127.0.0.1");
});

test("rejects missing, disabled, duplicate, unexpected, or malformed runtime keys", () => {
  for (const contents of [
    validRuntime.replace("ASHA_LOCAL_PORTFOLIO_ENABLED=true\n", ""),
    validRuntime.replace("ASHA_OPERATOR_COMMIT_ENABLED=true", "ASHA_OPERATOR_COMMIT_ENABLED=false"),
    `${validRuntime}ASHA_LOCAL_PORTFOLIO_ENABLED=true\n`,
    `${validRuntime}GOLD_API_TOKEN=must-not-be-here\n`,
    validRuntime.replace("ASHA_OPERATOR_COMMIT_ENABLED=true", "not-an-env-line"),
  ]) assert.throws(() => parseProtectedRuntimeEnvironment(contents));
});

test("rejects remote, privileged, option-bearing, or credential-free databases", () => {
  for (const value of [
    "mysql://asha_runtime:secret@127.0.0.1:55432/asha_local",
    "postgresql://asha_runtime:secret@example.com:55432/asha_local",
    "postgresql://postgres:secret@127.0.0.1:55432/asha_local",
    "postgresql://asha_runtime@127.0.0.1:55432/asha_local",
    "postgresql://asha_runtime:secret@127.0.0.1:5432/asha_local",
    "postgresql://asha_runtime:secret@127.0.0.1:55432/other",
    "postgresql://asha_runtime:secret@127.0.0.1:55432/asha_local?sslmode=disable",
    "not-a-url",
  ]) assert.throws(() => validateLocalRuntimeDatabaseUrl(value));
});
