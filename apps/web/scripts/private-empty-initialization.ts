import { posix } from "node:path";
import { PRIVATE_LINUX_PLAN as plan, assertPrivateMetadata, privateDatabaseUrl } from "./private-linux-plan.ts";
import { parsePrivateServerConfig, parsePrivateAdministrationConfig, parsePrivateClusterAdministrationConfig } from "./private-server-config.ts";

const denied = () => Error("Empty initialization recovery denied; details withheld");
const { basename, join } = posix; // This policy names Linux paths even in portable tests.
export const INITIALIZATION_ATTEMPT_MARKER = join(plan.root, "initialization-attempted.json");
export const INITDB_STDIN_PIPELINE = '/usr/bin/cat | "$@"';

/** Literal executable/arguments only. The password belongs solely in stdin. */
export function privateInitdbInvocation() {
  return { executable: "/bin/bash", args: ["--noprofile", "--norc", "-o", "pipefail", "-c", INITDB_STDIN_PIPELINE, "asha-initdb",
    join(plan.tools, "initdb"), "--pgdata", plan.data, "--username", plan.clusterRole, "--auth-host", "scram-sha-256",
    "--auth-local", "reject", "--encoding", "UTF8", "--locale", "C", "--no-clean", "--pwfile", "/dev/stdin"] };
}

type Metadata = Parameters<typeof assertPrivateMetadata>[0];
export type EmptyInitializationLayout = {
  uid: number; entries: string[]; databaseEntries: string[];
  /** Only supplied after this process has exclusively created its attempt marker. */
  claimedAttempt?: Metadata;
  metadata: Record<"parent" | "root" | "database" | "started" | "runtime" | "administration" | "clusterAdministration", Metadata>;
};
export function assertEmptyInitializationLayout(value: EmptyInitializationLayout) {
  try {
    const expected = [plan.data, plan.started, plan.runtime, plan.administration, plan.clusterAdministration].map(path => basename(path)).sort();
    if (value.claimedAttempt) { assertPrivateMetadata(value.claimedAttempt, value.uid, "file"); expected.push(basename(INITIALIZATION_ATTEMPT_MARKER)); expected.sort(); }
    if (JSON.stringify([...value.entries].sort()) !== JSON.stringify(expected) || value.databaseEntries.length !== 0) throw denied();
    for (const key of ["parent", "root", "database"] as const) assertPrivateMetadata(value.metadata[key], value.uid, "directory");
    for (const key of ["started", "runtime", "administration", "clusterAdministration"] as const) assertPrivateMetadata(value.metadata[key], value.uid, "file");
  } catch { throw denied(); }
}

/** Accept only the exact prior fresh-preparation identity, never another cluster. */
export function inspectRetainedInitialization(value: { started: unknown; runtime: unknown; administration: unknown; clusterAdministration: unknown }, nowMs: number) {
  try {
    const marker = value.started as Record<string, unknown>;
    if (!marker || Array.isArray(marker) || Object.keys(marker).sort().join(",") !== "startedAt,state,version"
      || marker.version !== 1 || marker.state !== "preparing" || typeof marker.startedAt !== "string"
      || !Number.isFinite(nowMs) || !Number.isFinite(Date.parse(marker.startedAt))
      || new Date(marker.startedAt).toISOString() !== marker.startedAt || Date.parse(marker.startedAt) > nowMs) throw denied();
    const runtime = parsePrivateServerConfig(JSON.stringify(value.runtime));
    const administration = parsePrivateAdministrationConfig(JSON.stringify(value.administration));
    const cluster = parsePrivateClusterAdministrationConfig(JSON.stringify(value.clusterAdministration));
    if (runtime.version !== 2 || runtime.authentication !== "passkey" || runtime.origin !== plan.origin
      || runtime.ownerSubject !== plan.ownerSubject || runtime.portfolioSubject !== plan.portfolioSubject) throw denied();
    const password = (databaseUrl: string, role: string) => {
      const secret = new URL(databaseUrl).password;
      // Canonical generated URL also fixes host, port, database and exact role.
      if (privateDatabaseUrl(role, secret) !== databaseUrl) throw denied();
      return secret;
    };
    const clusterPassword = password(cluster.databaseUrl, plan.clusterRole);
    const adminPassword = password(administration.databaseUrl, plan.adminRole);
    const runtimePassword = password(runtime.databaseUrl, plan.runtimeRole);
    if (new Set([clusterPassword, adminPassword, runtimePassword]).size !== 3) throw denied();
    return { clusterPassword, adminPassword, runtimePassword };
  } catch { throw denied(); }
}
