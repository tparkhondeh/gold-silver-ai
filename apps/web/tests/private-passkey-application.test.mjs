import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateApplication } from "../auth/private-application.ts";
import { PASSKEY_PATHS } from "../auth/passkey-types.ts";
import { readAccessMode } from "../app/access-client.ts";
import { parsePrivateServerConfig, parsePrivateAdministrationConfig, readPrivateAdministrationConfig, parsePrivateClusterAdministrationConfig, readPrivateClusterAdministrationConfig } from "../scripts/private-server-config.ts";

const origin = "https://goldsilver.wealthos.ir", release = "b".repeat(40);

test("passkey private allowlist selects exactly its protocol, never Google or public registration fallback", async () => {
  const seen = [];
  const record = name => async request => { seen.push({ name, method: request.method }); return Response.json({ route: name }); };
  // Routing unit only. Actual signature, storage and authorization tests are separate.
  const gate = {
    authenticationOptions: record("auth-options"), verifyAuthentication: record("auth-verify"),
    registrationOptions: record("reg-options"), verifyRegistration: record("reg-verify"),
    session: record("session"), logout: record("logout"), requireOwner: async () => Response.json({ error: "owner_required" }, { status: 401 }),
  };
  const app = createPrivateApplication({ origin, release, gate, portfolio: async () => { throw Error("Must not be called anonymously"); }, publicUi: async () => new Response("public shell") });
  const call = (path, method = "GET") => app(new Request(origin + path, { method }));
  for (const path of Object.values(PASSKEY_PATHS)) assert.equal((await call(path, "POST")).status, 200);
  assert.deepEqual(seen.map(item => item.name), ["auth-options", "auth-verify", "reg-options", "reg-verify"]);
  for (const path of ["/auth/google/start", "/auth/google/callback", "/auth/passkey/reset", "/auth/passkey/bootstrap", "/api/operator", "/api/access-mode?mode=local"]) assert.equal((await call(path)).status, 404);
  assert.deepEqual(await (await call("/api/access-mode")).json(), { mode: "private", authMethod: "passkey" });
  assert.deepEqual(await (await call("/api/health")).json(), { mode: "private", release });
  for (const path of ["/api/portfolio", "/api/portfolio/export", "/api/managed-market"]) assert.equal((await call(path)).status, 401);
  assert.equal((await call("/auth/session")).status, 200);
  assert.equal((await call("/auth/logout", "POST")).status, 200);
});

test("administration configuration is separate, fixed-scope and never a runtime credential fallback", async () => {
  const valid = { version: 1, databaseUrl: "postgresql://asha_private_admin:synthetic@127.0.0.1:15432/asha_private" };
  assert.deepEqual(parsePrivateAdministrationConfig(JSON.stringify(valid)), valid);
  for (const changes of [{ version: 2 }, { extra: true }, { databaseUrl: valid.databaseUrl.replace("asha_private_admin", "postgres") }, { databaseUrl: valid.databaseUrl + "?sslmode=disable" }, { databaseUrl: valid.databaseUrl.replace("127.0.0.1", "remote.invalid") }]) assert.throws(() => parsePrivateAdministrationConfig(JSON.stringify({ ...valid, ...changes })), /contents withheld/);
  for (const raw of ["null", "[]", "bad", " ".repeat(16_385)]) assert.throws(() => parsePrivateAdministrationConfig(raw));
  await assert.rejects(readPrivateAdministrationConfig(), /contents withheld/);
});

test("backup cluster authority cannot substitute for runtime or migration authority", async () => {
  const valid = { version: 1, databaseUrl: "postgresql://asha_private_cluster:synthetic@127.0.0.1:15432/asha_private" };
  assert.deepEqual(parsePrivateClusterAdministrationConfig(JSON.stringify(valid)), valid);
  for (const role of ["asha_private_admin", "asha_private_runtime", "postgres"]) {
    assert.throws(() => parsePrivateClusterAdministrationConfig(JSON.stringify({ ...valid, databaseUrl: valid.databaseUrl.replace("asha_private_cluster", role) })), /contents withheld/);
  }
  assert.throws(() => parsePrivateAdministrationConfig(JSON.stringify(valid)), /contents withheld/);
  assert.throws(() => parsePrivateClusterAdministrationConfig(JSON.stringify({ ...valid, extra: true })), /contents withheld/);
  await assert.rejects(readPrivateClusterAdministrationConfig(), /contents withheld/);
});

test("browser passkey mode has one exact server envelope and cannot downgrade on unknown fields", async () => {
  const request = value => async () => Response.json(value);
  assert.equal(await readAccessMode(request({ mode: "private", authMethod: "passkey" })), "passkey");
  for (const body of [
    { mode: "local", authMethod: "passkey" }, { mode: "private", authMethod: "password" },
    { mode: "private", authMethod: "passkey", owner: "synthetic" }, { authMethod: "passkey" },
  ]) await assert.rejects(readAccessMode(request(body)));
});

test("versioned passkey server configuration has no external identity secret or auto-enrollment switch", () => {
  const valid = { version: 2, authentication: "passkey", origin, ownerSubject: "synthetic-owner", portfolioSubject: "synthetic-hosted-owner", databaseUrl: "postgresql://asha_private_runtime:synthetic@127.0.0.1:15432/asha_private" };
  assert.deepEqual(parsePrivateServerConfig(JSON.stringify(valid)), valid);
  for (const changes of [
    { authentication: "google" }, { version: 1 }, { version: 3 }, { bootstrapToken: "synthetic" },
    { googleClientSecret: "synthetic" }, { allowSignup: true }, { ownerSubject: "" },
    { portfolioSubject: "local-owner-v1" }, { databaseUrl: valid.databaseUrl.replace("127.0.0.1", "public.invalid") },
  ]) assert.throws(() => parsePrivateServerConfig(JSON.stringify({ ...valid, ...changes })), /^Error: Private configuration invalid; contents withheld$/);
});
