# Asha web application

This folder contains the Persian local evaluation application for Gold/Silver AI.
It is a working decision-support interface with an explicitly synthetic laboratory;
it is not approved for real financial recommendations.

## Local commands

Use Node.js 22.13 or newer and install exactly from `package-lock.json`:

```sh
npm ci
npm run dev -- --port 4174
```

Open `http://localhost:4174/`. The non-secret health document is available at
`http://localhost:4174/api/health`.

Quality gates:

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run db:backup
npm run ops:check-local
npm run local:run
```

`npm test` builds the application, runs the unit/contract/API suites, and enforces
source-only coverage floors. `npm run test:db` requires the explicitly disposable
`asha_integration` PostgreSQL database; it never uses `DATABASE_URL` or personal
portfolio data. `npm run db:backup` creates an owner-only local backup and proves it
by restoring it into a temporary database before reporting success; it never replaces
the main database.
`npm run ops:check-local` contacts only the exact local health endpoint on port 4174;
it fails if persistence is unavailable or the financial-use lock is missing. It does
not contact a market-data provider.
On the prepared owner Windows host, `npm run local:run` is the safe one-step launcher.
It validates the protected runtime file, starts PostgreSQL, and either confirms the
existing loopback application or runs it in the foreground. It never prints the
database password; press Ctrl+C to stop a newly started web process.

## Safety boundaries

- Keep API keys and database credentials only in Git-ignored local configuration.
- Never paste credentials into chat, test fixtures, logs, or browser responses.
- Demo observations and holdings are labelled synthetic and cannot unlock real
  financial decisions.
- Historical provider calls and storage stay disabled until licensing and source
  redundancy are approved.
- Local database backups may contain sensitive holdings. They remain Git-ignored,
  unencrypted and local-only until an encrypted offsite policy is approved.
- Production identity and hosted personal data remain separate future gates.

Repository rules and current work are defined by the root `CLAUDE.md`,
`docs/10-project-state/CURRENT_STATE.md`, and `docs/10-project-state/NEXT_TASK.md`.
