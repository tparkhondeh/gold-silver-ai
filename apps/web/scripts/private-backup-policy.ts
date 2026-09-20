// A restored backup must require fresh login, not revive revoked sessions.
export const transientIdentityTables = Object.freeze(["private_owner_login_transactions", "private_owner_sessions"]);
export const identityBackupExclusions = Object.freeze(transientIdentityTables.map(table => `--exclude-table-data=*.${table}`));
