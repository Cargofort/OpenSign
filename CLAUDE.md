# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project Overview

OpenSign is an open-source e-signature platform (DocuSign alternative). This is a **Cargofort fork** that adds SSO/OAuth2 support, global email branding, SDK sign requests API, and batch document processing.

## Architecture

**Monorepo with two independent apps** (no monorepo tooling — each app has its own `package.json`):

- **`apps/OpenSign/`** — React 19 frontend (Vite, Redux Toolkit, Tailwind CSS, react-pdf, pdf-lib)
- **`apps/OpenSignServer/`** — Node.js backend (Express 5 + Parse Server 8.x, MongoDB)

**Parse Server** is the core backend framework. All business logic lives in **cloud functions** registered in `apps/OpenSignServer/cloud/main.js` (73+ functions). The database schema uses Parse classes prefixed with `contracts_` (documents, users, signatures, templates) and `partners_` (tenants, global settings).

**Docker Compose** orchestrates: server (port 8080), client (port 3000), MongoDB (port 27018), Caddy reverse proxy (ports 3001/80/443), and mailcatcher (ports 1025/1080). Caddy routes `/api/*` to the server and everything else to the client.

**File storage**: Local filesystem by default (`USE_LOCAL=true`), or S3/DigitalOcean Spaces in production. Configured via `DO_*` env vars.

## Development Commands

### Container-Only Development

Do **not** run project code, package scripts, installs, tests, linters, builds, database tools, or app servers directly on the host machine. All execution must happen inside Docker containers.

- Use host commands only to manage Docker itself, inspect files, or edit files.
- For container execution, use `docker compose exec <service> ...` in already-running containers.
- For one-off runs, use `docker compose run --rm <service> ...` when a container is not running.
- Do not run local `npm`, `node`, `jasmine`, `vite`, `mongodb-runner`, or similar project tooling on the host.

### Docker (full stack)
```bash
make build              # Build and start all containers (requires HOST_URL env var)
make up                 # Start containers without rebuilding
make down               # Stop all containers
make ssh                # Shell into the server container
```

### Frontend (`apps/OpenSign/`)
```bash
docker compose exec client npm run dev
docker compose exec client npm run build
docker compose exec client npm test
docker compose exec client npm run test:watch
```

### Backend (`apps/OpenSignServer/`)
```bash
docker compose exec server npm start
docker compose exec server npm run watch
docker compose exec server npm test
docker compose exec server npm run coverage
docker compose exec server npm run lint
docker compose exec server npm run lint-fix
```

### Root
```bash
# Pre-commit hook runs prettier on staged .js files via lint-staged
```

## Environment Setup

Copy `.env.local_dev` to `.env` for local development. Key variables:
- `REACT_APP_SERVERURL` — backend API URL (frontend)
- `REACT_APP_APPID` / `APP_ID` — must be `opensign`
- `MONGODB_URI` — MongoDB connection string
- `MASTER_KEY` — Parse Server master key
- `USE_LOCAL=true` — use local file storage instead of S3
- `PFX_BASE64` / `PASS_PHRASE` — PDF signing certificate

Frontend env vars must be prefixed with `REACT_APP_` (Vite config maps them from `process.env` to work with the CRA-era codebase).

## Fork-Specific Features (SSO, Email Branding, SDK API)

**SSO**: `apps/OpenSignServer/auth/authadapter.js` + `cloud/parsefunction/ssoLogin.js`. Configured via `REACT_APP_OAUTH_ISSUER`, `REACT_APP_OAUTH_CLIENT_ID`, `SSO_API_URL`, `SSO_USERINFO_PATH`, `SSO_ALLOWED_GROUPS`, `SSO_GROUPS_CLAIM`, `SSO_ROLE_CLAIM`.

**Global Email Branding**: `cloud/parsefunction/getGlobalEmailBranding.js` and `updateGlobalEmailBranding.js`. Stored in `partners_GlobalSettings` Parse class.

**SDK Sign Requests**: `cloud/parsefunction/sdkSignRequests.js`. OAuth2 client credentials flow for service-to-service document signing.

**Batch Documents**: `cloud/parsefunction/createBatchDocs.js`. Bulk document creation.

**Webhooks**: `utils/webhook.js` dispatches `document.signed` and `document.completed` events to `WEBHOOK_URL` with HMAC-SHA256 signing (`WEBHOOK_SECRET`). Integration points are in `cloud/parsefunction/pdf/PDF.js`. Fire-and-forget, no retries.

## Key Patterns

- Cloud functions are in `apps/OpenSignServer/cloud/parsefunction/` and registered in `cloud/main.js`
- Custom HTTP routes are in `apps/OpenSignServer/cloud/customRoute/`
- Database migrations are in `apps/OpenSignServer/databases/migrations/`
- Frontend pages/routes are defined in `apps/OpenSign/src/App.jsx`
- Frontend env var access uses `process.env.REACT_APP_*` (Vite translates this at build time)
- Node version requirement: 18, 20, or 22
