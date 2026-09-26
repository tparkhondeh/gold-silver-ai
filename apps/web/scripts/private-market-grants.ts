/** Pure optional preparation plan. Never executed by the auth-only preparer.
 * Requires a separately approved account-quota cutover and operator action;
 * these two grants alone do not authorize providers or transfer credentials.
 * Do not repair unexpected privileges automatically: readiness must reject them.
 */
export function privateMarketRuntimeGrants(): readonly string[] {
  return Object.freeze([
    "GRANT SELECT, INSERT ON public.provider_request_reservations TO asha_private_runtime",
    "GRANT SELECT, INSERT, UPDATE ON public.provider_runtime_status TO asha_private_runtime",
  ]);
}
