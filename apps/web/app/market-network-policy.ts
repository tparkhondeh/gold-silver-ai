/** Explicit opt-in is reserved for a separately authorized market-data stage. */
export function marketNetworkAllowed(environment: Record<string, string | undefined>): boolean {
  return environment.ASHA_MARKET_NETWORK_ENABLED === "true";
}

/** Older/malformed responses must not trigger a browser-side provider fallback. */
export function browserMarketFallbackAllowed(payload: unknown): boolean {
  return !!payload && typeof payload === "object"
    && "networkAllowed" in payload && payload.networkAllowed === true;
}
