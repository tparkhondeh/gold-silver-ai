// Metadata-only policy. No credential parsing, import, runtime configuration or I/O.
export const identityStorageBooleanFields = [
  "windowsSupported", "metadataComplete", "gitIgnored", "gitUntracked",
  "pathChainSafe", "ancestorMutationSafe", "privateParentSafe",
  "privateDirectoryPresent", "privateDirectorySafe", "directoryContentsExpected",
  "credentialPresent", "credentialMetadataSafe", "credentialSingleLink",
  "createdDirectories",
] as const;

export type IdentityStorageFacts = Record<typeof identityStorageBooleanFields[number], boolean>;

export function identityStorageReport(input: unknown) {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const facts = Object.fromEntries(identityStorageBooleanFields.map(key => [key, record[key] === true])) as IdentityStorageFacts;
  // Missing/mistyped facts are never interpreted as successful checks.
  facts.metadataComplete = facts.metadataComplete && identityStorageBooleanFields.every(key => typeof record[key] === "boolean");
  const baseSafe = facts.windowsSupported && facts.metadataComplete && facts.gitIgnored && facts.gitUntracked
    && facts.pathChainSafe && facts.ancestorMutationSafe && facts.privateParentSafe
    && facts.directoryContentsExpected && facts.credentialMetadataSafe && facts.credentialSingleLink;
  const ready = baseSafe && facts.privateDirectoryPresent && facts.privateDirectorySafe;
  const canPrepare = baseSafe && !facts.credentialPresent
    && (!facts.privateDirectoryPresent || facts.privateDirectorySafe);
  return {
    version: "asha.identity_storage_preflight.v1" as const,
    status: ready ? (facts.credentialPresent ? "stored_file_metadata_safe" : "ready_for_direct_save_as") : "blocked",
    ...facts,
    canPrepare,
    readyForDirectSaveAs: ready && !facts.credentialPresent,
    retainedFileMetadataSafe: ready && facts.credentialPresent,
    credentialContentValidated: false,
    runtimeConfigured: false,
    networkUsed: false,
  };
}
