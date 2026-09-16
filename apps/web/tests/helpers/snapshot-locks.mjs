// Deterministic Web Locks double: never a replacement used by the application.
export function createTestLocks() {
  const held = new Set();
  return { async request(name, options, callback) {
    if (options.mode !== "exclusive" || !options.ifAvailable) throw Error("unexpected lock policy");
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
}
