export async function isEmptyPrivateBody(request: Request) {
  if (!request.body) return true;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Body deadline")), 1000); });
  try {
    for (let chunks = 0; chunks < 8; chunks++) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) return true;
      if (chunk.value.byteLength) return false;
    }
    return false;
  } catch { return false; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
