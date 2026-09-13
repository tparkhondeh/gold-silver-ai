# Local Node compatibility — 2026-09-13

Second independent unit of the owner's active continuation. Prior raw-metal commit
`b9d3109f6b2bfe6c405f89ede3ecc61d6dc635e0` is published and all three jobs succeeded
in [run 34752898053](https://github.com/tparkhondeh/gold-silver-ai/actions/runs/34752898053).
Main remains `5c03fabb1c8090497c0b03c9059a6e51fdb91d03`.

## Transport evidence and bounded fix

Earlier no-key Navasan root HEAD timed out inside Workerd but returned 200 with
OS/Node HTTPS. A separate Node/Vite preflight now returned root 200, healthy
PostgreSQL-backed API 200, disabled market POST 403 and no-key Navasan HEAD 200.
Initial probe setup errors (wrong working directory, then dependency cache outside
the web package) were corrected in the ignored probe; neither is a provider failure.

The Windows local launcher now explicitly selects the installed Vinext Node
development runtime. No new framework, dependency, backend schema, host or provider
is selected. Its config only applies with `ASHA_LOCAL_NODE_DEV=true` and command
`serve`; builds retain the existing Worker target even if that variable is set.
The default direct development command without that flag still uses Worker.

- Enforced host 127.0.0.1, port 4174 and strictPort: no external bind or automatic
  switch to an unexpected port. Separate dependency cache prevents mixed runtimes.
- Same four response security headers as the Worker are preserved. Protected
  local database identity and financial/history locks are unchanged.
- Automated market polling remains off. Only the pre-existing explicit same-origin
  one-shot local test route may reserve quota; TLS, redirects and quota are unchanged.
- The launcher will reuse an already healthy app; stop the project-owned old Worker
  process before switching runtimes. It does not kill unknown processes.

## Verification

197 web tests passed; 4 new runtime tests cover selection, build exclusion, binding,
port fallback, headers and retained permission flags. Typecheck, lint and production
build passed; that build was also run with the Node-dev flag set to exercise its
production exclusion. Production dependency audit earlier in this same continuation
reported zero known vulnerabilities; dependencies did not change afterward.

Actual launcher restarted only this project's local app. TCP listener is precisely
127.0.0.1:4174. Root, market status and health return 200 with nosniff/no-referrer;
POST without same-origin intent returns 403. The browser's early request during
restart had a connection-refused error; a fresh tab at the same normal URL then
loaded the ready Node app successfully (not a security-warning bypass).

Browser: all eight shared views retain 1,250,000 toman; edit gold 70→71 grams changes
total to 1,260,000 and plan cost to 5,718. Exact saved V2 restore returns 1,250,000.
Raw-metal diagnostics persist unchanged across the runtime switch, and the seven
comparison methods/two folds render. The explicit Navasan test showed the cooldown
message; quota remained **8 used / 107 remaining**, no provider request or new quote.
The earlier failed reservation remains counted. Next eligibility remains
`2026-09-13T15:50:41.921Z` (19:20:41 Tehran), subject to a fresh quota check.
No claim of authenticated Navasan success: a no-key root HEAD is not a quote test.
Browser evidence is the connected in-app browser; independent external browsers
and devices remain untested. No personal data, server or hosted storage changes.

## Recovery and next gate

Verified full Git bundle before this unit:
`.cache/checkpoints/shared-metal-20260913/before-node-runtime.bundle`.
Original code and saved data are retained. To use the Worker development path,
stop only this app and run the existing direct dev command with Node-dev flag absent;
never turn off TLS checks or quota controls to restore connectivity. Temporary probe
servers on 4176 were closed. The owner app remains local, not a durable hosted service.

Next meaningful data task is one permitted Navasan request after the actual cooldown,
then real-price normalization/valuation/replay tests only if a valid snapshot arrives.
Do not claim real success in advance, auto-retry, schedule a message or buy access.
Private domain delivery needs the unresolved identity/provider decision and necessary
owner account setup under ADR 0008; no shared PIN/public exposure shortcut. Historic
bubble/regime/calibration gates still require their approved method/data evidence.
Final SHA/three-job evidence belongs to the delivery checkpoint; publication of the
prior raw-metal unit is not evidence that this follow-up passed CI.
