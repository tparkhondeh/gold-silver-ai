// A restored backup must require fresh login, not revive revoked sessions.
// Passkey state is excluded too: restoring old credentials/recovery grants would
// resurrect revoked access. Every restore requires explicit fresh enrollment.
export const transientIdentityTables = Object.freeze(["private_owner_login_transactions", "private_owner_sessions", "private_passkey_owners", "private_passkey_credentials", "private_passkey_bootstrap_grants", "private_passkey_challenges"]);
export const identityBackupExclusions = Object.freeze(transientIdentityTables.map(table => `--exclude-table-data=*.${table}`));
