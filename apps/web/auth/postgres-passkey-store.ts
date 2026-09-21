import type { SqlExecutor, TransactionRunner } from "../data/postgres-observation-repository.ts";
import { identityBindingHash, inspectOwnerIdentityBinding, OwnerAuthorizationError, PostgresOwnerIdentityStore, type OwnerIdentityBinding } from "./postgres-owner-identity-store.ts";
import { PASSKEY_CHALLENGE_TTL_MS, PASSKEY_MAX_CREDENTIALS, PASSKEY_REAUTH_TTL_MS, PasskeyRateLimitError, type PasskeyChallenge, type PasskeyCredential, type PasskeyPurpose, type PasskeyStore } from "./passkey-types.ts";

const token = /^[A-Za-z0-9_-]{43}$/;
const transports = new Set(["usb", "nfc", "ble", "internal", "hybrid"]);
const denied = () => new OwnerAuthorizationError();
function key(value: string) { if (typeof value !== "string" || !token.test(value)) throw denied(); }
function iso(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime())) throw denied();
  return new Date(value).toISOString();
}
function counter(value: number) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw denied(); }
function credentialId(value: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,1366}$/.test(value)) throw denied();
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length > 1024 || decoded.toString("base64url") !== value) throw denied();
}
function credential(input: PasskeyCredential): PasskeyCredential {
  credentialId(input.id); counter(input.counter);
  if (!(input.publicKey instanceof Uint8Array) || input.publicKey.length < 1 || input.publicKey.length > 4096
    || !Array.isArray(input.transports) || input.transports.length > 5 || new Set(input.transports).size !== input.transports.length || input.transports.some(value => !transports.has(value))
    || !["singleDevice", "multiDevice"].includes(input.deviceType) || typeof input.backedUp !== "boolean" || (input.deviceType === "singleDevice" && input.backedUp)) throw denied();
  return { id: input.id, publicKey: new Uint8Array(input.publicKey), counter: input.counter, transports: [...input.transports], deviceType: input.deviceType, backedUp: input.backedUp };
}
function binding(input: OwnerIdentityBinding) {
  const value = inspectOwnerIdentityBinding(input);
  if (value.issuer !== value.origin) throw denied();
  return value;
}
async function context<T>(runner: TransactionRunner, hash: string, work: (db: SqlExecutor) => Promise<T>) {
  return runner.transaction(async db => {
    await db.query("SET LOCAL lock_timeout = '3s'");
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
    await db.query("SELECT set_config('asha.identity_binding', $1, true)", [hash]);
    // Same order for admission, completion, logout and admin reset across workers.
    // Portfolio work holds only a session SHARE lock, never this advisory lock.
    await db.query("SELECT pg_advisory_xact_lock(174228532, 8)");
    return work(db);
  });
}
async function requireAdministrator(db: SqlExecutor) {
  // A served runtime connection must never exercise the operator helper merely
  // because it has row CRUD. Require actual ownership of all affected auth tables.
  const result = await db.query<{ count: number; owned: boolean }>(`SELECT count(*)::integer AS count,
    bool_and(c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owned
    FROM pg_class c WHERE c.oid=ANY(ARRAY['private_passkey_owners'::regclass,'private_passkey_credentials'::regclass,
      'private_passkey_bootstrap_grants'::regclass,'private_passkey_challenges'::regclass,
      'private_owner_login_transactions'::regclass,'private_owner_sessions'::regclass])`);
  if (result.rows?.[0]?.count !== 6 || result.rows[0].owned !== true) throw denied();
}
type ChallengeRow = { hash: string; purpose: PasskeyPurpose; challenge: string; owner_revision: number; created_at: Date; expires_at: Date; claimed: boolean; authority_kind: "bootstrap" | "session" | null; authority_hash: string | null };
const liveChallenge = `SELECT c.* FROM private_passkey_challenges c JOIN private_passkey_owners o ON o.binding_hash=c.binding_hash AND o.revision=c.owner_revision
  WHERE c.hash=$1 AND c.binding_hash=$2 AND c.purpose=$3 AND c.created_at<=clock_timestamp() AND c.expires_at>clock_timestamp()
    AND c.created_at<=$4::timestamptz AND c.expires_at>$4::timestamptz`;

