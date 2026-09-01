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
```

`npm test` builds the application, runs the unit/contract/API suites, and enforces
source-only coverage floors. `npm run test:db` requires the explicitly disposable
`asha_integration` PostgreSQL database; it never uses `DATABASE_URL` or personal
portfolio data. `npm run db:backup` creates an owner-only local backup and proves it
by restoring it into a temporary database before reporting success; it never replaces
the main database.

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
