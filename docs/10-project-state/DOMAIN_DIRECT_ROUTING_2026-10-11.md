# Exact-domain direct routing — October 11, 2026

## Scope and result

Owner authorized a safe non-window route to make only `goldsilver.wealthos.ir`
direct, leaving all other VPN settings intact. This is a device-local workaround,
not a product release, server change, or financial acceptance.

Fresh network checks reproduced valid HTTPS/HTTP200 on the physical interface,
but timeout through the system proxy and the default TUN path. The existing
v2rayN setup uses both Xray system proxy and sing-box TUN.

The installed sing-box compiler produced a binary ruleset with exactly one new
full-domain rule. The exact-host entry precedes the unchanged original rule
array. The existing
`geosite-private` routing and DNS rules now also direct this hostname. Windows
ProxyOverride was extended by only `;goldsilver.wealthos.ir`. No wildcard, IP
route, hosts override, global proxy switch, service restart or new listener was used.

## Preservation and verification

- Original ruleset bytes, original ACL, selected proxy values and three inspected
  configuration hashes were backed up in the owner's dedicated private
  `domain-route-20261011-afb70046` directory. No secrets were printed or committed.
- First publication detected changed inherited file permissions and stopped.
  Original bytes, ACL and proxy values were fully restored and verified. Revised
  publication staged the nonsecret ruleset in its original directory; exact ACL
  preservation was verified before and after successful publication.
- Native rule matching: target hostname newly matches; a subdomain, sibling,
  lookalike hostname and unrelated GitHub hostname remain unmatched. Existing
  `router.asus.com` matching is preserved. Original rules compare identically.
- Final ruleset SHA256:
  `30AB891D042D6543161679F625C45E47743D7620ECD63C6C839AA0353DBC7B02`.
- ProxyEnable, ProxyServer, PAC value and original bypass entries are unchanged.
  Windows proxy resolution (`GetProxy`) now returns direct for the exact hostname;
  subdomain, sibling, lookalike and GitHub still resolve to the original proxy.
  Explicitly forcing Xray still times out; the exception fixes the target route,
  not the unrelated proxy's connectivity. `IsBypassed` alone was inconclusive in
  this Windows .NET implementation, so actual resolved routes were compared.
  `config.json`, `configPre.json`, `guiNConfig.json` hashes and VPN process start
  times are unchanged. The locked GUI database was not read or changed; it is not
  covered by a hash comparison.
- Default-network HTTPS now succeeds without binding an interface. `/evaluation`
  returns200 with certificate validation intact. `/api/portfolio`, its export and
  `/api/managed-market` return401; `/api/local-market` returns404.
- Health still identifies private mode and deployed commit
  `d588a8cf1ac8c011097e3c550e03034a9d4a62a5`.
- Ordinary **Edge**, through the connected browser extension, opened the hosted
  evaluation with styling and working portfolio, registration and analysis
  navigation. Empty test storage remained empty; no portfolio was submitted.
- **Chrome untested:** no Chrome browser connector was available; Windows launch
  failed with `GetCursorPos: Access is denied (0x80070005)` and no targetable Chrome
  window was returned. No certificate or desktop security barrier was bypassed.
- The domain-recovery specialist independently reviewed the scoped operator and
  rollback. Its defensive recovery-verification finding was corrected. Product,
  financial and full-suite tests are not applicable to this network-only change;
  no new CI or release success is inferred from the connection check.

## Limits and recovery

### Follow-up: durable rule saved; engine activation/restart unverified

The owner subsequently requested persistence across close/reopen and updates.
The installed 7.24.8 source identifies the active SQLite `RoutingItem` record as
the proper persistent location, not geodata or generated engine configuration.
A native read-only SQLite backup was secured in the owner's dedicated private
`domain-persistent-20261011` directory. On an isolated in-memory copy, adding only
`Domain=["full:goldsilver.wealthos.ir"]`, `OutboundTag="direct"`, `Enabled=true`
after the existing UDP443 block passed preservation and rollback checks: only
the active row's `RuleSet` and `RuleNum` changed; original four rules, remaining
row fields and seven other tables remained identical. `RuleType` stays unset so
the normal engine builder can generate both exact routing and direct DNS.

**The persistent rule is now saved in the active routing record.** After the
owner reported Exit, independent process/CIM checks still found the original
v2rayN instance (PID8240, start13:29:58), Xray and sing-box. No forced termination,
elevation or UI-protection bypass was attempted. A specialist reviewed a bounded
online transaction as safe for persistence only: full-row compare-and-swap protects
current saved settings; a later cached editor could remove our addition, so its
survival must be checked rather than silently reapplied over later user changes.

The guarded operator made a fresh native SQLite backup, acquired an immediate
transaction, rechecked startup-preservation records inside that lock, and changed
only the active row's `RuleSet` and `RuleNum` (4 to 5). It checked the full expected
row, every other table and database integrity before committing. The exact-host
rule is at index1, after the unchanged UDP443 block. Database permissions and all
three GUI/generated-engine configuration files remained unchanged. Fresh separate
reads confirm the saved rule. Private `before-persistent-apply.sqlite` and
`persist-route.py` provide a guarded row-only rollback; do not restore the whole
database or delete locks/journals. No secrets or database contents entered Git.

**Activation is not yet accepted:** both generated engine files still lack the
new host rule and process start times have not changed. Elevated Windows UI is
outside the control helper's access. The existing workaround is intentionally
retained; do not confuse its successful traffic test with testing the new rule.
Fresh ordinary Edge reload opened the styled hosted evaluation. System proxy
resolution remained direct only for the target, not its subdomain, sibling or
GitHub. HTTPS returned200 with certificate validation intact. Chrome, actual
close/reopen and an actual software update remain untested.

Next: when normal app reload is possible, verify regeneration into both engines,
direct routing/DNS and unrelated-rule preservation; then test close/reopen and
remove only our earlier workaround if proven unnecessary. Do not repeat the same
Exit request without new evidence, disable updates, or create a persistence daemon.
Installed-version startup source preserves this custom rule; arbitrary future
update migrations, reset or replacement installations cannot be guaranteed.

Link: https://goldsilver.wealthos.ir/evaluation

The original workaround alone is not durable: reload may regenerate its proxy
exception and geodata updates may replace its ruleset. The saved custom routing
rule now supplies the persistent configuration, but runtime acceptance is pending
as above. Chrome and other devices are not accepted by the Edge test. Existing
evaluation storage and private-login limits remain in force.

The private backup contains `apply-route.ps1` with a guarded `-Rollback` option:
it restores only its own known bytes/proxy change, verifies original permissions,
and refuses to overwrite concurrent unrelated edits. Check current state before
using it. No backup, user record, other route or service was deleted.

Primary references: [sing-box local ruleset reload](https://sing-box.sagernet.org/configuration/rule-set/),
[full-domain rule semantics](https://sing-box.sagernet.org/configuration/rule-set/headless-rule/),
[Windows proxy refresh](https://learn.microsoft.com/en-us/windows/win32/wininet/option-flags).
Persistence references: [installed-version routing selection/startup](https://github.com/2dust/v2rayN/blob/7.24.8/v2rayN/ServiceLib/Handler/ConfigHandler.cs),
[routing editor save behavior](https://github.com/2dust/v2rayN/blob/7.24.8/v2rayN/ServiceLib/ViewModels/RoutingRuleSettingViewModel.cs).