/** Only hashed tokens and public authenticator material enter this store.
 * Missing owner state is deliberately NOT provisioned by any runtime operation.
 */
export class PostgresPasskeyStore implements PasskeyStore {
  private readonly runner: TransactionRunner;
  private readonly owner: OwnerIdentityBinding;
  private readonly hash: string;
  private readonly sessions: PostgresOwnerIdentityStore;
  constructor(runner: TransactionRunner, input: OwnerIdentityBinding) {
    this.runner = runner; this.owner = binding(input); this.hash = identityBindingHash(this.owner);
    this.sessions = new PostgresOwnerIdentityStore(runner, this.owner);
  }
  private transaction<T>(work: (db: SqlExecutor) => Promise<T>) { return context(this.runner, this.hash, work); }
  private async admission(db: SqlExecutor) {
    // Count unsuccessful, well-formed attempts too: callers return denial from
    // the transaction and throw only AFTER commit, never rolling this back.
    const result = await db.query<{ revision: number }>(`UPDATE private_passkey_owners SET
      attempts=CASE WHEN window_started_at<=clock_timestamp()-interval '5 minutes' THEN 1 ELSE attempts+1 END,
      window_started_at=CASE WHEN window_started_at<=clock_timestamp()-interval '5 minutes' THEN clock_timestamp() ELSE window_started_at END
      WHERE binding_hash=$1 AND window_started_at<=clock_timestamp()
        AND (attempts<20 OR window_started_at<=clock_timestamp()-interval '5 minutes') RETURNING revision`, [this.hash]);
    if (result.rows?.[0]) return result.rows[0].revision;
    if ((await db.query("SELECT binding_hash FROM private_passkey_owners WHERE binding_hash=$1", [this.hash])).rowCount) throw new PasskeyRateLimitError();
    return null;
  }
  private async credentials(db: SqlExecutor): Promise<PasskeyCredential[]> {
    const result = await db.query<{ id: string; public_key: Uint8Array; counter: string; transports: PasskeyCredential["transports"]; device_type: PasskeyCredential["deviceType"]; backed_up: boolean }>(
      "SELECT id,public_key,counter,transports,device_type,backed_up FROM private_passkey_credentials WHERE binding_hash=$1 ORDER BY id LIMIT 11", [this.hash]);
    if (!result.rows || result.rows.length > PASSKEY_MAX_CREDENTIALS) throw denied();
    return result.rows.map(row => credential({ id: row.id, publicKey: row.public_key, counter: Number(row.counter), transports: row.transports, deviceType: row.device_type, backedUp: row.backed_up }));
  }
  private async freshSession(db: SqlExecutor, sessionHash: string, now: number) {
    const result = await db.query(`SELECT hash FROM private_owner_sessions WHERE hash=$1 AND binding_hash=$2 AND origin=$3 AND issuer=$3 AND subject=$4 AND portfolio_subject=$5
      AND created_at<=clock_timestamp() AND expires_at>clock_timestamp() AND created_at>=clock_timestamp()-interval '5 minutes'
      AND created_at<=$6::timestamptz AND expires_at>$6::timestamptz AND created_at>=$7::timestamptz FOR SHARE`,
    [sessionHash, this.hash, this.owner.origin, this.owner.ownerSubject, this.owner.portfolioSubject, iso(now), iso(Math.max(0, now - PASSKEY_REAUTH_TTL_MS))]);
    return result.rowCount === 1;
  }
  private async authority(db: SqlExecutor, row: ChallengeRow, now: number, credentials: PasskeyCredential[]) {
    if (row.authority_kind === "session" && row.authority_hash) return this.freshSession(db, row.authority_hash, now);
    if (row.authority_kind !== "bootstrap" || !row.authority_hash || credentials.length !== 0) return false;
    const result = await db.query(`SELECT hash FROM private_passkey_bootstrap_grants WHERE binding_hash=$1 AND hash=$2 AND owner_revision=$3 AND challenge_hash=$4
      AND created_at<=clock_timestamp() AND expires_at>clock_timestamp() AND created_at<=$5::timestamptz AND expires_at>$5::timestamptz`,
    [this.hash, row.authority_hash, row.owner_revision, row.hash, iso(now)]);
    return result.rowCount === 1;
  }
  private async begin(input: { key: string; challenge: string; now: number }, authority?: Parameters<PasskeyStore["beginRegistration"]>[0]["authority"]) {
    const { key: hash, challenge, now } = input; key(hash); key(challenge); iso(now);
    const frozenAuthority = authority && { ...authority };
    if (frozenAuthority) { if (frozenAuthority.kind === "bootstrap") key(frozenAuthority.grantHash); else if (frozenAuthority.kind === "session") key(frozenAuthority.sessionHash); else throw denied(); }
    const result = await this.transaction(async db => {
      const revision = await this.admission(db); if (revision === null) return null;
      const list = await this.credentials(db);
      if (!frozenAuthority && list.length === 0) return null;
      if (frozenAuthority && list.length >= PASSKEY_MAX_CREDENTIALS) return null;
      if (frozenAuthority?.kind === "session" && !await this.freshSession(db, frozenAuthority.sessionHash, now)) return null;
      if (frozenAuthority?.kind === "bootstrap") {
        if (list.length !== 0) return null;
        const grant = await db.query(`UPDATE private_passkey_bootstrap_grants SET challenge_hash=$1 WHERE binding_hash=$2 AND hash=$3 AND owner_revision=$4 AND challenge_hash IS NULL
          AND created_at<=clock_timestamp() AND expires_at>clock_timestamp() AND created_at<=$5::timestamptz AND expires_at>$5::timestamptz RETURNING hash`, [hash, this.hash, frozenAuthority.grantHash, revision, iso(now)]);
        if (grant.rowCount !== 1) return null;
      }
      await db.query("DELETE FROM private_passkey_challenges WHERE binding_hash=$1 AND expires_at<=clock_timestamp()", [this.hash]);
      const inserted = await db.query(`INSERT INTO private_passkey_challenges (hash,binding_hash,purpose,challenge,owner_revision,created_at,expires_at,claimed,authority_kind,authority_hash)
        SELECT $1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,false,$8,$9 WHERE $6::timestamptz<=clock_timestamp() AND $7::timestamptz>clock_timestamp() RETURNING hash`,
      [hash, this.hash, frozenAuthority ? "registration" : "authentication", challenge, revision, iso(now), iso(now + PASSKEY_CHALLENGE_TTL_MS), frozenAuthority?.kind ?? null, frozenAuthority ? frozenAuthority.kind === "bootstrap" ? frozenAuthority.grantHash : frozenAuthority.sessionHash : null]);
      if (inserted.rowCount !== 1) return null;
      return { credentials: list };
    });
    if (!result) throw denied(); return result;
  }
  beginAuthentication(input: Parameters<PasskeyStore["beginAuthentication"]>[0]) { return this.begin(input); }
  beginRegistration(input: Parameters<PasskeyStore["beginRegistration"]>[0]) { return this.begin(input, input.authority); }
  async claimChallenge(hash: string, purpose: PasskeyPurpose, now: number): Promise<PasskeyChallenge | null> {
    key(hash); iso(now); if (!["authentication", "registration"].includes(purpose)) throw denied();
    return this.transaction(async db => {
      if (await this.admission(db) === null) return null;
      const result = await db.query<ChallengeRow>(`${liveChallenge} AND c.claimed=false FOR UPDATE OF c`, [hash, this.hash, purpose, iso(now)]);
      const row = result.rows?.[0]; if (!row) return null;
      const list = await this.credentials(db);
      if (purpose === "registration" && !await this.authority(db, row, now, list)) return null;
      if (purpose === "authentication" && !list.length) return null;
      await db.query("UPDATE private_passkey_challenges SET claimed=true WHERE hash=$1 AND binding_hash=$2", [hash, this.hash]);
      return { purpose, challenge: row.challenge, ownerRevision: row.owner_revision, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime(), claimed: true, credentials: list };
    });
  }
  async deleteChallenge(hash: string) { key(hash); await this.transaction(async db => { await db.query("DELETE FROM private_passkey_challenges WHERE hash=$1 AND binding_hash=$2", [hash, this.hash]); }); }
  async completeAuthentication(input: Parameters<PasskeyStore["completeAuthentication"]>[0]): Promise<boolean> {
    const value = { ...input, session: { ...input.session } }; key(value.challengeKey); key(value.sessionKey); credentialId(value.credentialId); counter(value.expectedCounter); counter(value.newCounter); iso(value.now);
    if (value.previousSessionKey !== null) key(value.previousSessionKey);
    const session = value.session; iso(session.createdAt); iso(session.expiresAt);
    if (session.issuer !== this.owner.origin || session.subject !== this.owner.ownerSubject || session.createdAt > value.now || session.expiresAt <= value.now || session.expiresAt - session.createdAt > 8 * 60 * 60_000
      || ((value.expectedCounter !== 0 || value.newCounter !== 0) && value.newCounter <= value.expectedCounter)) throw denied();
    return this.transaction(async db => {
      const challenge = await db.query<ChallengeRow>(`${liveChallenge} AND c.claimed=true FOR UPDATE OF c`, [value.challengeKey, this.hash, "authentication", iso(value.now)]);
      if (challenge.rowCount !== 1) return false;
      // Counter CAS plus owner revision closes verified-result races after reset,
      // another ceremony, or removal. Zero counters are valid for some passkeys.
      const updated = await db.query("UPDATE private_passkey_credentials SET counter=$1 WHERE binding_hash=$2 AND id=$3 AND counter=$4 RETURNING id", [value.newCounter, this.hash, value.credentialId, value.expectedCounter]);
      if (updated.rowCount !== 1) return false;
      if (value.previousSessionKey) await db.query("DELETE FROM private_owner_sessions WHERE binding_hash=$1 AND hash=$2", [this.hash, value.previousSessionKey]);
      await db.query("DELETE FROM private_owner_sessions WHERE binding_hash=$1 AND expires_at<=clock_timestamp()", [this.hash]);
      const count = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM private_owner_sessions WHERE binding_hash=$1", [this.hash]);
      if (!Number.isSafeInteger(count.rows?.[0]?.count) || count.rows![0].count >= 256) throw denied();
      const inserted = await db.query(`INSERT INTO private_owner_sessions (hash,binding_hash,login_transaction_hash,origin,issuer,subject,portfolio_subject,created_at,expires_at)
        SELECT $1,$2,$3,$4,$4,$5,$6,$7::timestamptz,$8::timestamptz FROM private_passkey_challenges c JOIN private_passkey_owners o ON o.binding_hash=c.binding_hash AND o.revision=c.owner_revision
        WHERE c.hash=$3 AND c.binding_hash=$2 AND c.claimed=true AND c.expires_at>clock_timestamp() AND c.created_at<=clock_timestamp()
          AND $7::timestamptz<=clock_timestamp() AND $8::timestamptz>clock_timestamp() RETURNING hash`,
      [value.sessionKey, this.hash, value.challengeKey, this.owner.origin, this.owner.ownerSubject, this.owner.portfolioSubject, iso(session.createdAt), iso(session.expiresAt)]);
      if (inserted.rowCount !== 1) throw denied(); // Roll back counter/previous-session changes too.
      await db.query("DELETE FROM private_passkey_challenges WHERE hash=$1 AND binding_hash=$2", [value.challengeKey, this.hash]);
      return true;
    });
  }
  async completeRegistration(input: Parameters<PasskeyStore["completeRegistration"]>[0]): Promise<boolean> {
    const hash = input.challengeKey, now = input.now, value = credential(input.credential); key(hash); iso(now);
    return this.transaction(async db => {
      const result = await db.query<ChallengeRow>(`${liveChallenge} AND c.claimed=true FOR UPDATE OF c`, [hash, this.hash, "registration", iso(now)]);
      const row = result.rows?.[0]; if (!row) return false;
      const list = await this.credentials(db);
      if (list.length >= PASSKEY_MAX_CREDENTIALS || list.some(item => item.id === value.id) || !await this.authority(db, row, now, list)) return false;
      await db.query("INSERT INTO private_passkey_credentials (binding_hash,id,public_key,counter,transports,device_type,backed_up) VALUES ($1,$2,$3,$4,$5,$6,$7)", [this.hash, value.id, Buffer.from(value.publicKey), value.counter, value.transports, value.deviceType, value.backedUp]);
      // Recheck real DB expiry after mutation; failure rolls every write back.
      if (!await this.authority(db, row, now, list) || (await db.query(`${liveChallenge} AND c.claimed=true`, [hash, this.hash, "registration", iso(now)])).rowCount !== 1) throw denied();
      await db.query("UPDATE private_passkey_owners SET revision=revision+1 WHERE binding_hash=$1", [this.hash]);
      await db.query("DELETE FROM private_passkey_challenges WHERE binding_hash=$1", [this.hash]);
      await db.query("DELETE FROM private_passkey_bootstrap_grants WHERE binding_hash=$1", [this.hash]);
      return true;
    });
  }
  getSession(hash: string, now: number) { return this.sessions.getSession(hash, now); }
  async revokeBrowser(sessionHash: string | null, challengeHash: string | null) {
    if (sessionHash !== null) key(sessionHash); if (challengeHash !== null) key(challengeHash);
    if (sessionHash === null && challengeHash === null) return;
    await this.transaction(async db => {
      await db.query("DELETE FROM private_passkey_challenges WHERE binding_hash=$1 AND (hash=$2 OR (authority_kind='session' AND authority_hash=$3))", [this.hash, challengeHash, sessionHash]);
      await db.query("DELETE FROM private_owner_sessions WHERE binding_hash=$1 AND (hash=$2 OR login_transaction_hash=$3)", [this.hash, sessionHash, challengeHash]);
    });
  }
}

/** Privileged, explicitly authorized operator action ONLY. No runtime route.
 * The caller creates/retains the random token privately and supplies only its hash.
 */
export async function issuePasskeyBootstrap(runner: TransactionRunner, input: OwnerIdentityBinding, options: { grantHash: string; now: number; expiresAt: number }): Promise<void> {
  const owner = binding(input), hash = identityBindingHash(owner), value = { ...options }; key(value.grantHash); iso(value.now); iso(value.expiresAt);
  if (value.expiresAt <= value.now || value.expiresAt - value.now > PASSKEY_CHALLENGE_TTL_MS) throw denied();
  await context(runner, hash, async db => {
    await requireAdministrator(db);
    await db.query("INSERT INTO private_passkey_owners (binding_hash,revision,window_started_at,attempts) VALUES ($1,1,clock_timestamp(),0) ON CONFLICT (binding_hash) DO NOTHING", [hash]);
    const credentials = await db.query("SELECT id FROM private_passkey_credentials WHERE binding_hash=$1 LIMIT 1", [hash]);
    const active = await db.query("SELECT hash FROM private_passkey_bootstrap_grants WHERE binding_hash=$1 AND expires_at>clock_timestamp()", [hash]);
    if (credentials.rowCount || active.rowCount) throw denied();
    await db.query("DELETE FROM private_passkey_bootstrap_grants WHERE binding_hash=$1", [hash]);
    const result = await db.query(`INSERT INTO private_passkey_bootstrap_grants (binding_hash,hash,owner_revision,created_at,expires_at,challenge_hash)
      SELECT binding_hash,$2,revision,$3::timestamptz,$4::timestamptz,NULL FROM private_passkey_owners
      WHERE binding_hash=$1 AND $3::timestamptz<=clock_timestamp() AND $4::timestamptz>clock_timestamp() RETURNING hash`, [hash, value.grantHash, iso(value.now), iso(value.expiresAt)]);
    if (result.rowCount !== 1) throw denied();
  });
}

/** Lost-all-authenticators recovery: explicit privileged action, never portfolio
 * deletion or public enrollment. Fresh bootstrap issuance is a separate action.
 */
export async function resetOwnerPasskeys(runner: TransactionRunner, input: OwnerIdentityBinding): Promise<void> {
  const hash = identityBindingHash(binding(input));
  await context(runner, hash, async db => {
    await requireAdministrator(db);
    await db.query("UPDATE private_passkey_owners SET revision=revision+1 WHERE binding_hash=$1", [hash]);
    for (const table of ["private_passkey_challenges", "private_passkey_bootstrap_grants", "private_passkey_credentials", "private_owner_login_transactions", "private_owner_sessions"]) {
      await db.query(`DELETE FROM ${table} WHERE binding_hash=$1`, [hash]);
    }
  });
}
